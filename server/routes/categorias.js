// /api/categorias: administración de categorías (solo Administrador).
// La categoría define el departamento que atiende una incidencia, por eso:
//  - no se cambia de departamento una categoría que ya tiene incidencias;
//  - una categoría usada no se elimina: se desactiva (deja de ofrecerse, pero conserva su historial).
import { Router } from 'express'
import { HttpError, text } from '../lib/http.js'
import { activeDepartment } from '../lib/users.js'
import { numericId, requireRole } from '../middleware.js'

const router = Router()
router.param('id', numericId)
router.use(requireRole(['admin']))

const CATEGORY_SELECT = `
  SELECT c.id_categoria, c.nombre, c.descripcion, c.activa, c.id_departamento, d.nombre AS departamento,
         (SELECT COUNT(*) FROM incidencias i WHERE i.id_categoria = c.id_categoria) AS incidencias,
         (SELECT COUNT(*) FROM incidencias i JOIN estados_incidencia e ON e.id_estado = i.id_estado
           WHERE i.id_categoria = c.id_categoria AND NOT e.es_estado_final) AS abiertas,
         (SELECT COUNT(*) FROM articulos_faq f WHERE f.id_categoria = c.id_categoria) AS articulos
  FROM categorias c JOIN departamentos d ON d.id_departamento = c.id_departamento`

function shapeCategory(row) {
  return {
    id: row.id_categoria,
    nombre: row.nombre,
    descripcion: row.descripcion,
    activa: row.activa,
    departamentoId: row.id_departamento,
    departamento: row.departamento,
    incidencias: row.incidencias,
    abiertas: row.abiertas,
    enUso: row.incidencias > 0 || row.articulos > 0
  }
}

async function findCategory(db, id) {
  const row = await db.first(`${CATEGORY_SELECT} WHERE c.id_categoria = $1`, [id])
  if (!row) throw new HttpError(404, 'Categoría no encontrada.')
  return row
}

router.get('/', async (req, res) => {
  const { db } = req.app.locals
  const rows = await db.all(`${CATEGORY_SELECT} ORDER BY d.nombre, c.nombre`)
  res.json({ categorias: rows.map(shapeCategory) })
})

router.post('/', async (req, res) => {
  const { db } = req.app.locals
  const { body } = req
  const nombre = text(body.nombre, 'nombre', { max: 80 })
  const descripcion = text(body.descripcion, 'descripción', { max: 200, required: false }) || null
  const departamento = await activeDepartment(db, body.idDepartamento)
  const created = await db.first(
    'INSERT INTO categorias (id_departamento, nombre, descripcion) VALUES ($1, $2, $3) RETURNING id_categoria',
    [departamento.id_departamento, nombre, descripcion]
  )
  res.status(201).json({ categoria: shapeCategory(await findCategory(db, created.id_categoria)) })
})

router.patch('/:id', async (req, res) => {
  const { db } = req.app.locals
  const { body } = req
  const current = await findCategory(db, Number(req.params.id))
  const sets = {}

  if (body.nombre !== undefined) sets.nombre = text(body.nombre, 'nombre', { max: 80 })
  if (body.descripcion !== undefined) sets.descripcion = text(body.descripcion, 'descripción', { max: 200, required: false }) || null
  if (body.idDepartamento !== undefined) {
    const departamento = await activeDepartment(db, body.idDepartamento)
    if (departamento.id_departamento !== current.id_departamento) {
      if (current.incidencias > 0) {
        throw new HttpError(409, `No se puede mover a otro departamento: ya tiene ${current.incidencias} incidencia(s). Crea una categoría nueva en el otro departamento.`)
      }
      sets.id_departamento = departamento.id_departamento
    }
  }
  if (body.activa !== undefined) {
    if (typeof body.activa !== 'boolean') throw new HttpError(400, 'El campo "activa" debe ser verdadero o falso.')
    sets.activa = body.activa
  }

  const keys = Object.keys(sets)
  if (keys.length) {
    await db.run(
      `UPDATE categorias SET ${keys.map((key, index) => `${key} = $${index + 2}`).join(', ')} WHERE id_categoria = $1`,
      [current.id_categoria, ...keys.map((key) => sets[key])]
    )
  }
  res.json({ categoria: shapeCategory(await findCategory(db, current.id_categoria)) })
})

router.delete('/:id', async (req, res) => {
  const { db } = req.app.locals
  const current = await findCategory(db, Number(req.params.id))
  if (shapeCategory(current).enUso) {
    throw new HttpError(409, 'Esta categoría ya se usó en incidencias o artículos: desactívala en lugar de eliminarla.')
  }
  await db.run('DELETE FROM categorias WHERE id_categoria = $1', [current.id_categoria])
  res.json({ ok: true })
})

export default router
