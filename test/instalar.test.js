// Instalación desde db/ (npm run instalar): base nueva, catálogos, plantilla opcional y protección de datos existentes.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { InstallError, dropDatabase, installDatabase } from '../server/lib/install.js'
import { verifyPassword } from '../server/lib/crypto.js'
import { createDb } from '../server/db.js'

const created = []
const tempName = (tag) => {
  const name = `tickops_instalar_${tag}_${process.pid}_${Date.now()}`
  created.push(name)
  return name
}

// Ejecuta "node server/instalar.js" respondiendo las preguntas con "answers".
function runInstaller(answers, { cwd = process.cwd(), env = process.env, args = [] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), 'server', 'instalar.js'), ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { out += chunk })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`instalar terminó con código ${code}:\n${out}`))))
    child.stdin.end(answers.join('\n') + '\n')
  })
}

async function query(database, sql) {
  const db = createDb({ database, max: 1 })
  try {
    return await db.first(sql)
  } finally {
    await db.end()
  }
}

after(async () => {
  for (const name of created) await dropDatabase(name).catch(() => {})
})

describe('Instalación de la base de datos', () => {
  test('instala esquema, triggers, catálogos y plantilla en una base nueva', async () => {
    const name = tempName('plantilla')
    const result = await installDatabase({ database: name, template: true })
    assert.equal(result.created, true)
    assert.equal(result.tablas, 14) // 13 del sistema + esquema_migraciones
    const counts = await query(name, `
      SELECT (SELECT COUNT(*) FROM roles) AS roles, (SELECT COUNT(*) FROM estados_incidencia) AS estados,
             (SELECT COUNT(*) FROM prioridades) AS prioridades, (SELECT COUNT(*) FROM departamentos) AS departamentos,
             (SELECT COUNT(*) FROM categorias) AS categorias, (SELECT COUNT(*) FROM usuarios) AS usuarios,
             (SELECT COUNT(*) FROM pg_trigger WHERE NOT tgisinternal) AS triggers`)
    assert.deepEqual(counts, { roles: 3, estados: 5, prioridades: 4, departamentos: 4, categorias: 7, usuarios: 0, triggers: 4 })
  })

  test('sin plantilla no trae departamentos ni categorías', async () => {
    const name = tempName('vacia')
    const result = await installDatabase({ database: name, template: false })
    assert.equal(result.departamentos, 0)
    assert.equal(result.categorias, 0)
    assert.equal((await query(name, 'SELECT COUNT(*) AS n FROM roles')).n, 3)
  })

  test('nunca instala sobre una base que ya tiene tablas', async () => {
    const name = tempName('existente')
    await installDatabase({ database: name, template: true })
    await assert.rejects(installDatabase({ database: name }), (error) => error instanceof InstallError && /ya tiene/.test(error.message))
    assert.equal((await query(name, 'SELECT COUNT(*) AS n FROM departamentos')).n, 4)
  })

  test('rechaza nombres de base no válidos', async () => {
    await assert.rejects(installDatabase({ database: 'tickops"; DROP DATABASE postgres; --' }), InstallError)
  })

  test('el comando "npm run instalar" crea la base y el primer administrador', async () => {
    const name = tempName('cli')
    const output = await runInstaller(['s', 'Admin Inicial', 'admin@cliente.local', 'Segura12345', 'Segura12345'], {
      env: { ...process.env, PGDATABASE: name, PBKDF2_ITERATIONS: '1000' }
    })
    assert.match(output, /Instalación terminada/)
    const admin = await query(name, `SELECT u.correo, u.password_hash, r.nombre AS rol FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol`)
    assert.equal(admin.correo, 'admin@cliente.local')
    assert.equal(admin.rol, 'Administrador')
    assert.ok(await verifyPassword('Segura12345', admin.password_hash))
    assert.equal((await query(name, 'SELECT COUNT(*) AS n FROM categorias')).n, 7)
  })

  test('sin .env, pide la conexión y crea un .env con claves nuevas (una sola vez cada una)', async () => {
    const name = tempName('sinenv')
    const dir = await mkdtemp(join(tmpdir(), 'tickops-instalar-'))
    try {
      const env = { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, PBKDF2_ITERATIONS: '1000' }
      const { PGHOST = 'localhost', PGPORT = '5432', PGUSER = 'postgres', PGPASSWORD = '' } = process.env
      await runInstaller([PGHOST, PGPORT, PGUSER, PGPASSWORD, name, '3300', 'n'], { cwd: dir, env, args: ['--sin-admin'] })
      const file = await readFile(join(dir, '.env'), 'utf8')
      assert.equal(file.match(/^SESSION_SECRET=/gm).length, 1)
      assert.equal(file.match(/^BACKUP_PASSWORD=/gm).length, 1)
      assert.match(file, new RegExp(`^PGDATABASE='${name}'$`, 'm'))
      assert.equal((await query(name, 'SELECT COUNT(*) AS n FROM departamentos')).n, 0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
