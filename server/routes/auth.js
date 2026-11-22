// /api/auth: inicio y cierre de sesión, usuario actual y registro público (si está habilitado).
import { Router } from 'express'
import { hashPassword, verifyPassword } from '../lib/crypto.js'
import { HttpError, email, newPassword, text } from '../lib/http.js'
import {
  SESSION_COOKIE, SESSION_HOURS, USER_SELECT, checkLoginLimit, createSessionToken, failedLogins, publicUser, registerLoginFailure, roleId
} from '../lib/users.js'

const router = Router()

let dummyHash = null // para que un correo inexistente tarde lo mismo que una contraseña incorrecta

// La cookie se marca Secure cuando la conexión del visitante es HTTPS (detrás del túnel llega en x-forwarded-proto).
function setSession(req, res, token, maxAgeSeconds) {
  res.cookie(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: maxAgeSeconds * 1000 })
}

router.post('/login', async (req, res) => {
  const { db, config } = req.app.locals
  const correo = text(req.body.correo, 'correo', { max: 120 }).toLowerCase()
  const password = text(req.body.password, 'contraseña', { max: 200 })
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
  setSession(req, res, await createSessionToken(row, config.sessionSecret), SESSION_HOURS * 3600)
  res.json({ user: publicUser(row) })
})

router.post('/logout', (req, res) => {
  setSession(req, res, '', 0)
  res.json({ ok: true })
})

router.get('/me', (req, res) => res.json({ user: req.user }))

router.get('/config', (req, res) => res.json({ allowRegistration: req.app.locals.config.allowRegistration }))

router.post('/register', async (req, res) => {
  const { db, config } = req.app.locals
  if (!config.allowRegistration) throw new HttpError(403, 'El registro público está deshabilitado. Solicita tu cuenta al administrador.')
  const nombre = text(req.body.nombre, 'nombre', { max: 100 })
  const correo = email(req.body.correo)
  const hash = await hashPassword(newPassword(req.body.password), config.passwordIterations)
  const created = await db.first(
    'INSERT INTO usuarios (nombre, correo, password_hash, id_rol) VALUES ($1, $2, $3, $4) RETURNING id_usuario',
    [nombre, correo, hash, await roleId(db, 'applicant')]
  )
  res.status(201).json({ user: publicUser(await db.first(`${USER_SELECT} WHERE u.id_usuario = $1`, [created.id_usuario])) })
})

export default router
