// Actualiza un servidor de TickOps después de copiar (o descargar con git) la versión nueva del código:
//   npm run actualizar
// 1. Respaldo cifrado de la base y los adjuntos (obligatorio si está configurado BACKUP_DIR).
// 2. npm install (dependencias de la versión nueva).
// 3. Migraciones pendientes de la base (npm run migrar).
// 4. npm run build (frontend).
// Al terminar hay que reiniciar TickOps para que cargue el código nuevo.
// Opciones: --sin-respaldo (si no hay respaldo configurado, no pregunta)  --sin-dependencias  --sin-compilar
import { spawn } from 'node:child_process'
import { basename } from 'node:path'
import { backupConfig, createBackup, uploadBackups } from './backup.js'
import { consoleError } from './lib/admin.js'
import { migrate, status } from './lib/migrations.js'
import { PROJECT_ROOT } from './lib/paths.js'
import { createPrompt } from './lib/prompt.js'

const args = new Set(process.argv.slice(2))

function npm(npmArgs) {
  return new Promise((resolve, reject) => {
    // En Windows "npm" es npm.cmd: se ejecuta a través de la consola.
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', npmArgs, { cwd: PROJECT_ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`"npm ${npmArgs.join(' ')}" terminó con código ${code}.`))))
  })
}

async function backupStep() {
  const config = backupConfig()
  if (config.dir && config.password.length >= 12) {
    console.log('1/4 Respaldo de la base antes de actualizar...')
    const result = await createBackup(config)
    console.log(`    Respaldo creado: ${basename(result.path)} (${Math.ceil(result.bytes / 1024)} KB).`)
    if (config.remote) {
      await uploadBackups(config).then(() => console.log(`    Copiado a ${config.remote}.`), (error) => console.log(`    Aviso: no se pudo subir a la nube (${error.message}); el respaldo local sí quedó.`))
    }
    return
  }
  if (args.has('--sin-respaldo')) {
    console.log('1/4 Respaldo omitido (--sin-respaldo).')
    return
  }
  const prompt = createPrompt()
  try {
    console.log('1/4 No hay respaldo configurado (BACKUP_DIR y BACKUP_PASSWORD en .env).')
    if (!(await prompt.confirm('¿Continuar SIN respaldo? Si algo sale mal no habrá copia para volver atrás.', false))) {
      throw new Error('Actualización cancelada. Configura el respaldo en .env o usa --sin-respaldo.')
    }
  } finally {
    prompt.close()
  }
}

try {
  const database = process.env.PGDATABASE
  if (!database) throw new Error('Falta PGDATABASE en .env.')
  console.log(`TickOps · actualización (base "${database}")\n`)

  // Antes de tocar nada: que las migraciones del código nuevo sean aplicables a esta base.
  const before = await status({ database })
  if (before.modificadas.length || before.desconocidas.length) await migrate({ database }) // lanza el error explicativo
  console.log(`Migraciones pendientes: ${before.pendientes.length}${before.pendientes.length ? ` (${before.pendientes.map((m) => m.archivo).join(', ')})` : ''}\n`)

  await backupStep()

  if (args.has('--sin-dependencias')) console.log('2/4 Dependencias omitidas (--sin-dependencias).')
  else {
    console.log('2/4 Instalando dependencias (npm install)...')
    await npm(['install', '--no-audit', '--no-fund'])
  }

  console.log('3/4 Aplicando migraciones...')
  const applied = await migrate({ database, log: (line) => console.log(`    ${line}`) })
  console.log(`    ${applied.length ? `${applied.length} migración(es) aplicada(s).` : 'La base ya estaba al día.'}`)

  if (args.has('--sin-compilar')) console.log('4/4 Compilación omitida (--sin-compilar).')
  else {
    console.log('4/4 Compilando el frontend (npm run build)...')
    await npm(['run', 'build'])
  }

  console.log('\nActualización terminada. Reinicia TickOps (cierra y vuelve a abrir el servidor) para usar la versión nueva.')
  process.exitCode = 0
} catch (error) {
  console.error(`\nError: ${consoleError(error)}`)
  console.error('La actualización se detuvo. Una migración que falla se revierte sola (la base queda como antes de ella).')
  console.error('Si se llegó a crear el respaldo de este paso, está en BACKUP_DIR.')
  process.exitCode = 1
}
