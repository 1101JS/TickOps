// Servidor local (modo LAN): API + frontend compilado, conectado a PostgreSQL.
//   npm run build && npm run lan
// Variables (.env): PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE (conexión a PostgreSQL),
//                   SESSION_SECRET, PORT (3000), HOST (0.0.0.0), ALLOW_REGISTRATION (false), PBKDF2_ITERATIONS (100000)
//                   BACKUP_DIR, BACKUP_PASSWORD, BACKUP_KEEP (14): respaldo automático cifrado (ver backup.js)
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createApp, readConfig } from './app.js'
import { scheduleBackups } from './backup.js'
import { createDb } from './db.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(projectRoot, 'dist')
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '0.0.0.0'

const config = readConfig(process.env)
if (!config.sessionSecret) {
  config.sessionSecret = randomBytes(32).toString('base64url')
  console.log('Aviso: falta SESSION_SECRET en .env; se usará una clave temporal y las sesiones se perderán al reiniciar.')
}

const db = createDb()
const app = createApp({ db, config })

// Frontend compilado (dist/). Los archivos de assets/ llevan hash en el nombre: se pueden cachear para siempre.
app.use(express.static(distDir, {
  index: false,
  setHeaders(res, file) {
    res.set('cache-control', file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache')
  }
}))

// Fallback de SPA: cualquier ruta sin extensión devuelve index.html (vue-router se encarga).
app.use((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method) || extname(req.path)) return res.status(404).type('text').send('No encontrado')
  const index = join(distDir, 'index.html')
  if (!existsSync(index)) return res.status(503).type('text').send('Falta compilar el frontend: ejecuta "npm run build".')
  res.set('cache-control', 'no-cache').sendFile(index)
})

app.listen(port, host, async () => {
  console.log(`TickOps (modo LAN) escuchando en http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`)
  try {
    const info = await db.first(
      `SELECT current_database() AS base,
              (SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE r.nombre = 'Administrador' AND u.activo) AS admins`
    )
    console.log(`Base de datos: PostgreSQL "${info.base}" en ${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}`)
    if (info.admins === 0) console.log('Aviso: no hay ningún administrador activo. Créalo con: npm run crear-admin')
  } catch (error) {
    console.error(`Error: no se pudo conectar a PostgreSQL (${error.message}). Revisa los datos PG* del archivo .env.`)
  }
  scheduleBackups()
})
