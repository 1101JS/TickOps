// /api/incidencias: listado, detalle, alta, cambios, comentarios y transferencias.
import { Router } from 'express'
import { HttpError, intId, text } from '../lib/http.js'
import {
  INCIDENT_SELECT, activeCategory, allowedTargets, canManage, estadoId, findIncident, incidentDetail, incidentScope, priority,
  shapeIncident, validAgent, withHistory
} from '../lib/incidents.js'
import { ALL, STAFF, numericId, requireRole } from '../middleware.js'

const router = Router()
router.param('id', numericId)

router.get('/', requireRole(ALL), async (req, res) => {
  const { db } = req.app.locals
  const { user } = req
  const scope = incidentScope(user, 1)
  const rows = await db.all(`${INCIDENT_SELECT} WHERE ${scope.sql} ORDER BY i.id_incidencia DESC`, scope.params)
  return res.json({ incidencias: rows.map((row) => shapeIncident(row, user)) })
})

router.get('/:id', requireRole(ALL), async (req, res) => {
  const { db } = req.app.locals
  const { user, params } = req
  return res.json({ incidencia: await incidentDetail(db, user, Number(params.id)) })
})

router.post('/', requireRole(ALL), async (req, res) => {
  const { db } = req.app.locals
  const { user, body } = req
  const titulo = text(body.titulo, 'título', { max: 150 })
  const descripcion = text(body.descripcion, 'descripción', { max: 5000 })
  const categoria = await activeCategory(db, body.idCategoria)
  const prioridad = await priority(db, body.idPrioridad)
  const pendiente = await estadoId(db, 'Pendiente')

  const id = await db.tx(async (tx) => {
    const created = await tx.first(
      `INSERT INTO incidencias (titulo, descripcion, id_categoria, id_prioridad, id_estado, id_solicitante)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_incidencia`,
      [titulo, descripcion, categoria.id_categoria, prioridad.id_prioridad, pendiente, user.id]
    )
    // El trigger de historial solo actúa en UPDATE; el alta se registra aquí.
    await tx.run(
      `INSERT INTO historial_incidencias (id_incidencia, id_usuario_responsable, id_estado_anterior, id_estado_nuevo, detalle)
       VALUES ($1, $2, NULL, $3, $4)`,
      [created.id_incidencia, user.id, pendiente, `Incidencia registrada en ${categoria.departamento} · ${categoria.nombre}.`]
    )
    return created.id_incidencia
  })
  return res.status(201).json({ incidencia: await incidentDetail(db, user, id) })
})

// Cambios sobre una incidencia: prioridad, categoría (mismo departamento), agente y estado.
// Opcionalmente "comentario": se guarda como comentario público (de resolución si el nuevo estado es Resuelto).
router.patch('/:id', requireRole(ALL), async (req, res) => {
  const { db } = req.app.locals
  const { user, body, params } = req
  const id = Number(params.id)
  await db.tx(async (tx) => {
    const row = await findIncident(tx, user, id, { lock: true })
    const manager = canManage(user, row)
    if (row.es_estado_final) throw new HttpError(409, `La incidencia está en estado ${row.estado} y es de solo lectura.`)

    const sets = {}
    const notes = []
    const requireManager = (what) => {
      if (!manager) throw new HttpError(403, `No tienes permiso para cambiar ${what}.`)
    }

    if (body.idPrioridad !== undefined) {
      requireManager('la prioridad')
      const prioridad = await priority(tx, body.idPrioridad)
      if (prioridad.id_prioridad !== row.id_prioridad) {
        sets.id_prioridad = prioridad.id_prioridad
        notes.push(`Prioridad: ${row.prioridad} → ${prioridad.nombre}`)
      }
    }

    if (body.idCategoria !== undefined) {
      requireManager('la categoría')
      const categoria = await activeCategory(tx, body.idCategoria)
      if (categoria.id_departamento !== row.id_departamento) {
        throw new HttpError(400, 'Esa categoría es de otro departamento. Para cambiar de departamento usa una transferencia.')
      }
      if (categoria.id_categoria !== row.id_categoria) {
        sets.id_categoria = categoria.id_categoria
        notes.push(`Categoría: ${row.categoria} → ${categoria.nombre}`)
      }
    }

    let agentId = row.id_agente
    if (body.idAgente !== undefined) {
      requireManager('el agente asignado')
      const target = body.idAgente === null || body.idAgente === '' ? null : intId(body.idAgente, 'agente')
      if (user.role === 'agent') {
        // Un agente puede tomar una incidencia libre o soltar la suya, pero no reasignar a otros.
        const allowed = (target === user.id && (row.id_agente === null || row.id_agente === user.id)) || (target === null && row.id_agente === user.id)
        if (!allowed) throw new HttpError(403, 'Como agente solo puedes tomar incidencias libres o soltar las tuyas.')
      }
      if (target !== row.id_agente) {
        const agent = target === null ? null : await validAgent(tx, target, row.id_departamento)
        sets.id_agente = target
        agentId = target
        notes.push(agent ? `Asignada a ${agent.nombre}` : 'Se quitó el agente asignado')
      }
    }

    let target = row.estado
    if (body.estado !== undefined) {
      target = text(body.estado, 'estado', { max: 30 })
    } else if (sets.id_agente !== undefined) {
      // Asignar una incidencia pendiente la pone En Proceso; quitarle el agente la regresa a Pendiente.
      if (agentId && row.estado === 'Pendiente') target = 'En Proceso'
      if (!agentId && row.estado === 'En Proceso') target = 'Pendiente'
    }

    const comentario = text(body.comentario, 'comentario', { max: 5000, required: false })
    if (target !== row.estado) {
      if (!allowedTargets(user, row).includes(target)) {
        throw new HttpError(409, `No puedes cambiar la incidencia de ${row.estado} a ${target}.`)
      }
      const ownerReopening = !manager && target === 'En Proceso'
      if ((target === 'Rechazado' || ownerReopening) && !comentario) {
        throw new HttpError(400, target === 'Rechazado' ? 'Indica el motivo del rechazo.' : 'Indica por qué reabres la incidencia.')
      }
      if (target === 'En Proceso' && !agentId) {
        if (user.role === 'agent' && manager) {
          sets.id_agente = user.id
          agentId = user.id
          notes.push(`Asignada a ${user.nombre}`)
        } else if (ownerReopening) {
          target = 'Pendiente' // sin agente, la reapertura vuelve a la cola
        } else {
          throw new HttpError(400, 'Asigna un agente antes de poner la incidencia En Proceso.')
        }
      }
      if (target !== row.estado) {
        sets.id_estado = await estadoId(tx, target)
        notes.push(`Estado: ${row.estado} → ${target}`)
      }
    }

    if (!Object.keys(sets).length && !comentario) return

    if (comentario) {
      await tx.run(
        'INSERT INTO comentarios (id_incidencia, id_usuario, contenido, es_resolucion) VALUES ($1, $2, $3, $4)',
        [id, user.id, comentario, target === 'Resuelto']
      )
    }
    if (!Object.keys(sets).length) return

    const keys = Object.keys(sets)
    const assignments = keys.map((key, index) => `${key} = $${index + 2}`)
    // La primera respuesta del equipo de soporte cuenta para el SLA.
    if (manager) assignments.push('fecha_primera_respuesta = COALESCE(fecha_primera_respuesta, CURRENT_TIMESTAMP)')
    await withHistory(tx, row, user.id, notes.join('. ') + '.', () =>
      tx.run(`UPDATE incidencias SET ${assignments.join(', ')} WHERE id_incidencia = $1`, [id, ...keys.map((key) => sets[key])])
    )
  })
  return res.json({ incidencia: await incidentDetail(db, user, id) })
})

router.post('/:id/comentarios', requireRole(ALL), async (req, res) => {
  const { db } = req.app.locals
  const { user, body, params } = req
  const id = Number(params.id)
  const contenido = text(body.contenido, 'comentario', { max: 5000 })
  await db.tx(async (tx) => {
    const row = await findIncident(tx, user, id, { lock: true })
    const manager = canManage(user, row)
    if (row.es_estado_final) throw new HttpError(409, `La incidencia está en estado ${row.estado} y es de solo lectura.`)
    const esInterno = body.esInterno === true
    const esResolucion = body.esResolucion === true
    if ((esInterno || esResolucion) && !manager) throw new HttpError(403, 'Solo el equipo de soporte puede agregar notas internas o de resolución.')
    if (esInterno && esResolucion) throw new HttpError(400, 'Un comentario de resolución no puede ser interno.')

    await tx.run(
      'INSERT INTO comentarios (id_incidencia, id_usuario, contenido, es_interno, es_resolucion) VALUES ($1, $2, $3, $4, $5)',
      [id, user.id, contenido, esInterno, esResolucion]
    )
    if (manager && !esInterno && !row.fecha_primera_respuesta) {
      await tx.run('UPDATE incidencias SET fecha_primera_respuesta = CURRENT_TIMESTAMP WHERE id_incidencia = $1', [id])
    }
  })
  return res.status(201).json({ incidencia: await incidentDetail(db, user, id) })
})

// Transferir a otro departamento eligiendo una categoría de destino.
// El trigger fn_aplicar_transferencia_departamento la regresa a Pendiente y sin agente.
router.post('/:id/transferencias', requireRole(STAFF), async (req, res) => {
  const { db } = req.app.locals
  const { user, body, params } = req
  const id = Number(params.id)
  const motivo = text(body.motivo, 'motivo', { max: 2000 })
  const destino = await activeCategory(db, body.idCategoria)

  await db.tx(async (tx) => {
    const row = await findIncident(tx, user, id, { lock: true })
    if (!canManage(user, row)) throw new HttpError(403, 'Solo puedes transferir incidencias de tu departamento.')
    if (!['Pendiente', 'En Proceso'].includes(row.estado)) throw new HttpError(409, `No se puede transferir una incidencia en estado ${row.estado}.`)
    if (destino.id_departamento === row.id_departamento) throw new HttpError(400, 'Elige una categoría de otro departamento.')

    await withHistory(tx, row, user.id, `Transferida de ${row.departamento} a ${destino.departamento} (${destino.nombre}). Motivo: ${motivo}`, async () => {
      await tx.run(
        `INSERT INTO transferencias_departamento (id_incidencia, id_departamento_origen, id_departamento_destino, id_usuario_transfiere, motivo)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, row.id_departamento, destino.id_departamento, user.id, motivo]
      )
      await tx.run('UPDATE incidencias SET id_categoria = $2 WHERE id_incidencia = $1', [id, destino.id_categoria])
    })
  })

  // Si el agente ya no pertenece al nuevo departamento, deja de ver la incidencia.
  const visible = await db.first(`${INCIDENT_SELECT} WHERE i.id_incidencia = $1 AND ${incidentScope(user, 2).sql}`, [id, ...incidentScope(user, 2).params])
  return res.status(201).json({ incidencia: visible ? await incidentDetail(db, user, id) : null })
})

export default router
