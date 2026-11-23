// Instalación de TickOps en un servidor nuevo:
//   npm run instalar
// 1. Si no existe .env, pide los datos de conexión a PostgreSQL y lo crea con claves generadas al azar.
// 2. Crea la base de datos (PGDATABASE) y carga db/esquema.sql + db/catalogos.sql (+ db/plantilla.sql si se elige).
//    Nunca instala sobre una base que ya tenga tablas.
// 3. Crea el primer administrador.
// Opciones: --con-plantilla | --sin-plantilla (no pregunta)   --sin-admin (no crea el administrador)
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { consoleError, promptAndCreateAdmin } from './lib/admin.js'
import { InstallError, installDatabase } from './lib/install.js'
import { createPrompt } from './lib/prompt.js'
import { createDb } from './db.js'

const ENV_PATH = join(process.cwd(), '.env')
const args = new Set(process.argv.slice(2))
const prompt = createPrompt()

const secret = () => randomBytes(32).toString('hex')
// Valor seguro para .env: entre comillas simples (o dobles si contiene comillas simples).
const envValue = (value) => (String(value).includes("'") ? `"${String(value).replace(/"/g, '\\"')}"` : `'${value}'`)

async function createEnvFile() {
  console.log('No hay archivo .env: vamos a crearlo. Enter acepta el valor entre corchetes.\n')
  const values = {
    PGHOST: await prompt.ask('Servidor de PostgreSQL: ', { defaultValue: 'localhost' }),
    PGPORT: await prompt.ask('Puerto de PostgreSQL: ', { defaultValue: '5432' }),
    PGUSER: await prompt.ask('Usuario de PostgreSQL: ', { defaultValue: 'postgres' }),
    PGPASSWORD: await prompt.ask('Contraseña de ese usuario: ', { hidden: true }),
    PGDATABASE: await prompt.ask('Nombre de la base de datos nueva: ', { defaultValue: 'tickops' }),
    PORT: await prompt.ask('Puerto web de TickOps: ', { defaultValue: '3000' })
  }
  const backupPassword = randomBytes(18).toString('base64url')
  const sessionSecret = secret()
  const content = [
    '# Configuración de TickOps (creada por "npm run instalar"). No compartas este archivo.',
    '',
    '# Conexión a PostgreSQL',
    ...['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'].map((key) => `${key}=${envValue(values[key])}`),
    '',
    '# Servidor web',
    `PORT=${values.PORT}`,
    'HOST=0.0.0.0',
    `SESSION_SECRET=${sessionSecret}`,
    'ALLOW_REGISTRATION=false',
    '',
    '# Respaldo automático cifrado (ver README). Guarda BACKUP_PASSWORD también FUERA de este equipo:',
    '# sin ella los respaldos no se pueden abrir. Para activarlo, escribe la carpeta en BACKUP_DIR.',
    `BACKUP_PASSWORD=${backupPassword}`,
    'BACKUP_DIR=',
    ''
  ].join('\n')
  await writeFile(ENV_PATH, content, { flag: 'wx' })
  Object.assign(process.env, values, { SESSION_SECRET: sessionSecret, BACKUP_PASSWORD: backupPassword })
  console.log('\n.env creado.')
  console.log(`IMPORTANTE: anota la clave de respaldo en un lugar seguro fuera de este equipo: ${backupPassword}\n`)
}

async function ensureSessionSecret() {
  if (process.env.SESSION_SECRET) return
  const value = secret()
  await appendFile(ENV_PATH, `\n# Firma de las sesiones (generada por "npm run instalar")\nSESSION_SECRET=${value}\n`)
  process.env.SESSION_SECRET = value
  console.log('Se agregó SESSION_SECRET a .env.')
}

async function chooseTemplate() {
  if (args.has('--con-plantilla')) return true
  if (args.has('--sin-plantilla')) return false
  return prompt.confirm('¿Cargar departamentos y categorías de ejemplo (Informática, Mantenimiento, RR. HH., Operaciones)?')
}

let db = null
try {
  console.log('TickOps · instalación\n')
  if (!existsSync(ENV_PATH)) await createEnvFile()
  else console.log('Usando la configuración de .env.')
  await ensureSessionSecret()

  const database = process.env.PGDATABASE
  if (!database) throw new InstallError('Falta PGDATABASE en .env (nombre de la base de datos que se va a crear).')
  console.log(`Base de datos: "${database}" en ${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}\n`)

  const template = await chooseTemplate()
  const result = await installDatabase({ database, template })
  console.log(`\n${result.created ? 'Base creada' : 'Base vacía encontrada'} e instalada: ${result.tablas} tablas, ${result.departamentos} departamento(s), ${result.categorias} categoría(s).`)

  if (!args.has('--sin-admin')) {
    console.log('\nPrimer administrador')
    db = createDb({ database, max: 1 })
    const admin = await promptAndCreateAdmin(db, prompt.ask)
    console.log(`Administrador #${admin.id} (${admin.correo}) creado.`)
  }

  console.log('\nInstalación terminada. Para arrancar TickOps:')
  console.log('   npm run build')
  console.log('   npm run lan')
  console.log(`y abre http://localhost:${process.env.PORT || 3000}`)
  if (!result.departamentos) console.log('Recuerda crear al menos un departamento con sus categorías (panel del administrador → Departamentos).')
  process.exitCode = 0
} catch (error) {
  console.error(`\nError: ${consoleError(error)}`)
  if (error.code === '42501') console.error('El usuario de PostgreSQL no tiene permiso para crear bases de datos (CREATEDB).')
  process.exitCode = 1
} finally {
  prompt.close()
  await db?.end()
}
