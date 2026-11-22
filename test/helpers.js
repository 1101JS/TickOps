// Utilidades para las pruebas: base de datos aislada y servidor de la API en un puerto libre.
//
// Cada archivo de prueba crea su propia base temporal copiando de la base configurada en .env (PGDATABASE)
// SOLO la estructura (tablas, triggers, funciones) y los catálogos (roles, departamentos, categorías,
// estados y prioridades). No se copian usuarios ni incidencias reales, y la base se borra al terminar.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashPassword } from '../server/lib/crypto.js'
import { createApp, readConfig } from '../server/app.js'
import { pgTool } from '../server/backup.js'
import { createDb } from '../server/db.js'

const CATALOG_TABLES = ['roles', 'departamentos', 'categorias', 'estados_incidencia', 'prioridades']
export const PASSWORD = 'Prueba12345'
const ITERATIONS = 1000 // rápido en pruebas; en producción se usan 100000

function run(command, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(stdout) : reject(new Error(`${command} ${args.join(' ')}: ${stderr.trim()}`))))
    if (input) input.pipe(child.stdin)
  })
}

// pg_dump de la base de origen → psql en la base de prueba.
async function copy(source, target, dumpArgs) {
  const dump = spawn(pgTool('pg_dump'), [...dumpArgs, '--no-owner', '--no-privileges', source], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  dump.stderr.on('data', (chunk) => { stderr += chunk })
  const dumped = new Promise((resolve, reject) => dump.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump: ${stderr.trim()}`)))))
  await Promise.all([run(pgTool('psql'), ['-q', '-v', 'ON_ERROR_STOP=1', '-d', target], { input: dump.stdout }), dumped])
}

// Crea la base de prueba y devuelve { db, name, drop }.
export async function createTestDatabase() {
  const source = process.env.PGDATABASE
  if (!source) throw new Error('Configura PGDATABASE (archivo .env) para ejecutar las pruebas.')
  const name = `${source}_prueba_${process.pid}_${Date.now()}`
  await run(pgTool('createdb'), [name])
  try {
    await copy(source, name, ['--schema-only'])
    await copy(source, name, ['--data-only', '--disable-triggers', ...CATALOG_TABLES.flatMap((t) => ['-t', t])])
  } catch (error) {
    await run(pgTool('dropdb'), ['--force', name]).catch(() => {})
    throw error
  }
  const db = createDb({ database: name, max: 5 })
  return {
    db,
    name,
    async drop() {
      await db.end()
      await run(pgTool('dropdb'), ['--force', name])
    }
  }
}

// Inserta un usuario directamente en la base (para tener el primer administrador).
export async function insertUser(db, { nombre, correo, rol = 'Administrador', idDepartamento = null }) {
  const role = await db.first('SELECT id_rol FROM roles WHERE nombre = $1', [rol])
  const row = await db.first(
    'INSERT INTO usuarios (nombre, correo, password_hash, id_rol, id_departamento) VALUES ($1, $2, $3, $4, $5) RETURNING id_usuario',
    [nombre, correo, await hashPassword(PASSWORD, ITERATIONS), role.id_rol, idDepartamento]
  )
  return row.id_usuario
}

// Levanta la API (Express) sobre la base de prueba en un puerto libre. Devuelve { url, attachmentsDir, close }.
// Los adjuntos van a una carpeta temporal que se borra al cerrar.
export async function startServer(db, env = {}) {
  const attachmentsDir = await mkdtemp(join(tmpdir(), 'tickops-adjuntos-'))
  const config = readConfig({ SESSION_SECRET: 'secreto-de-pruebas', PBKDF2_ITERATIONS: String(ITERATIONS), ATTACHMENTS_DIR: attachmentsDir, ...env })
  const app = createApp({ db, config })
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    attachmentsDir,
    async close() {
      await new Promise((resolve) => server.close(resolve))
      await rm(attachmentsDir, { recursive: true, force: true })
    }
  }
}

// Cliente HTTP que conserva la cookie de sesión, como un navegador.
export function client(baseUrl) {
  let cookie = ''
  return async function request(method, path, body, headers = {}) {
    const isForm = body instanceof FormData
    const response = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers
      },
      body: body === undefined || isForm || typeof body === 'string' ? body : JSON.stringify(body)
    })
    const setCookie = response.headers.getSetCookie()[0] || ''
    if (setCookie) cookie = setCookie.split(';')[0]
    const isJson = (response.headers.get('content-type') || '').includes('application/json')
    const raw = isJson ? null : Buffer.from(await response.arrayBuffer())
    const data = isJson ? await response.json().catch(() => null) : null
    return { status: response.status, data, raw, headers: response.headers, setCookie }
  }
}

export async function login(baseUrl, correo, password = PASSWORD) {
  const request = client(baseUrl)
  const response = await request('POST', '/api/auth/login', { correo, password })
  if (response.status !== 200) throw new Error(`No se pudo iniciar sesión como ${correo}: ${response.data?.error}`)
  return request
}
