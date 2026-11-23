// /api/incidencias/:id/relacion y /api/incidencias/:id/relacionadas: relacionar incidencias duplicadas o
// causadas por un problema raíz, y resolver o cerrar de una vez las relacionadas cuando se soluciona la principal.
// Se monta dentro del router de incidencias, así que la vista del administrador (X-Vista) también aplica aquí.
import { Router } from 'express'
import { HttpError, intId, text } from '../lib/http.js'
import {
  INCIDENT_SELECT, RELATION_TYPES, canManage, estadoId, findIncident, incidentDetail, validAgent, withHistory
} from '../lib/incidents.js'
import { STAFF, requireRole } from '../middleware.js'

const router = Router({ mergeParams: true })

// Bloquea las dos incidencias en orden de id (evita bloqueos cruzados y cadenas creadas a la vez).
async function lockPair(tx, user, childId, principalId) {
  const rows = {}
  for (const id of [childId, principalId].sort((a, b) => a - b)) rows[id] = await findIncident(tx, user, id, { lock: true })
  return { child: rows[childId], principal: rows[principalId] }
}

// Entrada de historial sin cambio de estado ni de agente (solo el detalle).
async function note(tx, row, actorId, detail) {
  await withHistory(tx, row, actorId, detail, async () => {})
}

router.put('/relacion', requireRole(STAFF), async (req, res) => {
  const { db } = req.app.locals
  const { user, body } = req
  const childId = Number(req.params.id)
  const principalId = intId(body.idPrincipal, 'incidencia principal')
  const tipo = body.tipo
  if (!Object.hasOwn(RELATION_TYPES, tipo)) throw new HttpError(400, 'El tipo de relación debe ser "duplicada" o "causa_raiz".')
  if (principalId === childId) throw new HttpError(400, 'Una incidencia no puede relacionarse consigo misma.')

  await db.tx(async (tx) => {
    // findIncident aplica el alcance del rol: la principal debe ser visible para quien relaciona.
    const { child, principal } = await lockPair(tx, user, childId, principalId)
    if (!canManage(user, child)) throw new HttpError(403, 'Solo puedes relacionar incidencias de tu departamento.')
    if (child.es_estado_final) throw new HttpError(409, `La incidencia #${childId} está en estado ${child.estado} y es de solo lectura.`)
    if (principal.id_principal) {
      throw new HttpError(409, `La incidencia #${principalId} ya está relacionada con la #${principal.id_principal}; relaciónala con esa directamente.`)
    }
    if (child.total_relacionadas > 0) {
      throw new HttpError(409, `La incidencia #${childId} tiene ${child.total_relacionadas} incidencia(s) relacionada(s); no puede depender de otra.`)
    }
    if (child.id_principal === principalId && child.tipo_relacion === tipo) return

    const previous = child.id_principal
    await tx.run(
      `INSERT INTO relaciones_incidencias (id_principal, id_relacionada, tipo, id_usuario) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id_relacionada) DO UPDATE SET id_principal = EXCLUDED.id_principal, tipo = EXCLUDED.tipo,
         id_usuario = EXCLUDED.id_usuario, fecha_creacion = CURRENT_TIMESTAMP`,
      [principalId, childId, tipo, user.id]
    )
    const moved = previous && previous !== principalId ? ` (antes con la #${previous})` : ''
    await note(tx, child, user.id, `Relacionada con la incidencia #${principalId} como ${RELATION_TYPES[tipo]}${moved}.`)
    if (previous !== principalId) {
      await note(tx, principal, user.id, `Se relacionó la incidencia #${childId} como ${RELATION_TYPES[tipo]}.`)
      if (previous) {
        const old = await tx.first(`${INCIDENT_SELECT} WHERE i.id_incidencia = $1`, [previous])
        if (old && !old.es_estado_final) await note(tx, old, user.id, `La incidencia #${childId} dejó de estar relacionada con esta.`)
      }
    }
  })
  return res.json({ incidencia: await incidentDetail(db, user, childId) })
})

router.delete('/relacion', requireRole(STAFF), async (req, res) => {
  const { db } = req.app.locals
  const { user } = req
  const childId = Number(req.params.id)
  await db.tx(async (tx) => {
    const child = await findIncident(tx, user, childId, { lock: true })
    if (!child.id_principal) throw new HttpError(409, `La incidencia #${childId} no está relacionada con otra.`)
    const principalId = child.id_principal
    // La principal puede no ser visible (otro departamento): se lee sin alcance solo para comprobar permisos.
    const principal = await tx.first(`${INCIDENT_SELECT} WHERE i.id_incidencia = $1`, [principalId])
    if (!canManage(user, child) && !canManage(user, principal)) throw new HttpError(403, 'No tienes permiso para quitar esta relación.')
    if (child.es_estado_final) throw new HttpError(409, `La incidencia #${childId} está en estado ${child.estado} y es de solo lectura.`)
    const removed = await tx.run('DELETE FROM relaciones_incidencias WHERE id_relacionada = $1 AND id_principal = $2', [childId, principalId])
    if (!removed.count) return
    await note(tx, child, user.id, `Se quitó la relación con la incidencia #${principalId}.`)
    if (!principal.es_estado_final) await note(tx, principal, user.id, `La incidencia #${childId} dejó de estar relacionada con esta.`)
  })
  return res.json({ incidencia: await incidentDetail(db, user, childId) })
})

// Resolver o cerrar de una vez las relacionadas elegidas, después de solucionar la principal.
// Todo o nada: si una no se puede, no cambia ninguna.
router.post('/relacionadas/resolver', requireRole(STAFF), async (req, res) => {
  const { db } = req.app.locals
  const { user, body } = req
  const principalId = Number(req.params.id)
  if (!['Resuelto', 'Cerrado'].includes(body.estado)) throw new HttpError(400, 'El estado debe ser "Resuelto" o "Cerrado".')
  const target = body.estado
  const comentario = text(body.comentario, 'comentario', { max: 5000 })
  if (!Array.isArray(body.ids) || !body.ids.length) throw new HttpError(400, 'Elige al menos una incidencia relacionada.')
  if (body.ids.length > 500) throw new HttpError(400, 'Demasiadas incidencias en una sola operación.')
  const ids = [...new Set(body.ids.map((value) => intId(value, 'incidencia relacionada')))].sort((a, b) => a - b)

  let updated = 0
  await db.tx(async (tx) => {
    const principal = await findIncident(tx, user, principalId, { lock: true })
    if (!['Resuelto', 'Cerrado'].includes(principal.estado)) {
      throw new HttpError(409, `Primero resuelve la incidencia principal #${principalId} (está ${principal.estado}).`)
    }
    // En secuencia: una transacción usa una sola conexión.
    const enProceso = await estadoId(tx, 'En Proceso')
    const resuelto = await estadoId(tx, 'Resuelto')
    const cerrado = await estadoId(tx, 'Cerrado')
    for (const id of ids) {
      const child = await tx.first(`${INCIDENT_SELECT} WHERE i.id_incidencia = $1 FOR UPDATE OF i`, [id])
      if (!child || child.id_principal !== principalId) throw new HttpError(400, `La incidencia #${id} no está relacionada con la #${principalId}.`)
      if (!canManage(user, child)) throw new HttpError(403, `No puedes gestionar la incidencia #${id} (es de ${child.departamento}).`)
      if (child.es_estado_final) throw new HttpError(409, `La incidencia #${id} ya está en estado ${child.estado}.`)
      if (child.estado === 'Resuelto' && target === 'Resuelto') continue

      const detail = `Resuelta junto con la incidencia principal #${principalId}.`
      let row = child
      const step = async (sets, message) => {
        const keys = Object.keys(sets)
        const assignments = keys.map((key, index) => `${key} = $${index + 2}`)
        assignments.push('fecha_primera_respuesta = COALESCE(fecha_primera_respuesta, CURRENT_TIMESTAMP)')
        await withHistory(tx, row, user.id, message, () =>
          tx.run(`UPDATE incidencias SET ${assignments.join(', ')} WHERE id_incidencia = $1`, [id, ...keys.map((key) => sets[key])])
        )
        row = await tx.first(`${INCIDENT_SELECT} WHERE i.id_incidencia = $1`, [id])
      }

      if (row.estado !== 'Resuelto') {
        if (row.estado === 'Pendiente') {
          const sets = { id_estado: enProceso }
          let message = `Estado: Pendiente → En Proceso (${detail})`
          if (!row.id_agente) {
            const agent = await validAgent(tx, user.id, row.id_departamento)
            sets.id_agente = agent.id_usuario
            message = `Asignada a ${agent.nombre}. ${message}`
          }
          await step(sets, message)
        } else if (!row.id_agente) {
          const agent = await validAgent(tx, user.id, row.id_departamento)
          await step({ id_agente: agent.id_usuario }, `Asignada a ${agent.nombre} (${detail})`)
        }
        await tx.run(
          'INSERT INTO comentarios (id_incidencia, id_usuario, contenido, es_resolucion) VALUES ($1, $2, $3, TRUE)',
          [id, user.id, `${comentario}\n\n(${detail})`]
        )
        await step({ id_estado: resuelto }, `Estado: ${row.estado} → Resuelto. ${detail}`)
      }
      if (target === 'Cerrado') await step({ id_estado: cerrado }, `Estado: Resuelto → Cerrado. Cerrada junto con la incidencia principal #${principalId}.`)
      updated++
    }
  })
  return res.json({ incidencia: await incidentDetail(db, user, principalId), actualizadas: updated })
})

export default router
