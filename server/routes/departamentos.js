// /api/departamentos: administración de departamentos (solo Administrador).
// El departamento atiende las incidencias de sus categorías con sus agentes. Reglas:
//  - no se desactiva con incidencias abiertas (hay que transferirlas o cerrarlas antes), ni si es el último activo;
//  - al desactivarlo, sus categorías dejan de ofrecerse en incidencias nuevas (los catálogos solo muestran activos);
//  - uno que ya se usó (categorías, usuarios o transferencias) no se elimina: se desactiva y conserva su historial.
import { Router } from 'express'
import { HttpError, text } from '../lib/http.js'
import { numericId, requireRole } from '../middleware.js'

const router = Router()
router.param('id', numericId)
router.use(requireRole(['admin']))

const DEPARTMENT_SELECT = `
  SELECT d.id_departamento, d.nombre, d.descripcion, d.activo, d.fecha_creacion,
         (SELECT COUNT(*) FROM categorias c WHERE c.id_departamento = d.id_departamento) AS categorias,
         (SELECT COUNT(*) FROM categorias c WHERE c.id_departamento = d.id_departamento AND c.activa) AS categorias_activas,
         (SELECT COUNT(*) FROM usuarios u WHERE u.id_departamento = d.id_departamento) AS usuarios,
         (SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
           WHERE u.id_departamento = d.id_departamento AND u.activo AND r.nombre = 'Agente') AS agentes,
         (SELECT COUNT(*) FROM incidencias i JOIN categorias c ON c.id_categoria = i.id_categoria
           WHERE c.id_departamento = d.id_departamento) AS incidencias,
         (SELECT COUNT(*) FROM incidencias i JOIN categorias c ON c.id_categoria = i.id_categoria
           JOIN estados_incidencia e ON e.id_estado = i.id_estado
           WHERE c.id_departamento = d.id_departamento AND NOT e.es_estado_final) AS abiertas,
         (SELECT COUNT(*) FROM transferencias_departamento t
           WHERE d.id_departamento IN (t.id_departamento_origen, t.id_departamento_destino)) AS transferencias
  FROM departamentos d`

function shapeDepartment(row) {
  return {
    id: row.id_departamento,
    nombre: row.nombre,
    descripcion: row.descripcion,
    activo: row.activo,
    fechaCreacion: row.fecha_creacion,
    categorias: row.categorias,
    categoriasActivas: row.categorias_activas,
    usuarios: row.usuarios,
    agentes: row.agentes,
    incidencias: row.incidencias,
    abiertas: row.abiertas,
    transferencias: row.transferencias,
    enUso: row.categorias > 0 || row.usuarios > 0 || row.transferencias > 0
  }
}

async function findDepartment(db, id) {
  const row = await db.first(`${DEPARTMENT_SELECT} WHERE d.id_departamento = $1`, [id])
  if (!row) throw new HttpError(404, 'Departamento no encontrado.')
  return row
}

router.get('/', async (req, res) => {
  const { db } = req.app.locals
  const rows = await db.all(`${DEPARTMENT_SELECT} ORDER BY d.activo DESC, d.nombre`)
  res.json({ departamentos: rows.map(shapeDepartment) })
})

router.post('/', async (req, res) => {
  const { db } = req.app.locals
  const { body } = req
  const nombre = text(body.nombre, 'nombre', { max: 80 })
  const descripcion = text(body.descripcion, 'descripción', { max: 200, required: false }) || null
  const created = await db.first(
    'INSERT INTO departamentos (nombre, descripcion) VALUES ($1, $2) RETURNING id_departamento',
    [nombre, descripcion]
  )
  res.status(201).json({ departamento: shapeDepartment(await findDepartment(db, created.id_departamento)) })
})

router.patch('/:id', async (req, res) => {
  const { db } = req.app.locals
  const { body } = req
  const id = Number(req.params.id)
  const updated = await db.tx(async (tx) => {
    // Se bloquea la fila para que dos cambios simultáneos no dejen, por ejemplo, ningún departamento activo.
    await tx.first('SELECT id_departamento FROM departamentos WHERE id_departamento = $1 FOR UPDATE', [id])
    const current = await findDepartment(tx, id)
    const sets = {}

    if (body.nombre !== undefined) sets.nombre = text(body.nombre, 'nombre', { max: 80 })
    if (body.descripcion !== undefined) sets.descripcion = text(body.descripcion, 'descripción', { max: 200, required: false }) || null
    if (body.activo !== undefined) {
      if (typeof body.activo !== 'boolean') throw new HttpError(400, 'El campo "activo" debe ser verdadero o falso.')
      if (current.activo && !body.activo) {
        if (current.abiertas > 0) {
          throw new HttpError(409, `No se puede desactivar: tiene ${current.abiertas} incidencia(s) abierta(s). Transfiérelas a otro departamento o ciérralas primero.`)
        }
        const { activos } = await tx.first('SELECT COUNT(*) AS activos FROM departamentos WHERE activo AND id_departamento <> $1', [id])
        if (activos === 0) throw new HttpError(409, 'No se puede desactivar el único departamento activo: las incidencias nuevas no tendrían a dónde ir.')
      }
      sets.activo = body.activo
    }

    const keys = Object.keys(sets)
    if (keys.length) {
      await tx.run(
        `UPDATE departamentos SET ${keys.map((key, index) => `${key} = $${index + 2}`).join(', ')} WHERE id_departamento = $1`,
        [id, ...keys.map((key) => sets[key])]
      )
    }
    return findDepartment(tx, id)
  })
  res.json({ departamento: shapeDepartment(updated) })
})

router.delete('/:id', async (req, res) => {
  const { db } = req.app.locals
  const current = shapeDepartment(await findDepartment(db, Number(req.params.id)))
  if (current.enUso) {
    const uses = [
      current.categorias && `${current.categorias} categoría(s)`,
      current.usuarios && `${current.usuarios} usuario(s)`,
      current.transferencias && `${current.transferencias} transferencia(s)`
    ].filter(Boolean).join(', ')
    throw new HttpError(409, `Este departamento ya se usó (${uses}): desactívalo en lugar de eliminarlo.`)
  }
  await db.run('DELETE FROM departamentos WHERE id_departamento = $1', [current.id])
  res.json({ ok: true })
})

export default router
