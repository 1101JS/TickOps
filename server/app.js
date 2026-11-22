// API de TickOps sobre PostgreSQL (base "sistema_incidencias").
// Recibe un Request estándar y devuelve un Response. El navegador nunca habla con la base de datos:
// toda petición pasa por aquí, se valida la sesión y el rol, y solo entonces se consulta la base.
// Las reglas que ya viven en la base (triggers) se respetan; sus mensajes se devuelven tal cual al usuario.
import { hashPassword, sha256Hex, signToken, verifyPassword, verifyToken } from './lib/crypto.js'

const SESSION_COOKIE = 'tickops_session'
const SESSION_HOURS = 12
const REOPEN_BUSINESS_DAYS = 3
const LOGIN_MAX_FAILURES = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000

// Nombres de rol en la base -> clave usada por el frontend.
const ROLE_KEYS = { Administrador: 'admin', Agente: 'agent', Solicitante: 'applicant' }
const ROLE_NAMES = { admin: 'Administrador', agent: 'Agente', applicant: 'Solicitante' }
const ALL = ['admin', 'agent', 'applicant']
const STAFF = ['admin', 'agent']

// Cambios de estado que puede hacer quien gestiona la incidencia (admin o agente del departamento).
const MANAGER_FLOW = {
  Pendiente: ['En Proceso', 'Rechazado'],
  'En Proceso': ['Pendiente', 'Resuelto', 'Rechazado'],
  Resuelto: ['En Proceso', 'Cerrado']
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// ---------- Utilidades ----------

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  })
}

function text(value, field, { max = 200, required = true } = {}) {
  const result = typeof value === 'string' ? value.trim() : ''
  if (required && !result) throw new HttpError(400, `El campo "${field}" es obligatorio.`)
  if (result.length > max) throw new HttpError(400, `El campo "${field}" supera ${max} caracteres.`)
  return result
}

function intId(value, field) {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new HttpError(400, `El campo "${field}" no es válido.`)
  return number
}

function email(value) {
  const result = text(value, 'correo', { max: 120 }).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, 'El correo no tiene un formato válido.')
  return result
}

function newPassword(value) {
  const result = typeof value === 'string' ? value : ''
  if (result.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.')
  if (result.length > 200) throw new HttpError(400, 'La contraseña es demasiado larga.')
  return result
}

function parseCookies(header) {
  const cookies = {}
  for (const part of (header || '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return cookies
}

function sessionCookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    throw new HttpError(415, 'Se esperaba un cuerpo JSON.')
  }
  let data
  try {
    data = await request.json()
  } catch {
    throw new HttpError(400, 'JSON inválido.')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Se esperaba un objeto JSON.')
  return data
}

// Traduce errores de PostgreSQL a respuestas comprensibles.
function fromDbError(error) {
  if (error.code === 'P0001') return new HttpError(409, error.message.replace(/^Regla de negocio:\s*/i, ''))
  if (error.code === '23505') {
    return new HttpError(409, error.constraint === 'usuarios_correo_key' ? 'Ya existe un usuario con ese correo.' : 'Ya existe un registro con esos datos.')
  }
  if (error.code === '23503') return new HttpError(400, 'Uno de los datos relacionados no existe.')
  if (error.code === '23514') return new HttpError(400, 'Algún dato no cumple las reglas de la base de datos.')
  return null
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

// ---------- Usuarios y sesión ----------

const USER_SELECT = `
  SELECT u.id_usuario, u.nombre, u.correo, u.password_hash, u.activo, u.id_departamento, u.fecha_creacion,
         r.nombre AS rol, d.nombre AS departamento
  FROM usuarios u
  JOIN roles r ON r.id_rol = u.id_rol
  LEFT JOIN departamentos d ON d.id_departamento = u.id_departamento`

function publicUser(row) {
  return {
    id: row.id_usuario,
    nombre: row.nombre,
    correo: row.correo,
    role: ROLE_KEYS[row.rol] || null,
    rol: row.rol,
    departamentoId: row.id_departamento,
    departamento: row.departamento,
    activo: row.activo,
    fechaCreacion: row.fecha_creacion
  }
}

// Huella del hash de contraseña: al cambiar la contraseña, las sesiones anteriores dejan de valer.
async function passwordFingerprint(hash) {
  return (await sha256Hex(hash)).slice(0, 16)
}

async function createSessionToken(row, secret) {
  return signToken(
    { u: row.id_usuario, e: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600, f: await passwordFingerprint(row.password_hash) },
    secret
  )
}

async function userFromToken(db, token, secret) {
  const payload = await verifyToken(token, secret)
  if (!payload || !Number.isInteger(payload.u) || payload.e < Date.now() / 1000) return null
  const row = await db.first(`${USER_SELECT} WHERE u.id_usuario = $1 AND u.activo`, [payload.u])
  if (!row || payload.f !== (await passwordFingerprint(row.password_hash))) return null
  return publicUser(row)
}

// Límite de intentos fallidos por correo (en memoria; se reinicia al reiniciar el servidor).
const failedLogins = new Map()

function checkLoginLimit(key) {
  const entry = failedLogins.get(key)
  if (entry && entry.until > Date.now() && entry.count >= LOGIN_MAX_FAILURES) {
    const minutes = Math.ceil((entry.until - Date.now()) / 60000)
    throw new HttpError(429, `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} minuto(s).`)
  }
}

function registerLoginFailure(key) {
  const entry = failedLogins.get(key)
  if (!entry || entry.until < Date.now()) failedLogins.set(key, { count: 1, until: Date.now() + LOGIN_WINDOW_MS })
  else entry.count++
}

let dummyHash = null // para que un correo inexistente tarde lo mismo que una contraseña incorrecta

async function roleId(db, roleKey) {
  const row = await db.first('SELECT id_rol FROM roles WHERE nombre = $1', [ROLE_NAMES[roleKey]])
  if (!row) throw new HttpError(500, `No existe el rol ${ROLE_NAMES[roleKey]} en la base de datos.`)
  return row.id_rol
}

async function activeDepartment(db, id) {
  const row = await db.first('SELECT id_departamento, nombre FROM departamentos WHERE id_departamento = $1 AND activo', [intId(id, 'departamento')])
  if (!row) throw new HttpError(400, 'El departamento indicado no existe o está inactivo.')
  return row
}

async function openAssignments(db, userId) {
  const row = await db.first(
    `SELECT COUNT(*) AS total FROM incidencias i JOIN estados_incidencia e ON e.id_estado = i.id_estado
     WHERE i.id_agente = $1 AND NOT e.es_estado_final AND e.nombre <> 'Resuelto'`,
    [userId]
  )
  return row.total
}

// ---------- Incidencias ----------

const INCIDENT_SELECT = `
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
function incidentScope(user, next) {
  if (user.role === 'admin') return { sql: 'TRUE', params: [] }
  if (user.role === 'agent') {
    // El agente ve la cola de su departamento y, además, las que él mismo haya solicitado.
    return { sql: `(c.id_departamento = $${next} OR i.id_solicitante = $${next + 1})`, params: [user.departamentoId ?? -1, user.id] }
  }
  return { sql: `i.id_solicitante = $${next}`, params: [user.id] }
}

function canManage(user, row) {
  return user.role === 'admin' || (user.role === 'agent' && user.departamentoId === row.id_departamento)
}

function reopenDeadline(row) {
  return row.fecha_resolucion ? addBusinessDays(row.fecha_resolucion, REOPEN_BUSINESS_DAYS) : null
}

// Estados a los que este usuario puede llevar la incidencia ahora mismo.
function allowedTargets(user, row) {
  if (row.es_estado_final) return []
  const targets = new Set(canManage(user, row) ? MANAGER_FLOW[row.estado] || [] : [])
  if (row.id_solicitante === user.id && row.estado === 'Resuelto') {
    targets.add('Cerrado')
    const deadline = reopenDeadline(row)
    if (!deadline || new Date() <= deadline) targets.add('En Proceso')
  }
  return [...targets]
}

function shapeIncident(row, user) {
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
      comentarioInterno: manager && !row.es_estado_final,
      transferir: manager && ['Pendiente', 'En Proceso'].includes(row.estado)
    }
  }
}

async function findIncident(db, user, id, { lock = false } = {}) {
  const scope = incidentScope(user, 2)
  const row = await db.first(
    `${INCIDENT_SELECT} WHERE i.id_incidencia = $1 AND ${scope.sql}${lock ? ' FOR UPDATE OF i' : ''}`,
    [id, ...scope.params]
  )
  if (!row) throw new HttpError(404, 'Incidencia no encontrada.')
  return row
}

async function incidentDetail(db, user, id) {
  const row = await findIncident(db, user, id)
  const manager = canManage(user, row)
  const [comentarios, historial, transferencias] = await Promise.all([
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

async function estadoId(db, nombre) {
  const row = await db.first('SELECT id_estado FROM estados_incidencia WHERE nombre = $1', [nombre])
  if (!row) throw new HttpError(400, `El estado "${nombre}" no existe.`)
  return row.id_estado
}

async function activeCategory(db, id) {
  const row = await db.first(
    `SELECT c.id_categoria, c.nombre, c.id_departamento, d.nombre AS departamento
     FROM categorias c JOIN departamentos d ON d.id_departamento = c.id_departamento
     WHERE c.id_categoria = $1 AND c.activa AND d.activo`,
    [intId(id, 'categoría')]
  )
  if (!row) throw new HttpError(400, 'La categoría indicada no existe o está inactiva.')
  return row
}

async function priority(db, id) {
  const row = await db.first('SELECT id_prioridad, nombre FROM prioridades WHERE id_prioridad = $1', [intId(id, 'prioridad')])
  if (!row) throw new HttpError(400, 'La prioridad indicada no existe.')
  return row
}

// El trigger fn_registrar_historial_incidencia guarda los cambios de estado/agente, pero anota como responsable
// al agente de la incidencia. Esta función ejecuta los cambios y luego corrige el responsable y el detalle.
// Si el cambio no generó historial (p. ej. solo prioridad), agrega la entrada a mano.
async function withHistory(tx, row, actorId, detail, apply) {
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

async function validAgent(db, agentId, departmentId) {
  const agent = await db.first(
    `SELECT u.id_usuario, u.nombre FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
     WHERE u.id_usuario = $1 AND u.activo AND r.nombre = 'Agente' AND u.id_departamento = $2`,
    [agentId, departmentId]
  )
  if (!agent) throw new HttpError(400, 'El agente indicado no existe, está inactivo o no pertenece al departamento de la incidencia.')
  return agent
}

// ---------- Rutas ----------

const routes = []
function route(method, path, roles, handler) {
  const keys = []
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, key) => (keys.push(key), '(\\d+)')) + '$')
  routes.push({ method, path, pattern, keys, roles, handler })
}

route('GET', '/api/health', null, async ({ db }) => {
  const row = await db.first('SELECT current_database() AS base, NOW() AS hora')
  return json({ ok: true, base: row.base, hora: row.hora })
})

// --- Autenticación ---

route('POST', '/api/auth/login', null, async ({ db, request, body, config }) => {
  const correo = text(body.correo, 'correo', { max: 120 }).toLowerCase()
  const password = text(body.password, 'contraseña', { max: 200 })
  checkLoginLimit(correo)

  const row = await db.first(`${USER_SELECT} WHERE lower(u.correo) = $1`, [correo])
  dummyHash ??= await hashPassword('tickops-dummy', config.passwordIterations)
  const valid = await verifyPassword(password, row ? row.password_hash : dummyHash)
  if (!row || !valid) {
    registerLoginFailure(correo)
    throw new HttpError(401, 'Correo o contraseña incorrectos.')
  }
  if (!row.activo) throw new HttpError(403, 'Tu cuenta está desactivada. Contacta al administrador.')

  failedLogins.delete(correo)
  const token = await createSessionToken(row, config.sessionSecret)
  return json({ user: publicUser(row) }, 200, { 'set-cookie': sessionCookie(request, token, SESSION_HOURS * 3600) })
})

route('POST', '/api/auth/logout', null, async ({ request }) =>
  json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, '', 0) })
)

route('GET', '/api/auth/me', null, async ({ user }) => json({ user }))

route('GET', '/api/auth/config', null, async ({ config }) => json({ allowRegistration: config.allowRegistration }))

route('POST', '/api/auth/register', null, async ({ db, body, config }) => {
  if (!config.allowRegistration) throw new HttpError(403, 'El registro público está deshabilitado. Solicita tu cuenta al administrador.')
  const nombre = text(body.nombre, 'nombre', { max: 100 })
  const correo = email(body.correo)
  const hash = await hashPassword(newPassword(body.password), config.passwordIterations)
  const created = await db.first(
    'INSERT INTO usuarios (nombre, correo, password_hash, id_rol) VALUES ($1, $2, $3, $4) RETURNING id_usuario',
    [nombre, correo, hash, await roleId(db, 'applicant')]
  )
  return json({ user: publicUser(await db.first(`${USER_SELECT} WHERE u.id_usuario = $1`, [created.id_usuario])) }, 201)
})

// --- Catálogos ---

route('GET', '/api/catalogos', ALL, async ({ db }) => {
  const [departamentos, categorias, prioridades, estados] = await Promise.all([
    db.all('SELECT id_departamento, nombre, descripcion FROM departamentos WHERE activo ORDER BY nombre'),
    db.all(
      `SELECT c.id_categoria, c.nombre, c.descripcion, c.id_departamento, d.nombre AS departamento
       FROM categorias c JOIN departamentos d ON d.id_departamento = c.id_departamento
       WHERE c.activa AND d.activo ORDER BY d.nombre, c.nombre`
    ),
    db.all('SELECT id_prioridad, nombre, sla_primera_respuesta_horas, sla_resolucion_horas FROM prioridades ORDER BY id_prioridad'),
    db.all('SELECT id_estado, nombre, descripcion, es_estado_final FROM estados_incidencia ORDER BY id_estado')
  ])
  return json({
    departamentos: departamentos.map((d) => ({ id: d.id_departamento, nombre: d.nombre, descripcion: d.descripcion })),
    categorias: categorias.map((c) => ({ id: c.id_categoria, nombre: c.nombre, descripcion: c.descripcion, departamentoId: c.id_departamento, departamento: c.departamento })),
    prioridades: prioridades.map((p) => ({ id: p.id_prioridad, nombre: p.nombre, slaRespuestaHoras: p.sla_primera_respuesta_horas, slaResolucionHoras: p.sla_resolucion_horas })),
    estados: estados.map((e) => ({ id: e.id_estado, nombre: e.nombre, descripcion: e.descripcion, final: e.es_estado_final }))
  })
})

// --- Incidencias ---

route('GET', '/api/incidencias', ALL, async ({ db, user }) => {
  const scope = incidentScope(user, 1)
  const rows = await db.all(`${INCIDENT_SELECT} WHERE ${scope.sql} ORDER BY i.id_incidencia DESC`, scope.params)
  return json({ incidencias: rows.map((row) => shapeIncident(row, user)) })
})

route('GET', '/api/incidencias/:id', ALL, async ({ db, user, params }) =>
  json({ incidencia: await incidentDetail(db, user, Number(params.id)) })
)

route('POST', '/api/incidencias', ALL, async ({ db, user, body }) => {
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
  return json({ incidencia: await incidentDetail(db, user, id) }, 201)
})

// Cambios sobre una incidencia: prioridad, categoría (mismo departamento), agente y estado.
// Opcionalmente "comentario": se guarda como comentario público (de resolución si el nuevo estado es Resuelto).
route('PATCH', '/api/incidencias/:id', ALL, async ({ db, user, body, params }) => {
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
  return json({ incidencia: await incidentDetail(db, user, id) })
})

route('POST', '/api/incidencias/:id/comentarios', ALL, async ({ db, user, body, params }) => {
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
  return json({ incidencia: await incidentDetail(db, user, id) }, 201)
})

// Transferir a otro departamento eligiendo una categoría de destino.
// El trigger fn_aplicar_transferencia_departamento la regresa a Pendiente y sin agente.
route('POST', '/api/incidencias/:id/transferencias', STAFF, async ({ db, user, body, params }) => {
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
  return json({ incidencia: visible ? await incidentDetail(db, user, id) : null }, 201)
})

// --- Agentes y usuarios ---

route('GET', '/api/agentes', STAFF, async ({ db, user, url }) => {
  const requested = url.searchParams.get('departamento')
  const departmentId = user.role === 'agent' ? user.departamentoId : requested ? intId(requested, 'departamento') : null
  const rows = await db.all(
    `SELECT u.id_usuario, u.nombre, u.correo, u.id_departamento, d.nombre AS departamento,
            COUNT(i.id_incidencia) FILTER (WHERE e.nombre IN ('Pendiente', 'En Proceso')) AS carga
     FROM usuarios u
     JOIN roles r ON r.id_rol = u.id_rol
     LEFT JOIN departamentos d ON d.id_departamento = u.id_departamento
     LEFT JOIN incidencias i ON i.id_agente = u.id_usuario
     LEFT JOIN estados_incidencia e ON e.id_estado = i.id_estado
     WHERE r.nombre = 'Agente' AND u.activo AND ($1::int IS NULL OR u.id_departamento = $1)
     GROUP BY u.id_usuario, d.nombre ORDER BY d.nombre, u.nombre`,
    [departmentId]
  )
  return json({
    agentes: rows.map((r) => ({ id: r.id_usuario, nombre: r.nombre, correo: r.correo, departamentoId: r.id_departamento, departamento: r.departamento, carga: r.carga }))
  })
})

route('GET', '/api/usuarios', ['admin'], async ({ db }) => {
  const rows = await db.all(`${USER_SELECT} ORDER BY r.id_rol, u.nombre`)
  return json({ usuarios: rows.map(publicUser) })
})

route('POST', '/api/usuarios', ['admin'], async ({ db, body, config }) => {
  const role = body.role
  if (!ROLE_NAMES[role]) throw new HttpError(400, 'Rol no válido.')
  const nombre = text(body.nombre, 'nombre', { max: 100 })
  const correo = email(body.correo)
  const password = newPassword(body.password)
  const department = body.idDepartamento ? await activeDepartment(db, body.idDepartamento) : null
  if (role === 'agent' && !department) throw new HttpError(400, 'Un agente debe pertenecer a un departamento.')

  const created = await db.first(
    'INSERT INTO usuarios (nombre, correo, password_hash, id_rol, id_departamento) VALUES ($1, $2, $3, $4, $5) RETURNING id_usuario',
    [nombre, correo, await hashPassword(password, config.passwordIterations), await roleId(db, role), department?.id_departamento ?? null]
  )
  return json({ usuario: publicUser(await db.first(`${USER_SELECT} WHERE u.id_usuario = $1`, [created.id_usuario])) }, 201)
})

route('PATCH', '/api/usuarios/:id', ['admin'], async ({ db, user, body, params, config }) => {
  const id = Number(params.id)
  const current = await db.first(`${USER_SELECT} WHERE u.id_usuario = $1`, [id])
  if (!current) throw new HttpError(404, 'Usuario no encontrado.')
  const self = id === user.id
  const sets = {}

  if (body.nombre !== undefined) sets.nombre = text(body.nombre, 'nombre', { max: 100 })
  if (body.correo !== undefined) sets.correo = email(body.correo)
  if (body.password !== undefined) sets.password_hash = await hashPassword(newPassword(body.password), config.passwordIterations)

  let role = ROLE_KEYS[current.rol]
  if (body.role !== undefined && body.role !== role) {
    if (!ROLE_NAMES[body.role]) throw new HttpError(400, 'Rol no válido.')
    if (self) throw new HttpError(400, 'No puedes cambiar tu propio rol.')
    role = body.role
    sets.id_rol = await roleId(db, role)
  }

  let departmentId = current.id_departamento
  if (body.idDepartamento !== undefined) {
    departmentId = body.idDepartamento ? (await activeDepartment(db, body.idDepartamento)).id_departamento : null
    if (departmentId !== current.id_departamento) sets.id_departamento = departmentId
  }
  if (role === 'agent' && !departmentId) throw new HttpError(400, 'Un agente debe pertenecer a un departamento.')

  if (body.activo !== undefined) {
    if (typeof body.activo !== 'boolean') throw new HttpError(400, 'El campo "activo" debe ser verdadero o falso.')
    if (self && !body.activo) throw new HttpError(400, 'No puedes desactivar tu propia cuenta.')
    if (body.activo !== current.activo) sets.activo = body.activo
  }

  // Igual que el trigger que impide eliminar agentes ocupados: no se le quita la cola a quien tiene trabajo abierto.
  const losesQueue = current.rol === 'Agente' && (sets.activo === false || sets.id_rol !== undefined || sets.id_departamento !== undefined)
  if (losesQueue) {
    const pending = await openAssignments(db, id)
    if (pending > 0) throw new HttpError(409, `Este agente tiene ${pending} incidencia(s) abiertas asignadas. Reasígnalas primero.`)
  }

  const keys = Object.keys(sets)
  if (keys.length) {
    await db.run(`UPDATE usuarios SET ${keys.map((key, index) => `${key} = $${index + 2}`).join(', ')} WHERE id_usuario = $1`, [id, ...keys.map((key) => sets[key])])
  }
  return json({ usuario: publicUser(await db.first(`${USER_SELECT} WHERE u.id_usuario = $1`, [id])) })
})

// ---------- Despachador ----------

export async function handleApi(request, { db, config }) {
  try {
    const url = new URL(request.url)
    const method = request.method.toUpperCase()

    // Protección CSRF: las peticiones que modifican datos deben venir del mismo origen
    // o de un origen de confianza (TRUSTED_ORIGINS, p. ej. https://tickops.bid cuando llegan por el túnel).
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const origin = request.headers.get('origin')
      if (origin && new URL(origin).host !== url.host && !config.trustedOrigins.includes(origin)) {
        throw new HttpError(403, 'Origen no permitido.')
      }
    }

    const match = routes.find((item) => item.method === method && item.pattern.test(url.pathname))
    if (!match) {
      const exists = routes.some((item) => item.pattern.test(url.pathname))
      throw new HttpError(exists ? 405 : 404, exists ? 'Método no permitido.' : 'Ruta no encontrada.')
    }

    const values = url.pathname.match(match.pattern).slice(1)
    const params = Object.fromEntries(match.keys.map((key, index) => [key, values[index]]))
    const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE] || null
    const user = token ? await userFromToken(db, token, config.sessionSecret) : null

    if (match.roles) {
      if (!user) throw new HttpError(401, 'Debes iniciar sesión.')
      if (!match.roles.includes(user.role)) throw new HttpError(403, 'No tienes permiso para esta acción.')
    }

    const needsBody = ['POST', 'PATCH', 'PUT'].includes(method) && match.path !== '/api/auth/logout'
    const body = needsBody ? await readJson(request) : {}

    return await match.handler({ db, config, request, url, user, params, body })
  } catch (error) {
    const known = error instanceof HttpError ? error : fromDbError(error)
    if (known) return json({ error: known.message }, known.status)
    console.error(error)
    const offline = ['ECONNREFUSED', 'ENOTFOUND', '28P01', '3D000'].includes(error.code)
    return json({ error: offline ? 'No se pudo conectar con la base de datos.' : 'Error interno del servidor.' }, offline ? 503 : 500)
  }
}

export function readConfig(env = {}) {
  return {
    allowRegistration: String(env.ALLOW_REGISTRATION ?? 'false') === 'true',
    passwordIterations: Number(env.PBKDF2_ITERATIONS || 100000),
    sessionSecret: env.SESSION_SECRET || '',
    trustedOrigins: String(env.TRUSTED_ORIGINS || '').split(',').map((item) => item.trim().replace(/\/+$/, '')).filter(Boolean)
  }
}
