// API de TickOps. Independiente de la plataforma: recibe un Request estándar y devuelve un Response.
// La usan server/worker.js (Cloudflare + D1) y server/node.js (LAN + SQLite).
import { hashPassword, randomToken, sha256Hex, verifyPassword } from './lib/crypto.js'
import { ensureSchema } from './schema.js'

const SESSION_COOKIE = 'tickops_session'
const SESSION_DAYS = 7
const CATEGORIES = ['Hardware', 'Software', 'Redes', 'Accesos', 'Otro']
const PRIORITIES = ['Baja', 'Media', 'Alta']
const STATUSES = ['Pendiente', 'En proceso', 'Resuelta']

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  })
}

function nowIso() {
  return new Date().toISOString()
}

function text(value, field, { max = 200, required = true } = {}) {
  const result = typeof value === 'string' ? value.trim() : ''
  if (required && !result) throw new HttpError(400, `El campo "${field}" es obligatorio.`)
  if (result.length > max) throw new HttpError(400, `El campo "${field}" supera ${max} caracteres.`)
  return result
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw new HttpError(400, `Valor no válido para "${field}".`)
  return value
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

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    displayName: user.name,
    email: user.email,
    role: user.role,
    specialty: user.specialty,
    technicianId: user.role === 'technician' ? user.id : null
  }
}

// ---------- Tickets ----------

function ticketScope(user) {
  if (user.role === 'admin') return { where: '1 = 1', params: [] }
  if (user.role === 'technician') return { where: 't.technician_id = ?', params: [user.id] }
  return { where: 't.reporter_id = ?', params: [user.id] }
}

const TICKET_SELECT = `
  SELECT t.id, t.title, t.description, t.category, t.priority, t.status, t.reporter_id, t.technician_id,
         t.created_at, t.updated_at, r.name AS reporter_name, tech.name AS technician_name
  FROM tickets t
  JOIN users r ON r.id = t.reporter_id
  LEFT JOIN users tech ON tech.id = t.technician_id`

function shapeTicket(row, updates = []) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    reporterId: row.reporter_id,
    reporter: row.reporter_name,
    technicianId: row.technician_id,
    technicianName: row.technician_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updates
  }
}

function shapeUpdate(row) {
  return { id: row.id, date: row.created_at, text: row.text, author: row.author_name || 'Sistema' }
}

async function listTickets(db, user) {
  const scope = ticketScope(user)
  const rows = await db.all(`${TICKET_SELECT} WHERE ${scope.where} ORDER BY t.id DESC`, ...scope.params)
  const updates = await db.all(
    `SELECT u.id, u.ticket_id, u.text, u.created_at, a.name AS author_name
     FROM ticket_updates u LEFT JOIN users a ON a.id = u.author_id
     WHERE u.ticket_id IN (SELECT t.id FROM tickets t WHERE ${scope.where})
     ORDER BY u.id DESC`,
    ...scope.params
  )
  const byTicket = new Map()
  for (const update of updates) {
    if (!byTicket.has(update.ticket_id)) byTicket.set(update.ticket_id, [])
    byTicket.get(update.ticket_id).push(shapeUpdate(update))
  }
  return rows.map((row) => shapeTicket(row, byTicket.get(row.id) || []))
}

async function getTicket(db, user, id) {
  const scope = ticketScope(user)
  const row = await db.first(`${TICKET_SELECT} WHERE t.id = ? AND ${scope.where}`, id, ...scope.params)
  if (!row) throw new HttpError(404, 'Incidencia no encontrada.')
  const updates = await db.all(
    `SELECT u.id, u.text, u.created_at, a.name AS author_name
     FROM ticket_updates u LEFT JOIN users a ON a.id = u.author_id
     WHERE u.ticket_id = ? ORDER BY u.id DESC`,
    id
  )
  return shapeTicket(row, updates.map(shapeUpdate))
}

async function addUpdate(db, ticketId, authorId, message) {
  await db.run('INSERT INTO ticket_updates (ticket_id, author_id, text, created_at) VALUES (?, ?, ?, ?)', ticketId, authorId, message, nowIso())
}

async function leastBusyTechnicianId(db) {
  const row = await db.first(
    `SELECT u.id FROM users u
     LEFT JOIN tickets t ON t.technician_id = u.id AND t.status <> 'Resuelta'
     WHERE u.role = 'technician' AND u.active = 1
     GROUP BY u.id ORDER BY COUNT(t.id) ASC, u.id ASC LIMIT 1`
  )
  return row ? row.id : null
}

async function technicianOrFail(db, id) {
  if (id === null || id === undefined || id === '') return null
  const tech = await db.first("SELECT id, name FROM users WHERE id = ? AND role = 'technician' AND active = 1", Number(id))
  if (!tech) throw new HttpError(400, 'El técnico indicado no existe.')
  return tech
}

// ---------- Rutas ----------

const routes = []
function route(method, path, roles, handler) {
  const keys = []
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, key) => (keys.push(key), '(\\d+)')) + '$')
  routes.push({ method, path, pattern, keys, roles, handler })
}

route('GET', '/api/health', null, async ({ db }) => {
  await db.first('SELECT 1 AS ok')
  return json({ ok: true, time: nowIso() })
})

route('POST', '/api/auth/login', null, async ({ db, request, body }) => {
  const username = text(body.username, 'usuario', { max: 64 })
  const password = text(body.password, 'contraseña', { max: 200 })
  const user = await db.first('SELECT * FROM users WHERE username = ? AND active = 1', username)
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new HttpError(401, 'Usuario o contraseña incorrectos.')
  }
  const token = randomToken()
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString()
  await db.run('DELETE FROM sessions WHERE expires_at < ?', nowIso())
  await db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', await sha256Hex(token), user.id, expires)
  return json({ user: publicUser(user) }, 200, { 'set-cookie': sessionCookie(request, token, SESSION_DAYS * 86400) })
})

route('POST', '/api/auth/logout', null, async ({ db, request, token }) => {
  if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', await sha256Hex(token))
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, '', 0) })
})

route('GET', '/api/auth/me', null, async ({ user }) => json({ user: user ? publicUser(user) : null }))

route('POST', '/api/auth/register', null, async ({ db, body, config }) => {
  if (!config.allowRegistration) throw new HttpError(403, 'El registro público está deshabilitado.')
  const name = text(body.name, 'nombre', { max: 100 })
  const username = text(body.username, 'usuario', { max: 64 })
  if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) throw new HttpError(400, 'El usuario solo admite letras, números, punto, guion y guion bajo (mín. 3).')
  const email = text(body.email, 'correo', { max: 160, required: false }) || null
  const password = text(body.password, 'contraseña', { max: 200 })
  if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.')
  if (await db.first('SELECT id FROM users WHERE username = ?', username)) throw new HttpError(409, 'Ese usuario ya existe.')
  const hash = await hashPassword(password, config.passwordIterations)
  const result = await db.run("INSERT INTO users (username, name, email, role, password_hash) VALUES (?, ?, ?, 'applicant', ?)", username, name, email, hash)
  const user = await db.first('SELECT * FROM users WHERE id = ?', result.lastId)
  return json({ user: publicUser(user) }, 201)
})

route('GET', '/api/technicians', ['admin', 'technician'], async ({ db }) => {
  const rows = await db.all(
    `SELECT u.id, u.name, u.email, u.specialty,
            SUM(CASE WHEN t.id IS NOT NULL AND t.status <> 'Resuelta' THEN 1 ELSE 0 END) AS workload
     FROM users u LEFT JOIN tickets t ON t.technician_id = u.id
     WHERE u.role = 'technician' AND u.active = 1
     GROUP BY u.id ORDER BY u.name`
  )
  return json({ technicians: rows.map((row) => ({ ...row, workload: Number(row.workload) })) })
})

route('GET', '/api/users', ['admin'], async ({ db }) => {
  const rows = await db.all('SELECT * FROM users ORDER BY role, name')
  return json({ users: rows.map((row) => ({ ...publicUser(row), active: Boolean(row.active) })) })
})

route('POST', '/api/users', ['admin'], async ({ db, body, config }) => {
  const role = oneOf(body.role, ['admin', 'technician', 'applicant'], 'rol')
  const username = text(body.username, 'usuario', { max: 64 })
  if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) throw new HttpError(400, 'Usuario no válido.')
  const password = text(body.password, 'contraseña', { max: 200 })
  if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.')
  if (await db.first('SELECT id FROM users WHERE username = ?', username)) throw new HttpError(409, 'Ese usuario ya existe.')
  const result = await db.run(
    'INSERT INTO users (username, name, email, role, specialty, password_hash) VALUES (?, ?, ?, ?, ?, ?)',
    username,
    text(body.name, 'nombre', { max: 100 }),
    text(body.email, 'correo', { max: 160, required: false }) || null,
    role,
    text(body.specialty, 'especialidad', { max: 100, required: false }) || null,
    await hashPassword(password, config.passwordIterations)
  )
  return json({ user: publicUser(await db.first('SELECT * FROM users WHERE id = ?', result.lastId)) }, 201)
})

route('GET', '/api/tickets', ['admin', 'technician', 'applicant'], async ({ db, user }) => json({ tickets: await listTickets(db, user) }))

route('GET', '/api/tickets/:id', ['admin', 'technician', 'applicant'], async ({ db, user, params }) =>
  json({ ticket: await getTicket(db, user, Number(params.id)) })
)

route('POST', '/api/tickets', ['admin', 'applicant'], async ({ db, user, body }) => {
  const title = text(body.title, 'título', { max: 150 })
  const description = text(body.description, 'descripción', { max: 5000 })
  const category = oneOf(body.category, CATEGORIES, 'categoría')
  const priority = oneOf(body.priority || 'Media', PRIORITIES, 'prioridad')

  // Solo el administrador puede elegir técnico; si no, se asigna al de menor carga.
  const chosen = user.role === 'admin' ? await technicianOrFail(db, body.technicianId) : null
  const technicianId = chosen ? chosen.id : await leastBusyTechnicianId(db)
  const now = nowIso()

  const result = await db.run(
    'INSERT INTO tickets (title, description, category, priority, status, reporter_id, technician_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    title, description, category, priority, 'Pendiente', user.id, technicianId, now, now
  )
  const message = technicianId
    ? chosen ? 'Incidencia registrada y asignada por el administrador.' : 'Incidencia registrada y asignada automáticamente.'
    : 'Incidencia registrada. Pendiente de asignación (no hay técnicos activos).'
  await addUpdate(db, result.lastId, null, message)
  return json({ ticket: await getTicket(db, user, result.lastId) }, 201)
})

route('PATCH', '/api/tickets/:id', ['admin', 'technician'], async ({ db, user, body, params }) => {
  const id = Number(params.id)
  const current = await getTicket(db, user, id)
  const changes = {}
  const log = []

  if (body.status !== undefined && body.status !== current.status) {
    changes.status = oneOf(body.status, STATUSES, 'estado')
    log.push(`Estado actualizado a ${changes.status}.`)
  }

  if (user.role === 'admin') {
    if (body.title !== undefined) changes.title = text(body.title, 'título', { max: 150 })
    if (body.description !== undefined) changes.description = text(body.description, 'descripción', { max: 5000 })
    if (body.category !== undefined) changes.category = oneOf(body.category, CATEGORIES, 'categoría')
    if (body.priority !== undefined) changes.priority = oneOf(body.priority, PRIORITIES, 'prioridad')
    if (body.technicianId !== undefined) {
      const tech = await technicianOrFail(db, body.technicianId)
      const newId = tech ? tech.id : null
      if (newId !== current.technicianId) {
        changes.technician_id = newId
        log.push(tech ? `Asignada a ${tech.name}.` : 'Se removió el técnico asignado.')
        if (tech && current.status === 'Pendiente' && !changes.status) changes.status = 'En proceso'
      }
    }
  } else {
    const forbidden = ['title', 'description', 'category', 'priority', 'technicianId'].filter((key) => body[key] !== undefined)
    if (forbidden.length) throw new HttpError(403, 'Un técnico solo puede cambiar el estado.')
  }

  const keys = Object.keys(changes)
  if (keys.length) {
    await db.run(
      `UPDATE tickets SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      ...keys.map((key) => changes[key]), nowIso(), id
    )
    for (const entry of log) await addUpdate(db, id, user.id, entry)
  }
  return json({ ticket: await getTicket(db, user, id) })
})

route('POST', '/api/tickets/:id/updates', ['admin', 'technician', 'applicant'], async ({ db, user, body, params }) => {
  const id = Number(params.id)
  const current = await getTicket(db, user, id)
  const message = text(body.text, 'seguimiento', { max: 2000 })
  await addUpdate(db, id, user.id, message)
  if (user.role !== 'applicant' && current.status === 'Pendiente') {
    await db.run("UPDATE tickets SET status = 'En proceso', updated_at = ? WHERE id = ?", nowIso(), id)
  } else {
    await db.run('UPDATE tickets SET updated_at = ? WHERE id = ?', nowIso(), id)
  }
  return json({ ticket: await getTicket(db, user, id) }, 201)
})

// ---------- Despachador ----------

const schemaReady = new WeakMap()

export async function handleApi(request, { db, config }) {
  try {
    const url = new URL(request.url)
    const method = request.method.toUpperCase()

    // Protección CSRF: las peticiones que modifican datos deben venir del mismo origen.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const origin = request.headers.get('origin')
      if (origin && new URL(origin).host !== url.host) throw new HttpError(403, 'Origen no permitido.')
    }

    if (!schemaReady.has(db.key)) schemaReady.set(db.key, ensureSchema(db, config))
    try {
      await schemaReady.get(db.key)
    } catch (error) {
      schemaReady.delete(db.key)
      throw error
    }

    const match = routes.find((item) => item.method === method && item.pattern.test(url.pathname))
    if (!match) {
      const exists = routes.some((item) => item.pattern.test(url.pathname))
      throw new HttpError(exists ? 405 : 404, exists ? 'Método no permitido.' : 'Ruta no encontrada.')
    }

    const values = url.pathname.match(match.pattern).slice(1)
    const params = Object.fromEntries(match.keys.map((key, index) => [key, values[index]]))
    const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE] || null

    let user = null
    if (token) {
      user = await db.first(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
        await sha256Hex(token), nowIso()
      )
    }

    if (match.roles) {
      if (!user) throw new HttpError(401, 'Debes iniciar sesión.')
      if (!match.roles.includes(user.role)) throw new HttpError(403, 'No tienes permiso para esta acción.')
    }

    const needsBody = ['POST', 'PATCH', 'PUT'].includes(method) && match.path !== '/api/auth/logout'
    const body = needsBody ? await readJson(request) : {}

    return await match.handler({ db, config, request, user, token, params, body })
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    console.error(error)
    return json({ error: 'Error interno del servidor.' }, 500)
  }
}

export function readConfig(env = {}) {
  return {
    seedDemo: String(env.SEED_DEMO ?? 'false') === 'true',
    allowRegistration: String(env.ALLOW_REGISTRATION ?? 'true') === 'true',
    passwordIterations: Number(env.PBKDF2_ITERATIONS || 100000),
    adminUsername: env.ADMIN_USERNAME || 'admin',
    adminPassword: env.ADMIN_PASSWORD || ''
  }
}
