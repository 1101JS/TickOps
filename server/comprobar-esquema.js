// Comprueba que la base de desarrollo (PGDATABASE) tiene EXACTAMENTE la estructura que obtiene un cliente con
// "npm run instalar" (db/esquema.sql + db/catalogos.sql + todas las migraciones de db/migraciones/).
//   npm run comprobar-esquema
// Si alguien cambió la base a mano sin escribir la migración (o escribió una migración sin aplicarla),
// aquí aparece la diferencia. Crea una base temporal para comparar y la borra al terminar.
import { spawn } from 'node:child_process'
import { pgTool } from './backup.js'
import { cleanSchemaDump, dropDatabase, installDatabase } from './lib/install.js'

function dumpSchema(database) {
  return new Promise((resolve, reject) => {
    const args = ['--schema-only', '--no-owner', '--no-privileges', '--no-password', '--exclude-table=public.esquema_migraciones', database]
    const child = spawn(pgTool('pg_dump', process.env.PG_BIN || ''), args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(cleanSchemaDump(out)) : reject(new Error(err.trim() || `pg_dump terminó con código ${code}`))))
  })
}

// Primeras líneas distintas entre dos textos (para mostrar dónde está la diferencia).
function firstDifferences(a, b, max = 8) {
  const left = a.split('\n')
  const right = b.split('\n')
  const out = []
  for (let i = 0; i < Math.max(left.length, right.length) && out.length < max; i++) {
    if (left[i] !== right[i]) out.push(`  línea ${i + 1}\n    tu base:     ${left[i] ?? '(nada)'}\n    instalación: ${right[i] ?? '(nada)'}`)
  }
  return out.join('\n')
}

const database = process.env.PGDATABASE
const temp = `tickops_comprobar_${process.pid}_${Date.now()}`
try {
  if (!database) throw new Error('Falta PGDATABASE en .env (la base que se compara).')
  console.log(`Comparando la base "${database}" con una instalación nueva (base + migraciones)...`)
  const installed = await installDatabase({ database: temp, template: false })
  const [mine, fresh] = await Promise.all([dumpSchema(database), dumpSchema(temp)])
  if (mine === fresh) {
    console.log(`Todo en orden: "${database}" tiene la misma estructura que una instalación nueva (${installed.migraciones} migración(es) en db/migraciones).`)
  } else {
    console.error(`La estructura de "${database}" NO coincide con una instalación nueva. Primeras diferencias:\n${firstDifferences(mine, fresh)}`)
    console.error('\nSi cambiaste la base a mano, escribe ese cambio como migración en db/migraciones/. Si hay migraciones sin aplicar en tu base, ejecuta: npm run migrar')
    process.exitCode = 1
  }
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exitCode = 1
} finally {
  await dropDatabase(temp).catch(() => {})
}
