// API de TickOps con Express sobre PostgreSQL (base "sistema_incidencias").
// El navegador nunca habla con la base de datos: toda petición pasa por aquí, se valida la sesión y el rol,
// y solo entonces se consulta la base. Las reglas que ya viven en la base (triggers) se respetan;
// sus mensajes se devuelven tal cual al usuario (ver errorHandler).
//
// Estructura:
//   app.js          crea la aplicación y monta middlewares y routers
//   middleware.js   CSRF, sesión (req.user), roles, validación de JSON y manejo de errores
//   routes/*.js     un router por recurso: auth, catalogos, incidencias (+ adjuntos), categorias, departamentos, usuarios/agentes
//   lib/*.js        lógica compartida: validación, usuarios/sesión, reglas de incidencias, cifrado
import express from 'express'
import { attachmentsDir } from './lib/attachments.js'
import { applyView, errorHandler, loadUser, notFound, requireJsonObject, sameOrigin } from './middleware.js'
import authRoutes from './routes/auth.js'
import catalogRoutes from './routes/catalogos.js'
import categoryRoutes from './routes/categorias.js'
import departmentRoutes from './routes/departamentos.js'
import statsRoutes from './routes/estadisticas.js'
import incidentRoutes from './routes/incidencias.js'
import userRoutes from './routes/usuarios.js'

// Crea la aplicación Express de la API. "db" es la conexión de db.js y "config" sale de readConfig().
export function createApp({ db, config }) {
  const app = express()
  app.locals.db = db
  app.locals.config = config
  app.disable('x-powered-by')
  // Detrás del túnel de Cloudflare (cloudflared corre en la misma PC) la conexión del visitante es HTTPS:
  // confiar en el proxy local hace que req.secure sea verdadero y la cookie de sesión se marque Secure.
  app.set('trust proxy', 'loopback')

  const api = express.Router()
  api.use((req, res, next) => {
    res.set('cache-control', 'no-store')
    next()
  })
  api.use(sameOrigin)
  api.use(express.json({ limit: '100kb' }))
  api.use(requireJsonObject)
  api.use(loadUser)

  api.get('/health', async (req, res) => {
    const row = await db.first('SELECT current_database() AS base, NOW() AS hora')
    res.json({ ok: true, base: row.base, hora: row.hora })
  })
  api.use('/auth', authRoutes)
  api.use('/catalogos', catalogRoutes)
  // La vista del administrador (X-Vista) solo cambia cómo se ven y gestionan las incidencias.
  api.use('/incidencias', applyView, incidentRoutes)
  api.use('/categorias', categoryRoutes)
  api.use('/departamentos', departmentRoutes)
  api.use('/estadisticas', statsRoutes)
  api.use('/', userRoutes) // /agentes y /usuarios
  api.use(notFound)

  app.use('/api', api)
  app.use('/api', errorHandler)
  return app
}

export function readConfig(env = {}) {
  return {
    allowRegistration: String(env.ALLOW_REGISTRATION ?? 'false') === 'true',
    passwordIterations: Number(env.PBKDF2_ITERATIONS || 100000),
    sessionSecret: env.SESSION_SECRET || '',
    attachmentsDir: attachmentsDir(env),
    trustedOrigins: String(env.TRUSTED_ORIGINS || '').split(',').map((item) => item.trim().replace(/\/+$/, '')).filter(Boolean)
  }
}
