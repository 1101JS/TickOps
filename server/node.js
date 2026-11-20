// Punto de entrada para instalación local (modo LAN). Requiere Node 22.13+ (usa node:sqlite, sin dependencias).
//   npm run build && npm run lan
// Variables: PORT (3000), HOST (0.0.0.0), DB_PATH (./data/tickops.db), ADMIN_USERNAME, ADMIN_PASSWORD,
//            SEED_DEMO (false), ALLOW_REGISTRATION (true), PBKDF2_ITERATIONS (100000)
import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { handleApi, readConfig } from './app.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(projectRoot, 'dist')
const dbPath = resolve(projectRoot, process.env.DB_PATH || 'data/tickops.db')
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '0.0.0.0'

mkdirSync(dirname(dbPath), { recursive: true })
const sqlite = new DatabaseSync(dbPath)
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')

const db = {
  key: sqlite,
  async all(sql, ...params) {
    return sqlite.prepare(sql).all(...params)
  },
  async first(sql, ...params) {
    return sqlite.prepare(sql).get(...params) ?? null
  },
  async run(sql, ...params) {
    const result = sqlite.prepare(sql).run(...params)
    return { lastId: Number(result.lastInsertRowid), changes: Number(result.changes) }
  }
}
const context = { db, config: readConfig({ ...process.env, ...(process.argv.includes('--demo') ? { SEED_DEMO: 'true' } : {}) }) }

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
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
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
}).listen(port, host, () => {
  console.log(`TickOps (modo LAN) escuchando en http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`)
  console.log(`Base de datos: ${dbPath}`)
  if (!context.config.seedDemo && !context.config.adminPassword) {
    console.log('Aviso: sin SEED_DEMO ni ADMIN_PASSWORD. Define ADMIN_PASSWORD en el primer arranque para crear el administrador.')
  }
})
