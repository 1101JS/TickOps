// Adjuntos de incidencias: tipos permitidos, validación del contenido y almacenamiento en disco.
// La tabla "adjuntos" guarda los datos del archivo y la ruta; el archivo vive en ATTACHMENTS_DIR
// (por defecto la carpeta "adjuntos" del proyecto) con un nombre aleatorio que no se puede adivinar.
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HttpError } from './http.js'

export const MAX_BYTES = 5 * 1024 * 1024 // igual que la restricción CHECK de la tabla
export const MAX_FILES_PER_UPLOAD = 5
export const MAX_FILES_PER_INCIDENT = 20

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export function attachmentsDir(env = process.env) {
  return resolve(env.ATTACHMENTS_DIR || join(projectRoot, 'adjuntos'))
}

// Extensión → tipo MIME y firma esperada al inicio del archivo (null = texto, sin firma fija).
// No se aceptan HTML, SVG ni ejecutables: podrían ejecutar código al abrirlos.
const ZIP = [0x50, 0x4b, 0x03, 0x04]
const TYPES = {
  '.png': { mime: 'image/png', magic: [[0x89, 0x50, 0x4e, 0x47]], inline: true },
  '.jpg': { mime: 'image/jpeg', magic: [[0xff, 0xd8, 0xff]], inline: true },
  '.jpeg': { mime: 'image/jpeg', magic: [[0xff, 0xd8, 0xff]], inline: true },
  '.gif': { mime: 'image/gif', magic: [[0x47, 0x49, 0x46, 0x38]], inline: true },
  '.webp': { mime: 'image/webp', magic: [[0x52, 0x49, 0x46, 0x46]], inline: true },
  '.pdf': { mime: 'application/pdf', magic: [[0x25, 0x50, 0x44, 0x46]], inline: true },
  '.txt': { mime: 'text/plain; charset=utf-8', magic: null, inline: true },
  '.log': { mime: 'text/plain; charset=utf-8', magic: null, inline: true },
  '.csv': { mime: 'text/csv; charset=utf-8', magic: null, inline: false },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: [ZIP] },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: [ZIP] },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', magic: [ZIP] },
  '.zip': { mime: 'application/zip', magic: [ZIP] }
}
export const ALLOWED_EXTENSIONS = Object.keys(TYPES)

function startsWith(buffer, bytes) {
  return bytes.every((byte, index) => buffer[index] === byte)
}

// Nombre para mostrar: sin rutas ni caracteres de control, máximo 255.
export function cleanFileName(name) {
  const base = String(name || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return (base || 'archivo').slice(-255)
}

// Comprueba extensión, tamaño y que el contenido corresponda al tipo declarado. Devuelve { nombre, mime, extension }.
export function validateFile(file) {
  const nombre = cleanFileName(file.originalname)
  const extension = extname(nombre).toLowerCase()
  const type = TYPES[extension]
  if (!type) throw new HttpError(400, `"${nombre}": tipo de archivo no permitido. Se aceptan ${ALLOWED_EXTENSIONS.join(', ')}.`)
  if (!file.size) throw new HttpError(400, `"${nombre}" está vacío.`)
  if (file.size > MAX_BYTES) throw new HttpError(413, `"${nombre}" supera el máximo de 5 MB.`)
  if (type.magic && !type.magic.some((bytes) => startsWith(file.buffer, bytes))) {
    throw new HttpError(400, `"${nombre}" no parece un archivo ${extension} válido.`)
  }
  if (!type.magic && file.buffer.includes(0)) throw new HttpError(400, `"${nombre}" no es un archivo de texto.`)
  return { nombre, mime: type.mime, extension }
}

// Para los comentarios solo se aceptan imágenes.
export function validateImage(file) {
  const checked = validateFile(file)
  if (!checked.mime.startsWith('image/')) throw new HttpError(400, `"${checked.nombre}": en los comentarios solo se pueden agregar imágenes (png, jpg, gif, webp).`)
  return checked
}

export function isInline(mime) {
  return Object.values(TYPES).some((type) => type.mime === mime && type.inline)
}

// Guarda el archivo con un nombre aleatorio (conservando la extensión) y devuelve la ruta relativa guardada en la base.
export async function storeFile(dir, buffer, extension) {
  await mkdir(dir, { recursive: true })
  const stored = `${randomUUID()}${extension}`
  await writeFile(join(dir, stored), buffer, { flag: 'wx' })
  return stored
}

// Ruta absoluta de un adjunto, sin permitir salir de la carpeta de adjuntos.
export function filePath(dir, stored) {
  const target = resolve(dir, stored)
  if (!target.startsWith(resolve(dir) + sep)) throw new HttpError(404, 'Adjunto no encontrado.')
  return target
}

export async function removeFile(dir, stored) {
  await rm(filePath(dir, stored), { force: true })
}

export function shapeAttachment(row) {
  return {
    id: row.id_adjunto,
    nombre: row.nombre_archivo,
    tipo: row.tipo_mime,
    tamano: row.tamano_bytes,
    fecha: row.fecha_subida,
    autorId: row.id_usuario,
    autor: row.autor,
    comentarioId: row.id_comentario ?? null,
    esImagen: row.tipo_mime.startsWith('image/')
  }
}
