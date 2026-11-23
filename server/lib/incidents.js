// Incidencias: consultas, permisos por rol, estados permitidos y forma de la respuesta.
import { shapeAttachment } from './attachments.js'
import { HttpError, intId } from './http.js'

const REOPEN_BUSINESS_DAYS = 3

// Cambios de estado que puede hacer quien gestiona la incidencia (admin o agente del departamento).
export const MANAGER_FLOW = {
  Pendiente: ['En Proceso', 'Rechazado'],
  'En Proceso': ['Pendiente', 'Resuelto', 'Rechazado'],
  Resuelto: ['En Proceso', 'Cerrado']
}

// Suma días hábiles (lunes a viernes) a una fecha.
function addBusinessDays(date, days) {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const weekday = result.getDay()
    if (weekday !== 0 && weekday !== 6) added++
  }
  return result
}

function addHours(date, hours) {
  return new Date(new Date(date).getTime() + hours * 3600000)
}

export const INCIDENT_SELECT = `
  SELECT i.id_incidencia, i.titulo, i.descripcion,
         i.id_categoria, c.nombre AS categoria, c.id_departamento, d.nombre AS departamento,
         i.id_prioridad, p.nombre AS prioridad, p.sla_primera_respuesta_horas, p.sla_resolucion_horas,
         i.id_estado, e.nombre AS estado, e.es_estado_final,
         i.id_solicitante, s.nombre AS solicitante, i.id_agente, a.nombre AS agente,
         i.fecha_creacion, i.fecha_actualizacion, i.fecha_primera_respuesta, i.fecha_resolucion, i.fecha_cierre
  FROM incidencias i
  JOIN categorias c ON c.id_categoria = i.id_categoria
  JOIN departamentos d ON d.id_departamento = c.id_departamento
  JOIN prioridades p ON p.id_prioridad = i.id_prioridad
  JOIN estados_incidencia e ON e.id_estado = i.id_estado
  JOIN usuarios s ON s.id_usuario = i.id_solicitante
  LEFT JOIN usuarios a ON a.id_usuario = i.id_agente`

// Qué incidencias puede ver cada rol. "next" es el número del siguiente parámetro ($n).
export function incidentScope(user, next) {
  if (user.role === 'admin') return { sql: 'TRUE', params: [] }
  if (user.role === 'agent') {
    // El agente ve la cola de su departamento y, además, las que él mismo haya solicitado.
    return { sql: `(c.id_departamento = $${next} OR i.id_solicitante = $${next + 1})`, params: [user.departamentoId ?? -1, user.id] }
  }
  return { sql: `i.id_solicitante = $${next}`, params: [user.id] }
}

export function canManage(user, row) {
  return user.role === 'admin' || (user.role === 'agent' && user.departamentoId === row.id_departamento)
}

export function reopenDeadline(row) {
  return row.fecha_resolucion ? addBusinessDays(row.fecha_resolucion, REOPEN_BUSINESS_DAYS) : null
}

// Estados a los que este usuario puede llevar la incidencia ahora mismo.
export function allowedTargets(user, row) {
  if (row.es_estado_final) return []
  const targets = new Set(canManage(user, row) ? MANAGER_FLOW[row.estado] || [] : [])
  if (row.id_solicitante === user.id && row.estado === 'Resuelto') {
    targets.add('Cerrado')
    const deadline = reopenDeadline(row)
    if (!deadline || new Date() <= deadline) targets.add('En Proceso')
  }
  return [...targets]
}

export function shapeIncident(row, user) {
  const manager = canManage(user, row)
  const resolutionDue = addHours(row.fecha_creacion, row.sla_resolucion_horas)
  const responseDue = addHours(row.fecha_creacion, row.sla_primera_respuesta_horas)
  const open = !row.es_estado_final && row.estado !== 'Resuelto'
  return {
    id: row.id_incidencia,
    titulo: row.titulo,
    descripcion: row.descripcion,
    categoriaId: row.id_categoria,
    categoria: row.categoria,
    departamentoId: row.id_departamento,
    departamento: row.departamento,
    prioridadId: row.id_prioridad,
    prioridad: row.prioridad,
    estadoId: row.id_estado,
    estado: row.estado,
    estadoFinal: row.es_estado_final,
    solicitanteId: row.id_solicitante,
    solicitante: row.solicitante,
    agenteId: row.id_agente,
    agente: row.agente,
    fechaCreacion: row.fecha_creacion,
    fechaActualizacion: row.fecha_actualizacion,
    fechaPrimeraRespuesta: row.fecha_primera_respuesta,
    fechaResolucion: row.fecha_resolucion,
    fechaCierre: row.fecha_cierre,
    sla: {
      primeraRespuestaHoras: row.sla_primera_respuesta_horas,
      resolucionHoras: row.sla_resolucion_horas,
      venceRespuesta: responseDue,
      venceResolucion: resolutionDue,
      respuestaVencida: !row.fecha_primera_respuesta && open && new Date() > responseDue,
      resolucionVencida: open && new Date() > resolutionDue
    },
    reabrirHasta: row.estado === 'Resuelto' ? reopenDeadline(row) : null,
    acciones: {
      gestionar: manager && !row.es_estado_final,
      estados: allowedTargets(user, row),
      comentar: !row.es_estado_final,
      adjuntar: !row.es_estado_final,
      comentarioInterno: manager && !row.es_estado_final,
      transferir: manager && ['Pendiente', 'En Proceso'].includes(row.estado)
    }
  }
}

export async function findIncident(db, user, id, { lock = false } = {}) {
  const scope = incidentScope(user, 2)
  const row = await db.first(
    `${INCIDENT_SELECT} WHERE i.id_incidencia = $1 AND ${scope.sql}${lock ? ' FOR UPDATE OF i' : ''}`,
    [id, ...scope.params]
  )
  if (!row) throw new HttpError(404, 'Incidencia no encontrada.')
  return row
}

export async function incidentDetail(db, user, id) {
  const row = await findIncident(db, user, id)
  const manager = canManage(user, row)
  const [comentarios, historial, transferencias, adjuntos] = await Promise.all([
    db.all(
      `SELECT c.id_comentario, c.contenido, c.es_interno, c.es_resolucion, c.fecha_creacion, u.id_usuario, u.nombre, r.nombre AS rol
       FROM comentarios c JOIN usuarios u ON u.id_usuario = c.id_usuario JOIN roles r ON r.id_rol = u.id_rol
       WHERE c.id_incidencia = $1 ${manager ? '' : 'AND NOT c.es_interno'}
       ORDER BY c.fecha_creacion, c.id_comentario`,
      [id]
    ),
    db.all(
      `SELECT h.id_historial, h.fecha_evento, h.detalle, ea.nombre AS estado_anterior, en.nombre AS estado_nuevo,
              aa.nombre AS agente_anterior, an.nombre AS agente_nuevo, ur.nombre AS responsable
       FROM historial_incidencias h
       LEFT JOIN estados_incidencia ea ON ea.id_estado = h.id_estado_anterior
       JOIN estados_incidencia en ON en.id_estado = h.id_estado_nuevo
       LEFT JOIN usuarios aa ON aa.id_usuario = h.id_agente_anterior
       LEFT JOIN usuarios an ON an.id_usuario = h.id_agente_nuevo
       LEFT JOIN usuarios ur ON ur.id_usuario = h.id_usuario_responsable
       WHERE h.id_incidencia = $1 ORDER BY h.fecha_evento, h.id_historial`,
      [id]
    ),
    db.all(
      `SELECT t.id_transferencia, t.motivo, t.fecha_transferencia, o.nombre AS origen, de.nombre AS destino, u.nombre AS usuario
       FROM transferencias_departamento t
       JOIN departamentos o ON o.id_departamento = t.id_departamento_origen
       JOIN departamentos de ON de.id_departamento = t.id_departamento_destino
       JOIN usuarios u ON u.id_usuario = t.id_usuario_transfiere
       WHERE t.id_incidencia = $1 ORDER BY t.fecha_transferencia, t.id_transferencia`,
      [id]
    ),
    db.all(
      `SELECT a.id_adjunto, a.nombre_archivo, a.tipo_mime, a.tamano_bytes, a.fecha_subida, a.id_usuario, u.nombre AS autor
       FROM adjuntos a JOIN usuarios u ON u.id_usuario = a.id_usuario
       WHERE a.id_incidencia = $1 ORDER BY a.fecha_subida, a.id_adjunto`,
      [id]
    )
  ])
  return {
    ...shapeIncident(row, user),
    comentarios: comentarios.map((c) => ({
      id: c.id_comentario,
      contenido: c.contenido,
      esInterno: c.es_interno,
      esResolucion: c.es_resolucion,
      fecha: c.fecha_creacion,
      autorId: c.id_usuario,
      autor: c.nombre,
      autorRol: c.rol
    })),
    historial: historial.map((h) => ({
      id: h.id_historial,
      fecha: h.fecha_evento,
      detalle: h.detalle,
      estadoAnterior: h.estado_anterior,
      estadoNuevo: h.estado_nuevo,
      agenteAnterior: h.agente_anterior,
      agenteNuevo: h.agente_nuevo,
      responsable: h.responsable
    })),
    adjuntos: adjuntos.map(shapeAttachment),
    transferencias: transferencias.map((t) => ({
      id: t.id_transferencia,
      fecha: t.fecha_transferencia,
      motivo: t.motivo,
      origen: t.origen,
      destino: t.destino,
      usuario: t.usuario
    }))
  }
}

export async function estadoId(db, nombre) {
  const row = await db.first('SELECT id_estado FROM estados_incidencia WHERE nombre = $1', [nombre])
  if (!row) throw new HttpError(400, `El estado "${nombre}" no existe.`)
  return row.id_estado
}

export async function activeCategory(db, id) {
  const row = await db.first(
    `SELECT c.id_categoria, c.nombre, c.id_departamento, d.nombre AS departamento
     FROM categorias c JOIN departamentos d ON d.id_departamento = c.id_departamento
     WHERE c.id_categoria = $1 AND c.activa AND d.activo`,
    [intId(id, 'categoría')]
  )
  if (!row) throw new HttpError(400, 'La categoría indicada no existe o está inactiva.')
  return row
}

export async function priority(db, id) {
  const row = await db.first('SELECT id_prioridad, nombre FROM prioridades WHERE id_prioridad = $1', [intId(id, 'prioridad')])
  if (!row) throw new HttpError(400, 'La prioridad indicada no existe.')
  return row
}

// El trigger fn_registrar_historial_incidencia guarda los cambios de estado/agente, pero anota como responsable
// al agente de la incidencia. Esta función ejecuta los cambios y luego corrige el responsable y el detalle.
// Si el cambio no generó historial (p. ej. solo prioridad), agrega la entrada a mano.
export async function withHistory(tx, row, actorId, detail, apply) {
  const { max } = await tx.first('SELECT COALESCE(MAX(id_historial), 0) AS max FROM historial_incidencias WHERE id_incidencia = $1', [row.id_incidencia])
  await apply()
  const updated = await tx.run(
    'UPDATE historial_incidencias SET id_usuario_responsable = $1, detalle = $2 WHERE id_incidencia = $3 AND id_historial > $4',
    [actorId, detail, row.id_incidencia, max]
  )
  if (updated.count === 0) {
    const current = await tx.first('SELECT id_estado, id_agente FROM incidencias WHERE id_incidencia = $1', [row.id_incidencia])
    await tx.run(
      `INSERT INTO historial_incidencias (id_incidencia, id_usuario_responsable, id_estado_anterior, id_estado_nuevo, id_agente_anterior, id_agente_nuevo, detalle)
       VALUES ($1, $2, $3, $3, $4, $4, $5)`,
      [row.id_incidencia, actorId, current.id_estado, current.id_agente, detail]
    )
  }
}

// Puede atender una incidencia un agente activo de su departamento o un administrador
// (el admin la toma desde su vista de agente, sin necesitar una segunda cuenta).
export async function validAgent(db, agentId, departmentId) {
  const agent = await db.first(
    `SELECT u.id_usuario, u.nombre FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
     WHERE u.id_usuario = $1 AND u.activo AND (r.nombre = 'Administrador' OR (r.nombre = 'Agente' AND u.id_departamento = $2))`,
    [agentId, departmentId]
  )
  if (!agent) throw new HttpError(400, 'El agente indicado no existe, está inactivo o no pertenece al departamento de la incidencia.')
  return agent
}
