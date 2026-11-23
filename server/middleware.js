// Middlewares de Express para la API: protección CSRF, sesión, control de roles, JSON y manejo de errores.
import { HttpError, fromDbError } from './lib/http.js'
import { SESSION_COOKIE, userFromToken } from './lib/users.js'

export const ALL = ['admin', 'agent', 'applicant']
export const STAFF = ['admin', 'agent']

function parseCookies(header) {
  const cookies = {}
  for (const part of (header || '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return cookies
}

// Las peticiones que modifican datos deben venir del mismo origen o de uno de confianza
// (TRUSTED_ORIGINS, p. ej. https://tickops.bid cuando llegan por el túnel).
export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.get('origin')
  if (origin && new URL(origin).host !== req.get('host') && !req.app.locals.config.trustedOrigins.includes(origin)) {
    throw new HttpError(403, 'Origen no permitido.')
  }
  next()
}

// Lee la cookie de sesión y deja el usuario (o null) en req.user.
export async function loadUser(req, res, next) {
  const { db, config } = req.app.locals
  const token = parseCookies(req.get('cookie'))[SESSION_COOKIE]
  req.user = token ? await userFromToken(db, token, config.sessionSecret) : null
  next()
}

// Cambio de vista del administrador: con el encabezado "X-Vista" un admin usa las incidencias como
// "agente:<idDepartamento>" o como "solicitante", con su propia cuenta y las mismas reglas que ese rol.
// Todo queda registrado a su nombre. En otros roles el encabezado se ignora: no puede dar más permisos.
export const VIEW_HEADER = 'x-vista'

export async function applyView(req, res, next) {
  const view = req.get(VIEW_HEADER)
  if (!view || req.user?.role !== 'admin') return next()
  if (view === 'solicitante') {
    req.user = { ...req.user, role: 'applicant', vista: 'applicant' }
    return next()
  }
  const match = /^agente:(\d+)$/.exec(view)
  if (!match) throw new HttpError(400, 'Vista no válida.')
  const department = await req.app.locals.db.first(
    'SELECT id_departamento, nombre FROM departamentos WHERE id_departamento = $1 AND activo',
    [Number(match[1])]
  )
  if (!department) throw new HttpError(400, 'El departamento de la vista de agente no existe o está inactivo.')
  req.user = { ...req.user, role: 'agent', departamentoId: department.id_departamento, departamento: department.nombre, vista: 'agent' }
  next()
}

// Exige sesión iniciada y uno de los roles indicados.
export function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) throw new HttpError(401, 'Debes iniciar sesión.')
    if (!roles.includes(req.user.role)) throw new HttpError(403, 'No tienes permiso para esta acción.')
    next()
  }
}

// POST/PATCH/PUT deben enviar un objeto JSON (express.json() ya lo convirtió en req.body).
// Excepción: la subida de adjuntos llega como multipart/form-data y la procesa multer en su router.
export function requireJsonObject(req, res, next) {
  if (!['POST', 'PATCH', 'PUT'].includes(req.method) || req.path === '/auth/logout') return next()
  if (req.is('multipart/form-data') && /^\/incidencias\/\d+\/adjuntos$/.test(req.path)) return next()
  if (!req.is('application/json')) throw new HttpError(415, 'Se esperaba un cuerpo JSON.')
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new HttpError(400, 'Se esperaba un objeto JSON.')
  next()
}

// Valida que :id sea un número entero positivo; si no, la ruta no existe.
export function numericId(req, res, next, value) {
  next(/^\d+$/.test(value) ? undefined : new HttpError(404, 'Ruta no encontrada.'))
}

export function notFound(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada.' })
}

// Manejador final: traduce HttpError, errores de PostgreSQL y JSON mal formado a respuestas comprensibles.
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' })
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'El contenido enviado es demasiado grande.' })
  if (error.name === 'MulterError') {
    const messages = {
      LIMIT_FILE_SIZE: [413, 'Cada archivo puede pesar hasta 5 MB.'],
      LIMIT_FILE_COUNT: [400, 'Puedes subir hasta 5 archivos a la vez.'],
      LIMIT_UNEXPECTED_FILE: [400, 'Envía los archivos en el campo "archivos" (máximo 5 a la vez).']
    }
    const [status, message] = messages[error.code] || [400, 'No se pudo procesar el archivo enviado.']
    return res.status(status).json({ error: message })
  }
  const known = error instanceof HttpError ? error : fromDbError(error)
  if (known) return res.status(known.status).json({ error: known.message })
  console.error(error)
  const offline = ['ECONNREFUSED', 'ENOTFOUND', '28P01', '3D000'].includes(error.code)
  res.status(offline ? 503 : 500).json({ error: offline ? 'No se pudo conectar con la base de datos.' : 'Error interno del servidor.' })
}
