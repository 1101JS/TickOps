// Instalación de la base de datos de TickOps desde los archivos de db/ (sin depender de otra base):
//   db/esquema.sql    versión base: tablas, funciones, triggers e índices (congelada; no se edita)
//   db/catalogos.sql  roles, estados y prioridades con SLA (obligatorios; congelado)
//   db/migraciones/   cambios posteriores a la versión base, en orden (ver migrations.js)
//   db/plantilla.sql  departamentos y categorías de ejemplo (opcionales; el admin puede crear los suyos)
// Nunca instala sobre una base que ya tenga tablas: así no se puede borrar ni mezclar información existente.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'
import { MIGRATIONS_DIR, applyMigrations } from './migrations.js'
import { DB_DIR } from './paths.js'

export { DB_DIR }
const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/

export class InstallError extends Error {}

// Quita del volcado de pg_dump lo que depende de la versión exacta de PostgreSQL o de psql:
// \restrict/\unrestrict (comandos de psql, no SQL) y SET transaction_timeout (no existe antes de PostgreSQL 17).
export function cleanSchemaDump(sql) {
  const body = sql
    .split(/\r?\n/)
    .filter((line) => !/^\\(un)?restrict\b/.test(line) && !/^SET transaction_timeout\b/.test(line))
    .filter((line) => !/^-- Dumped (from|by) /.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return [
    '-- Esquema BASE de la base de datos de TickOps: tablas, funciones, triggers e índices, sin datos.',
    '-- Congelado: NO se edita. Los cambios de estructura van en db/migraciones/ (ver README, "Migraciones").',
    '-- Lo instala "npm run instalar", que después aplica todas las migraciones.',
    '',
    body,
    ''
  ].join('\n')
}

function client(database) {
  return new pg.Client({ database })
}

async function withClient(database, fn) {
  const c = client(database)
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

async function readSql(name) {
  return readFile(join(DB_DIR, name), 'utf8')
}

// Crea (si hace falta) la base "database", carga esquema y catálogos, aplica las migraciones y, si template es true,
// la plantilla. Devuelve { database, created, tablas, departamentos, categorias, migraciones }.
export async function installDatabase({ database, template = true, migrationsDir = MIGRATIONS_DIR, maintenanceDb = process.env.PGMAINTENANCE_DB || 'postgres' } = {}) {
  if (!database || !VALID_NAME.test(database)) {
    throw new InstallError(`Nombre de base de datos no válido: "${database}". Usa letras, números y guion bajo (p. ej. tickops).`)
  }

  const created = await withClient(maintenanceDb, async (c) => {
    const exists = (await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])).rowCount > 0
    if (!exists) await c.query(`CREATE DATABASE "${database}"`)
    return !exists
  })

  try {
    return await withClient(database, async (c) => {
      const { rows: [info] } = await c.query(
        `SELECT pg_encoding_to_char(d.encoding) AS encoding,
                (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public')::int AS tablas
         FROM pg_database d WHERE d.datname = current_database()`
      )
      if (info.tablas > 0) {
        throw new InstallError(`La base "${database}" ya tiene ${info.tablas} tabla(s). Por seguridad no se instala encima: usa otro nombre en PGDATABASE o una base vacía.`)
      }
      if (info.encoding !== 'UTF8') {
        throw new InstallError(`La base "${database}" usa la codificación ${info.encoding}; TickOps necesita UTF8.`)
      }

      const [schema, catalogs, plantilla] = await Promise.all([readSql('esquema.sql'), readSql('catalogos.sql'), template ? readSql('plantilla.sql') : ''])
      await c.query('BEGIN')
      try {
        await c.query(schema)
        // El volcado deja search_path vacío; los catálogos usan nombres sin esquema.
        await c.query('SET search_path TO public')
        await c.query(catalogs)
        await c.query('COMMIT')
      } catch (error) {
        await c.query('ROLLBACK').catch(() => {})
        throw error
      }
      // Después de la versión base, todos los cambios posteriores (cada uno en su transacción).
      const migraciones = await applyMigrations(c, { dir: migrationsDir })
      // La plantilla va al final: así usa la estructura ya migrada.
      if (template) await c.query(plantilla)

      const { rows: [counts] } = await c.query(
        `SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public')::int AS tablas,
                (SELECT COUNT(*) FROM departamentos)::int AS departamentos,
                (SELECT COUNT(*) FROM categorias)::int AS categorias`
      )
      return { database, created, ...counts, migraciones: migraciones.length }
    })
  } catch (error) {
    // Si la base la creamos nosotros y la instalación falló, se borra para no dejarla a medias.
    if (created) await dropDatabase(database, { maintenanceDb }).catch(() => {})
    throw error
  }
}

export async function dropDatabase(database, { maintenanceDb = process.env.PGMAINTENANCE_DB || 'postgres' } = {}) {
  if (!VALID_NAME.test(database)) throw new InstallError(`Nombre de base de datos no válido: "${database}".`)
  await withClient(maintenanceDb, (c) => c.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`))
}
