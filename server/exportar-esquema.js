// Genera db/esquema.sql a partir de la base de desarrollo (PGDATABASE en .env), con pg_dump --schema-only.
//   npm run exportar-esquema                 vuelve a escribir db/esquema.sql
//   npm run exportar-esquema -- --comprobar  solo avisa si db/esquema.sql está desactualizado (no escribe)
// Úsalo cada vez que cambie la estructura de la base (tablas, triggers, funciones...).
// Los catálogos (db/catalogos.sql) y la plantilla (db/plantilla.sql) se mantienen a mano.
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pgTool } from './backup.js'
import { DB_DIR, cleanSchemaDump } from './lib/install.js'

const target = join(DB_DIR, 'esquema.sql')
const checkOnly = process.argv.includes('--comprobar')

function dumpSchema(database) {
  return new Promise((resolve, reject) => {
    const child = spawn(pgTool('pg_dump', process.env.PG_BIN || ''), ['--schema-only', '--no-owner', '--no-privileges', '--no-password', database], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim() || `pg_dump terminó con código ${code}`))))
  })
}

try {
  const database = process.env.PGDATABASE
  if (!database) throw new Error('Falta PGDATABASE en .env (la base de la que se exporta el esquema).')
  const schema = cleanSchemaDump(await dumpSchema(database))
  const current = await readFile(target, 'utf8').catch(() => '')
  if (checkOnly) {
    if (current.replace(/\r\n/g, '\n') === schema) {
      console.log(`db/esquema.sql está al día con la base "${database}".`)
    } else {
      console.error(`db/esquema.sql NO coincide con la base "${database}". Ejecuta: npm run exportar-esquema`)
      process.exitCode = 1
    }
  } else {
    await writeFile(target, schema)
    console.log(`Listo: db/esquema.sql generado desde "${database}" (${schema.split('\n').length} líneas).`)
  }
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exitCode = 1
}
