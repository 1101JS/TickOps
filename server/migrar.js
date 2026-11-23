// Aplica a la base (PGDATABASE) las migraciones pendientes de db/migraciones/.
//   npm run migrar               aplica las pendientes, en orden
//   npm run migrar -- --estado   solo muestra cuáles están aplicadas y cuáles pendientes
// Para actualizar un servidor de cliente usa mejor "npm run actualizar": respalda antes de migrar.
import { MIGRATIONS_DIR, migrate, status } from './lib/migrations.js'
import { consoleError } from './lib/admin.js'

const database = process.env.PGDATABASE
try {
  if (!database) throw new Error('Falta PGDATABASE en .env.')
  if (process.argv.includes('--estado')) {
    const s = await status({ database })
    console.log(`Base "${database}" · carpeta ${MIGRATIONS_DIR}`)
    console.log(`Aplicadas: ${s.aplicadas.length}${s.aplicadas.length ? ` (última: ${s.aplicadas.at(-1).archivo})` : ''}`)
    console.log(`Pendientes: ${s.pendientes.length}${s.pendientes.length ? `\n${s.pendientes.map((m) => `  - ${m.archivo}`).join('\n')}` : ''}`)
    if (s.modificadas.length) console.log(`ATENCIÓN, modificadas después de aplicarse: ${s.modificadas.map((m) => m.archivo).join(', ')}`)
    if (s.desconocidas.length) console.log(`ATENCIÓN, aplicadas en la base pero sin archivo (código más viejo que la base): ${s.desconocidas.map((r) => r.version).join(', ')}`)
  } else {
    const applied = await migrate({ database, log: (line) => console.log(line) })
    console.log(applied.length ? `Listo: ${applied.length} migración(es) aplicada(s) a "${database}".` : `La base "${database}" ya está al día; no hay migraciones pendientes.`)
  }
} catch (error) {
  console.error(`Error: ${consoleError(error)}`)
  process.exitCode = 1
}
