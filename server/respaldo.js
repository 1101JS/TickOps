// Respaldos desde la consola.
//   npm run respaldo                         crea un respaldo cifrado ahora mismo en BACKUP_DIR
//   npm run respaldo -- listar               muestra los respaldos guardados
//   npm run descifrar-respaldo -- <archivo>  descifra un respaldo y explica cómo restaurarlo
//   npm run respaldo -- restaurar-adjuntos   descifra los adjuntos respaldados que falten en ATTACHMENTS_DIR
import { basename } from 'node:path'
import { backupConfig, createBackup, decryptBackup, listBackups, pgTool, restoreAttachments } from './backup.js'

const config = backupConfig()
const [command, file] = process.argv.slice(2)

try {
  if (command === 'descifrar') {
    if (!file) throw new Error('Indica el archivo: npm run descifrar-respaldo -- "ruta\\tickops-....dump.enc"')
    if (!config.password) throw new Error('Falta BACKUP_PASSWORD en .env.')
    const output = await decryptBackup(file, config.password)
    const restore = pgTool('pg_restore', config.pgBin)
    console.log(`Descifrado: ${output}\n`)
    console.log('Para restaurarlo en una base NUEVA (no sobrescribe la actual):')
    console.log('  1. createdb sistema_incidencias_restaurada')
    console.log(`  2. "${restore}" --no-owner -d sistema_incidencias_restaurada "${output}"`)
    console.log('Revisa los datos y, si todo está bien, apunta PGDATABASE del .env a la base restaurada.')
    console.log('Borra el archivo .dump descifrado cuando termines: no está cifrado.')
  } else if (command === 'restaurar-adjuntos') {
    if (!config.dir || !config.password) throw new Error('Faltan BACKUP_DIR o BACKUP_PASSWORD en .env.')
    const restored = await restoreAttachments(config)
    console.log(`${restored} adjunto(s) restaurado(s) en ${config.attachmentsDir}`)
  } else if (command === 'listar') {
    if (!config.dir) throw new Error('Falta BACKUP_DIR en .env.')
    const items = await listBackups(config.dir)
    console.log(`${items.length} respaldo(s) en ${config.dir}`)
    for (const item of items) console.log(`  ${item.name}  ${Math.ceil(item.size / 1024)} KB`)
  } else if (!command) {
    const result = await createBackup(config)
    console.log(`Respaldo creado: ${result.path} (${Math.ceil(result.bytes / 1024)} KB)`)
    if (result.attachments) console.log(`Adjuntos nuevos respaldados: ${result.attachments}`)
    if (result.removed.length) console.log(`Borrados por antigüedad: ${result.removed.map((n) => basename(n)).join(', ')}`)
  } else {
    throw new Error(`Comando desconocido: ${command}. Usa: (nada), listar, restaurar-adjuntos o descifrar.`)
  }
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exitCode = 1
}
