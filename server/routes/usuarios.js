// /api/agentes y /api/usuarios: agentes con su carga de trabajo y administración de cuentas.
import { Router } from 'express'
import { hashPassword } from '../lib/crypto.js'
import { HttpError, email, intId, newPassword, text } from '../lib/http.js'
import { ROLE_KEYS, ROLE_NAMES, USER_SELECT, activeDepartment, openAssignments, publicUser, roleId } from '../lib/users.js'
import { STAFF, numericId, requireRole } from '../middleware.js'

const router = Router()
router.param('id', numericId)

router.get('/agentes', requireRole(STAFF), async (req, res) => {
  const { db } = req.app.locals
  const { user, query } = req
  const requested = query.departamento
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
  return res.json({
    agentes: rows.map((r) => ({ id: r.id_usuario, nombre: r.nombre, correo: r.correo, departamentoId: r.id_departamento, departamento: r.departamento, carga: r.carga }))
  })
})

router.get('/usuarios', requireRole(['admin']), async (req, res) => {
  const { db } = req.app.locals
  const rows = await db.all(`${USER_SELECT} ORDER BY r.id_rol, u.nombre`)
  return res.json({ usuarios: rows.map(publicUser) })
})

router.post('/usuarios', requireRole(['admin']), async (req, res) => {
  const { db, config } = req.app.locals
  const { body } = req
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
  return res.status(201).json({ usuario: publicUser(await db.first(`${USER_SELECT} WHERE u.id_usuario = $1`, [created.id_usuario])) })
})

router.patch('/usuarios/:id', requireRole(['admin']), async (req, res) => {
  const { db, config } = req.app.locals
  const { user, body, params } = req
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
  return res.json({ usuario: publicUser(await db.first(`${USER_SELECT} WHERE u.id_usuario = $1`, [id])) })
})

export default router
