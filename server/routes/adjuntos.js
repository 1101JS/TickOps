// /api/incidencias/:id/adjuntos: subir, descargar y eliminar archivos de una incidencia.
// Se monta dentro del router de incidencias (mergeParams da acceso a :id).
//  - Ver/descargar: quien puede ver la incidencia.
//  - Subir: quien puede verla, mientras no esté en un estado final (Cerrado/Rechazado).
//  - Eliminar: quien lo subió o un administrador, mientras no esté en un estado final.
import { Router } from 'express'
import multer from 'multer'
import {
  MAX_BYTES, MAX_FILES_PER_INCIDENT, MAX_FILES_PER_UPLOAD, filePath, isInline, removeFile, storeFile, validateFile
} from '../lib/attachments.js'
import { HttpError } from '../lib/http.js'
import { findIncident, incidentDetail } from '../lib/incidents.js'
import { ALL, numericId, requireRole } from '../middleware.js'

const router = Router({ mergeParams: true })
router.param('adjuntoId', numericId)
router.use(requireRole(ALL))

// Los archivos se reciben en memoria (máx. 5 MB cada uno) y se validan antes de escribirlos en disco.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: MAX_FILES_PER_UPLOAD } })

async function findAttachment(db, incidentId, attachmentId) {
  const row = await db.first('SELECT * FROM adjuntos WHERE id_adjunto = $1 AND id_incidencia = $2', [attachmentId, incidentId])
  if (!row) throw new HttpError(404, 'Adjunto no encontrado.')
  return row
}

router.post('/', upload.array('archivos', MAX_FILES_PER_UPLOAD), async (req, res) => {
  const { db, config } = req.app.locals
  const id = Number(req.params.id)
  const files = req.files || []
  if (!files.length) throw new HttpError(400, 'Selecciona al menos un archivo (campo "archivos").')

  const incident = await findIncident(db, req.user, id)
  if (incident.es_estado_final) throw new HttpError(409, `La incidencia está en estado ${incident.estado} y es de solo lectura.`)
  const checked = files.map((file) => ({ file, ...validateFile(file) }))
  const { total } = await db.first('SELECT COUNT(*) AS total FROM adjuntos WHERE id_incidencia = $1', [id])
  if (total + files.length > MAX_FILES_PER_INCIDENT) {
    throw new HttpError(409, `Una incidencia admite hasta ${MAX_FILES_PER_INCIDENT} adjuntos (ya tiene ${total}).`)
  }

  // Primero se escriben los archivos; si la base rechaza el registro, se borran para no dejar huérfanos.
  const stored = []
  try {
    for (const item of checked) stored.push({ ...item, ruta: await storeFile(config.attachmentsDir, item.file.buffer, item.extension) })
    await db.tx(async (tx) => {
      for (const item of stored) {
        await tx.run(
          `INSERT INTO adjuntos (id_incidencia, id_usuario, nombre_archivo, ruta_almacenamiento, tipo_mime, tamano_bytes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, req.user.id, item.nombre, item.ruta, item.mime, item.file.size]
        )
      }
    })
  } catch (error) {
    await Promise.all(stored.map((item) => removeFile(config.attachmentsDir, item.ruta).catch(() => {})))
    throw error
  }
  res.status(201).json({ incidencia: await incidentDetail(db, req.user, id) })
})

router.get('/:adjuntoId', async (req, res, next) => {
  const { db, config } = req.app.locals
  const id = Number(req.params.id)
  await findIncident(db, req.user, id) // valida que el usuario pueda ver la incidencia
  const row = await findAttachment(db, id, Number(req.params.adjuntoId))

  const name = encodeURIComponent(row.nombre_archivo)
  const disposition = req.query.descargar === undefined && isInline(row.tipo_mime) ? 'inline' : 'attachment'
  res.set({
    'content-type': row.tipo_mime,
    'content-disposition': `${disposition}; filename*=UTF-8''${name}`,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    'cache-control': 'private, no-store'
  })
  res.sendFile(filePath(config.attachmentsDir, row.ruta_almacenamiento), (error) => {
    if (error && !res.headersSent) next(error.code === 'ENOENT' ? new HttpError(404, 'El archivo ya no está disponible.') : error)
  })
})

router.delete('/:adjuntoId', async (req, res) => {
  const { db, config } = req.app.locals
  const id = Number(req.params.id)
  const incident = await findIncident(db, req.user, id)
  const row = await findAttachment(db, id, Number(req.params.adjuntoId))
  if (incident.es_estado_final) throw new HttpError(409, `La incidencia está en estado ${incident.estado} y es de solo lectura.`)
  if (req.user.role !== 'admin' && row.id_usuario !== req.user.id) throw new HttpError(403, 'Solo quien subió el archivo o un administrador puede eliminarlo.')

  await db.run('DELETE FROM adjuntos WHERE id_adjunto = $1', [row.id_adjunto])
  await removeFile(config.attachmentsDir, row.ruta_almacenamiento)
  res.json({ incidencia: await incidentDetail(db, req.user, id) })
})

export default router
