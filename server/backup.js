// Respaldo cifrado de la base de datos (pg_dump + AES-256-GCM).
//
// Variables (.env):
//   BACKUP_DIR       carpeta de destino (p. ej. una carpeta sincronizada con OneDrive o Google Drive)
//   BACKUP_PASSWORD  clave para cifrar/descifrar. Guárdala también FUERA de la PC: sin ella los respaldos no sirven.
//   BACKUP_KEEP      cuántos respaldos conservar (14 por defecto); los más viejos se borran
//   PG_BIN           carpeta de pg_dump si no está en el PATH (por defecto se busca en C:\Program Files\PostgreSQL\*\bin)
//
// Formato del archivo .dump.enc: "TKBK1" + sal (16 bytes) + IV (12) + datos cifrados + etiqueta GCM (16).
// Al descifrarlo se obtiene un volcado en formato personalizado de PostgreSQL (pg_restore).
//
// Adjuntos: pg_dump no incluye los archivos subidos (ATTACHMENTS_DIR). En cada respaldo se copian cifrados
// a BACKUP_DIR\adjuntos los que todavía no estén ahí (mismo formato, extensión .enc). No se borran de esa
// carpeta aunque se eliminen de la incidencia, porque un respaldo anterior de la base puede referirse a ellos.
import { spawn } from 'node:child_process'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { createWriteStream, existsSync, readdirSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { attachmentsDir } from './lib/attachments.js'

const MAGIC = Buffer.from('TKBK1')
const PREFIX = 'tickops-'
const SUFFIX = '.dump.enc'
const DAY_MS = 24 * 3600 * 1000

function deriveKey(password, salt) {
  return scryptSync(password, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}

export function backupConfig(env = process.env) {
  return {
    dir: env.BACKUP_DIR || '',
    password: env.BACKUP_PASSWORD || '',
    keep: Math.max(1, Number(env.BACKUP_KEEP || 14)),
    pgBin: env.PG_BIN || '',
    attachmentsDir: attachmentsDir(env)
  }
}

// Busca pg_dump/pg_restore: PG_BIN, luego la versión más nueva en C:\Program Files\PostgreSQL, luego el PATH.
export function pgTool(name, pgBin = '') {
  const exe = process.platform === 'win32' ? `${name}.exe` : name
  if (pgBin) return join(pgBin, exe)
  const base = 'C:\\Program Files\\PostgreSQL'
  if (process.platform === 'win32' && existsSync(base)) {
    const versions = readdirSync(base).filter((v) => existsSync(join(base, v, 'bin', exe))).sort((a, b) => Number(b) - Number(a))
    if (versions.length) return join(base, versions[0], 'bin', exe)
  }
  return name
}

function timestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

// Respaldos existentes, del más nuevo al más viejo.
export async function listBackups(dir) {
  if (!existsSync(dir)) return []
  const names = (await readdir(dir)).filter((n) => n.startsWith(PREFIX) && n.endsWith(SUFFIX))
  const items = await Promise.all(names.map(async (name) => ({ name, path: join(dir, name), ...(await stat(join(dir, name))) })))
  return items.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

// Crea un respaldo cifrado y borra los que sobren. Devuelve { path, bytes, removed }.
export async function createBackup(config = backupConfig()) {
  if (!config.dir) throw new Error('Falta BACKUP_DIR en .env (carpeta donde guardar los respaldos).')
  if (config.password.length < 12) throw new Error('Falta BACKUP_PASSWORD en .env (mínimo 12 caracteres).')
  await mkdir(config.dir, { recursive: true })

  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(config.password, salt), iv)
  const final = join(config.dir, `${PREFIX}${timestamp()}${SUFFIX}`)
  const partial = `${final}.parcial`

  const out = createWriteStream(partial)
  out.write(Buffer.concat([MAGIC, salt, iv]))
  // pg_dump toma la conexión de las variables PG* (las mismas del servidor). Formato personalizado: comprimido.
  const dump = spawn(pgTool('pg_dump', config.pgBin), ['--format=custom', '--no-password'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  dump.stderr.on('data', (chunk) => { stderr += chunk })

  try {
    await new Promise((resolve, reject) => {
      out.on('error', (error) => reject(new Error(`No se pudo escribir en ${config.dir} (${error.message}).`)))
      dump.on('error', (error) => reject(new Error(`No se pudo ejecutar pg_dump (${error.message}). Configura PG_BIN en .env.`)))
      dump.stdout.on('data', (chunk) => out.write(cipher.update(chunk)))
      dump.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump terminó con error: ${stderr.trim() || `código ${code}`}`))))
    })
    out.write(cipher.final())
    out.write(cipher.getAuthTag())
    await new Promise((resolve, reject) => out.end((error) => (error ? reject(error) : resolve())))
    await rename(partial, final)
  } catch (error) {
    out.destroy()
    await rm(partial, { force: true })
    throw error
  }

  const all = await listBackups(config.dir)
  const removed = []
  for (const old of all.slice(config.keep)) {
    await rm(old.path, { force: true })
    removed.push(old.name)
  }
  const attachments = config.attachmentsDir ? await syncAttachments(config) : 0
  return { path: final, bytes: (await stat(final)).size, removed, attachments }
}

function encryptBuffer(buffer, password) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(password, salt), iv)
  return Buffer.concat([MAGIC, salt, iv, cipher.update(buffer), cipher.final(), cipher.getAuthTag()])
}

function decryptBuffer(data, password) {
  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('El archivo no es un respaldo de TickOps.')
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(password, data.subarray(5, 21)), data.subarray(21, 33))
  decipher.setAuthTag(data.subarray(data.length - 16))
  try {
    return Buffer.concat([decipher.update(data.subarray(33, data.length - 16)), decipher.final()])
  } catch {
    throw new Error('Clave incorrecta o archivo dañado.')
  }
}

// Copia cifrados a BACKUP_DIR\adjuntos los adjuntos que aún no estén respaldados. Devuelve cuántos copió.
export async function syncAttachments(config) {
  if (!existsSync(config.attachmentsDir)) return 0
  const target = join(config.dir, 'adjuntos')
  await mkdir(target, { recursive: true })
  const done = new Set(await readdir(target))
  let copied = 0
  for (const name of await readdir(config.attachmentsDir)) {
    if (done.has(`${name}.enc`) || name.endsWith('.parcial')) continue
    const encrypted = encryptBuffer(await readFile(join(config.attachmentsDir, name)), config.password)
    await writeFile(join(target, `${name}.enc.parcial`), encrypted)
    await rename(join(target, `${name}.enc.parcial`), join(target, `${name}.enc`))
    copied++
  }
  return copied
}

// Descifra los adjuntos respaldados y los deja en ATTACHMENTS_DIR (solo los que falten). Devuelve cuántos restauró.
export async function restoreAttachments(config) {
  const source = join(config.dir, 'adjuntos')
  if (!existsSync(source)) return 0
  await mkdir(config.attachmentsDir, { recursive: true })
  const present = new Set(await readdir(config.attachmentsDir))
  let restored = 0
  for (const name of await readdir(source)) {
    if (!name.endsWith('.enc')) continue
    const original = name.slice(0, -4)
    if (present.has(original)) continue
    await writeFile(join(config.attachmentsDir, original), decryptBuffer(await readFile(join(source, name)), config.password))
    restored++
  }
  return restored
}

// Descifra un respaldo y escribe el volcado listo para pg_restore. Devuelve la ruta del .dump.
export async function decryptBackup(file, password, output = file.replace(/\.enc$/, '')) {
  const plain = decryptBuffer(await readFile(file), password)
  await writeFile(output, plain)
  return output
}

// Respaldo automático mientras el servidor está encendido: revisa al arrancar y cada hora;
// si el último respaldo tiene 24 h o más (o no hay ninguno), crea uno nuevo.
export function scheduleBackups(config = backupConfig(), log = console) {
  if (!config.dir) {
    log.log('Respaldo automático desactivado (falta BACKUP_DIR en .env).')
    return null
  }
  if (config.password.length < 12) {
    log.log('Respaldo automático desactivado: falta BACKUP_PASSWORD en .env (no se guardan respaldos sin cifrar).')
    return null
  }
  let running = false
  let first = true
  async function check() {
    if (running) return
    running = true
    try {
      const [latest] = await listBackups(config.dir)
      if (latest && Date.now() - latest.mtimeMs < DAY_MS) {
        if (first) log.log(`Respaldo automático activo (${config.dir}). Último: ${latest.name}.`)
        return
      }
      const result = await createBackup(config)
      log.log(`Respaldo creado: ${basename(result.path)} (${Math.ceil(result.bytes / 1024)} KB)${result.attachments ? `; ${result.attachments} adjunto(s) nuevos copiados` : ''}${result.removed.length ? `; borrados ${result.removed.length} antiguos` : ''}.`)
    } catch (error) {
      log.error(`Error en el respaldo automático: ${error.message}`)
    } finally {
      running = false
      first = false
    }
  }
  check()
  const timer = setInterval(check, 3600 * 1000)
  timer.unref()
  return timer
}
