// Migraciones (db/migraciones): orden, registro, idempotencia, fallos con reversión y protección de archivos aplicados.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { dropDatabase, installDatabase } from '../server/lib/install.js'
import { MigrationError, applyMigrations, listMigrations, migrate, status, withDatabase } from '../server/lib/migrations.js'

const databases = []
let dir

const tempDb = async (tag, options = {}) => {
  const name = `tickops_migra_${tag}_${process.pid}_${Date.now()}`
  databases.push(name)
  await installDatabase({ database: name, template: false, ...options })
  return name
}
const one = (database, sql) => withDatabase(database, async (c) => (await c.query(sql)).rows[0])

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tickops-migraciones-'))
})

after(async () => {
  for (const name of databases) await dropDatabase(name).catch(() => {})
  await rm(dir, { recursive: true, force: true })
})

describe('Migraciones', () => {
  test('lee los archivos en orden y rechaza nombres o números inválidos', async () => {
    const d = await mkdtemp(join(tmpdir(), 'tickops-lista-'))
    try {
      await writeFile(join(d, '0002_segunda.sql'), 'SELECT 2;')
      await writeFile(join(d, '0001_primera.sql'), 'SELECT 1;')
      await writeFile(join(d, 'LEEME.md'), 'se ignora')
      assert.deepEqual((await listMigrations(d)).map((m) => m.archivo), ['0001_primera.sql', '0002_segunda.sql'])
      await writeFile(join(d, '0001_repetida.sql'), 'SELECT 1;')
      await assert.rejects(listMigrations(d), /dos migraciones con el número 0001/)
      await rm(join(d, '0001_repetida.sql'))
      await writeFile(join(d, '3_Mal Nombre.sql'), 'SELECT 3;')
      await assert.rejects(listMigrations(d), MigrationError)
    } finally {
      await rm(d, { recursive: true, force: true })
    }
  })

  test('aplica las pendientes en orden, las registra y no repite', async () => {
    await writeFile(join(dir, '0001_telefono.sql'), 'ALTER TABLE usuarios ADD COLUMN telefono varchar(30);')
    await writeFile(join(dir, '0002_estado_en_espera.sql'), "INSERT INTO estados_incidencia (nombre, descripcion, es_estado_final) VALUES ('En Espera', 'Esperando al solicitante', FALSE);")
    const name = `tickops_migra_base_${process.pid}_${Date.now()}`
    databases.push(name)
    // Base instalada SIN migraciones (como un cliente con una versión vieja) y luego actualizada.
    const empty = await mkdtemp(join(tmpdir(), 'tickops-vacia-'))
    await installDatabase({ database: name, template: false, migrationsDir: empty })
    await rm(empty, { recursive: true, force: true })
    assert.equal((await status({ database: name, dir })).pendientes.length, 2)

    const applied = await migrate({ database: name, dir })
    assert.deepEqual(applied.map((m) => m.version), ['0001', '0002'])
    assert.equal((await one(name, "SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'telefono'")).n, 1)
    assert.equal((await one(name, "SELECT COUNT(*)::int AS n FROM estados_incidencia WHERE nombre = 'En Espera'")).n, 1)
    assert.equal((await one(name, 'SELECT COUNT(*)::int AS n FROM esquema_migraciones')).n, 2)
    assert.equal((await migrate({ database: name, dir })).length, 0)
  })

  test('una instalación nueva aplica todas las migraciones y queda igual que una actualizada', async () => {
    const name = await tempDb('nueva', { migrationsDir: dir })
    const s = await status({ database: name, dir })
    assert.equal(s.aplicadas.length, 2)
    assert.equal(s.pendientes.length, 0)
    assert.equal((await one(name, "SELECT COUNT(*)::int AS n FROM estados_incidencia WHERE nombre = 'En Espera'")).n, 1)
  })

  test('si una migración falla, se revierte completa y no se aplican las siguientes', async () => {
    const name = await tempDb('falla', { migrationsDir: dir })
    await writeFile(join(dir, '0003_rota.sql'), 'ALTER TABLE usuarios ADD COLUMN extension varchar(10);\nALTER TABLE tabla_que_no_existe ADD COLUMN x int;')
    await writeFile(join(dir, '0004_despues.sql'), 'ALTER TABLE usuarios ADD COLUMN cargo varchar(60);')
    await assert.rejects(migrate({ database: name, dir }), (error) => error instanceof MigrationError && /0003_rota\.sql/.test(error.message))
    const cols = await one(name, "SELECT COUNT(*) FILTER (WHERE column_name = 'extension')::int AS ext, COUNT(*) FILTER (WHERE column_name = 'cargo')::int AS cargo FROM information_schema.columns WHERE table_name = 'usuarios'")
    assert.deepEqual(cols, { ext: 0, cargo: 0 })
    assert.equal((await status({ database: name, dir })).pendientes.length, 2)
    await rm(join(dir, '0003_rota.sql'))
    await rm(join(dir, '0004_despues.sql'))
  })

  test('se detiene si una migración ya aplicada fue modificada', async () => {
    const name = await tempDb('editada', { migrationsDir: dir })
    await writeFile(join(dir, '0001_telefono.sql'), 'ALTER TABLE usuarios ADD COLUMN telefono varchar(50);')
    assert.equal((await status({ database: name, dir })).modificadas.length, 1)
    await assert.rejects(migrate({ database: name, dir }), /modificadas/)
    await writeFile(join(dir, '0001_telefono.sql'), 'ALTER TABLE usuarios ADD COLUMN telefono varchar(30);')
    // Los saltos de línea de Windows no cuentan como cambio.
    await writeFile(join(dir, '0001_telefono.sql'), 'ALTER TABLE usuarios ADD COLUMN telefono varchar(30);'.replace(/\n/g, '\r\n'))
    assert.equal((await status({ database: name, dir })).modificadas.length, 0)
  })

  test('se detiene si la base es más nueva que el código', async () => {
    const name = await tempDb('nueva_que_codigo', { migrationsDir: dir })
    const older = await mkdtemp(join(tmpdir(), 'tickops-vieja-'))
    try {
      await writeFile(join(older, '0001_telefono.sql'), 'ALTER TABLE usuarios ADD COLUMN telefono varchar(30);')
      await assert.rejects(withDatabase(name, (c) => applyMigrations(c, { dir: older })), /más nueva/)
    } finally {
      await rm(older, { recursive: true, force: true })
    }
  })

  test('las migraciones del repositorio instalan bien y "npm run actualizar" deja la base al día', async () => {
    const name = await tempDb('repo')
    const repo = await listMigrations()
    assert.equal((await status({ database: name })).aplicadas.length, repo.length)
    const output = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['server/actualizar.js', '--sin-respaldo', '--sin-dependencias', '--sin-compilar'], {
        env: { ...process.env, PGDATABASE: name, BACKUP_DIR: '' },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let out = ''
      child.stdout.on('data', (chunk) => { out += chunk })
      child.stderr.on('data', (chunk) => { out += chunk })
      child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(out))))
    })
    assert.match(output, /Actualización terminada/)
    assert.match(output, /ya estaba al día/)
  })
})
