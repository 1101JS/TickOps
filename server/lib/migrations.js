// Migraciones de la base de datos: cambios de estructura numerados en db/migraciones/.
//
//   db/esquema.sql + db/catalogos.sql   versión base (congelada: no se editan)
//   db/migraciones/0001_algo.sql        cada cambio posterior, en orden (0001, 0002, ...)
//
// La tabla esquema_migraciones guarda qué migraciones ya se aplicaron (con una huella SHA-256 del archivo).
// Cada migración corre en su propia transacción: si falla, no se aplica nada de ella ni de las siguientes.
// Una instalación nueva aplica la versión base y luego TODAS las migraciones; una existente, solo las pendientes.
// Así todos los clientes terminan con la misma estructura, sin importar desde qué versión partieron.
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'
import { DB_DIR } from './paths.js'

export const MIGRATIONS_DIR = join(DB_DIR, 'migraciones')
const FILE_NAME = /^(\d{4})_([a-z0-9_]+)\.sql$/
const LOCK_KEY = 74_270_001 // pg_advisory_lock: evita que dos procesos migren a la vez

export class MigrationError extends Error {}

const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS public.esquema_migraciones (
    version varchar(10) PRIMARY KEY,
    nombre varchar(200) NOT NULL,
    huella char(64) NOT NULL,
    aplicada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`

// Huella del archivo sin importar los saltos de línea (Windows/Linux, git autocrlf).
export function checksum(sql) {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex')
}

// Lee db/migraciones/*.sql ordenadas por número. Un .sql con nombre incorrecto o un número repetido es un error
// (mejor detenerse que saltarse un cambio en silencio). Otros archivos (p. ej. LEEME.md) se ignoran.
export async function listMigrations(dir = MIGRATIONS_DIR) {
  const names = await readdir(dir).catch((error) => (error.code === 'ENOENT' ? [] : Promise.reject(error)))
  const migrations = []
  for (const name of names.filter((n) => n.toLowerCase().endsWith('.sql')).sort()) {
    const match = FILE_NAME.exec(name)
    if (!match) throw new MigrationError(`Nombre de migración no válido: "${name}". Usa 0001_descripcion_en_minusculas.sql`)
    const sql = await readFile(join(dir, name), 'utf8')
    migrations.push({ version: match[1], nombre: match[2], archivo: name, sql, huella: checksum(sql) })
  }
  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i].version === migrations[i - 1].version) {
      throw new MigrationError(`Hay dos migraciones con el número ${migrations[i].version}: ${migrations[i - 1].archivo} y ${migrations[i].archivo}.`)
    }
  }
  return migrations
}

async function appliedRows(client) {
  const { rows: [exists] } = await client.query("SELECT to_regclass('public.esquema_migraciones') IS NOT NULL AS ok")
  if (!exists.ok) return []
  return (await client.query('SELECT version, nombre, huella, aplicada_en FROM public.esquema_migraciones ORDER BY version')).rows
}

// Estado sin modificar nada: { aplicadas, pendientes, modificadas, desconocidas }.
//  - modificadas: ya aplicadas, pero el archivo cambió después (no se deben editar migraciones aplicadas).
//  - desconocidas: registradas en la base pero sin archivo (la base es más nueva que este código).
export async function migrationStatus(client, dir = MIGRATIONS_DIR) {
  const [files, applied] = await Promise.all([listMigrations(dir), appliedRows(client)])
  const byVersion = new Map(applied.map((row) => [row.version, row]))
  const fileVersions = new Set(files.map((m) => m.version))
  return {
    aplicadas: files.filter((m) => byVersion.has(m.version)),
    pendientes: files.filter((m) => !byVersion.has(m.version)),
    modificadas: files.filter((m) => byVersion.has(m.version) && byVersion.get(m.version).huella !== m.huella),
    desconocidas: applied.filter((row) => !fileVersions.has(row.version))
  }
}

// Aplica las migraciones pendientes en orden con un cliente ya conectado. Devuelve la lista aplicada.
export async function applyMigrations(client, { dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])
  try {
    await client.query(TABLE_SQL)
    const status = await migrationStatus(client, dir)
    if (status.modificadas.length) {
      throw new MigrationError(`Estas migraciones ya aplicadas fueron modificadas después: ${status.modificadas.map((m) => m.archivo).join(', ')}. No se editan migraciones aplicadas: crea una nueva con el cambio.`)
    }
    if (status.desconocidas.length) {
      throw new MigrationError(`La base tiene migraciones que este código no conoce (${status.desconocidas.map((r) => r.version).join(', ')}): parece de una versión más nueva de TickOps. Actualiza el código antes de migrar.`)
    }
    const applied = []
    for (const migration of status.pendientes) {
      log(`Aplicando ${migration.archivo}...`)
      await client.query('BEGIN')
      try {
        await client.query('SET LOCAL search_path TO public')
        await client.query(migration.sql)
        await client.query('INSERT INTO public.esquema_migraciones (version, nombre, huella) VALUES ($1, $2, $3)', [migration.version, migration.nombre, migration.huella])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw new MigrationError(`Falló la migración ${migration.archivo}: ${error.message}. No se aplicó (ni las siguientes); la base quedó como estaba antes de ella.`)
      }
      applied.push(migration)
    }
    return applied
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {})
  }
}

// Atajos que abren y cierran su propia conexión (con las variables PG* del .env).
export async function withDatabase(database, fn) {
  const client = new pg.Client({ database })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export function migrate({ database = process.env.PGDATABASE, dir = MIGRATIONS_DIR, log } = {}) {
  return withDatabase(database, (client) => applyMigrations(client, { dir, log }))
}

export function status({ database = process.env.PGDATABASE, dir = MIGRATIONS_DIR } = {}) {
  return withDatabase(database, (client) => migrationStatus(client, dir))
}
