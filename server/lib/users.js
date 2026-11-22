// Usuarios y sesión: lectura de usuarios, token de sesión firmado y límite de intentos de login.
import { HttpError, intId } from './http.js'
import { sha256Hex, signToken, verifyToken } from './crypto.js'

export const SESSION_COOKIE = 'tickops_session'
export const SESSION_HOURS = 12
const LOGIN_MAX_FAILURES = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000

// Nombres de rol en la base -> clave usada por el frontend.
export const ROLE_KEYS = { Administrador: 'admin', Agente: 'agent', Solicitante: 'applicant' }
export const ROLE_NAMES = { admin: 'Administrador', agent: 'Agente', applicant: 'Solicitante' }

export const USER_SELECT = `
  SELECT u.id_usuario, u.nombre, u.correo, u.password_hash, u.activo, u.id_departamento, u.fecha_creacion,
         r.nombre AS rol, d.nombre AS departamento
  FROM usuarios u
  JOIN roles r ON r.id_rol = u.id_rol
  LEFT JOIN departamentos d ON d.id_departamento = u.id_departamento`

export function publicUser(row) {
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
export async function passwordFingerprint(hash) {
  return (await sha256Hex(hash)).slice(0, 16)
}

export async function createSessionToken(row, secret) {
  return signToken(
    { u: row.id_usuario, e: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600, f: await passwordFingerprint(row.password_hash) },
    secret
  )
}

export async function userFromToken(db, token, secret) {
  const payload = await verifyToken(token, secret)
  if (!payload || !Number.isInteger(payload.u) || payload.e < Date.now() / 1000) return null
  const row = await db.first(`${USER_SELECT} WHERE u.id_usuario = $1 AND u.activo`, [payload.u])
  if (!row || payload.f !== (await passwordFingerprint(row.password_hash))) return null
  return publicUser(row)
}

// Límite de intentos fallidos por correo (en memoria; se reinicia al reiniciar el servidor).
export const failedLogins = new Map()

export function checkLoginLimit(key) {
  const entry = failedLogins.get(key)
  if (entry && entry.until > Date.now() && entry.count >= LOGIN_MAX_FAILURES) {
    const minutes = Math.ceil((entry.until - Date.now()) / 60000)
    throw new HttpError(429, `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} minuto(s).`)
  }
}

export function registerLoginFailure(key) {
  const entry = failedLogins.get(key)
  if (!entry || entry.until < Date.now()) failedLogins.set(key, { count: 1, until: Date.now() + LOGIN_WINDOW_MS })
  else entry.count++
}


export async function roleId(db, roleKey) {
  const row = await db.first('SELECT id_rol FROM roles WHERE nombre = $1', [ROLE_NAMES[roleKey]])
  if (!row) throw new HttpError(500, `No existe el rol ${ROLE_NAMES[roleKey]} en la base de datos.`)
  return row.id_rol
}

export async function activeDepartment(db, id) {
  const row = await db.first('SELECT id_departamento, nombre FROM departamentos WHERE id_departamento = $1 AND activo', [intId(id, 'departamento')])
  if (!row) throw new HttpError(400, 'El departamento indicado no existe o está inactivo.')
  return row
}

export async function openAssignments(db, userId) {
  const row = await db.first(
    `SELECT COUNT(*) AS total FROM incidencias i JOIN estados_incidencia e ON e.id_estado = i.id_estado
     WHERE i.id_agente = $1 AND NOT e.es_estado_final AND e.nombre <> 'Resuelto'`,
    [userId]
  )
  return row.total
}
