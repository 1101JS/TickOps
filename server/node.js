// Servidor local (modo LAN): API + frontend compilado, conectado a PostgreSQL.
//   npm run build && npm run lan
// Variables (.env): PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE (conexión a PostgreSQL),
//                   SESSION_SECRET, PORT (3000), HOST (0.0.0.0), ALLOW_REGISTRATION (false), PBKDF2_ITERATIONS (100000)
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { handleApi, readConfig } from './app.js'
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
const context = { db, config }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
}

async function serveStatic(pathname) {
  const target = normalize(join(distDir, decodeURIComponent(pathname)))
  const insideDist = target === distDir || target.startsWith(distDir + sep)
  let file = insideDist ? target : null
  if (file) {
    const info = await stat(file).catch(() => null)
    if (!info || !info.isFile()) file = null
  }
  // Fallback de SPA: cualquier ruta sin extensión devuelve index.html (vue-router se encarga).
  if (!file && !extname(pathname)) file = join(distDir, 'index.html')
  if (!file) return new Response('No encontrado', { status: 404 })

  try {
    const body = await readFile(file)
    const immutable = file.includes(`${sep}assets${sep}`)
    return new Response(body, {
      headers: {
        'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
      }
    })
  } catch {
    return new Response('Falta compilar el frontend: ejecuta "npm run build".', { status: 503 })
  }
}

createServer(async (req, res) => {
  try {
    // Detrás del túnel de Cloudflare la conexión del visitante es HTTPS (la cookie de sesión se marca Secure).
    const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
    const url = new URL(req.url, `${protocol}://${req.headers.host || 'localhost'}`)
    let response
    if (url.pathname.startsWith('/api/')) {
      const hasBody = !['GET', 'HEAD'].includes(req.method)
      const request = new Request(url, {
        method: req.method,
        headers: Object.entries(req.headers).flatMap(([key, value]) => (Array.isArray(value) ? value.map((v) => [key, v]) : [[key, value]])),
        body: hasBody ? Readable.toWeb(req) : undefined,
        duplex: hasBody ? 'half' : undefined
      })
      response = await handleApi(request, context)
    } else {
      response = await serveStatic(url.pathname)
    }

    const headers = {}
    response.headers.forEach((value, key) => {
      if (key !== 'set-cookie') headers[key] = value
    })
    const cookies = response.headers.getSetCookie()
    if (cookies.length) headers['set-cookie'] = cookies
    res.writeHead(response.status, headers)
    res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    console.error(error)
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Error interno del servidor.')
  }
}).listen(port, host, async () => {
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
})
