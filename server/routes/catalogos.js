// /api/catalogos: departamentos, categorías activas, prioridades y estados (para formularios y filtros).
import { Router } from 'express'
import { ALL, requireRole } from '../middleware.js'

const router = Router()

router.get('/', requireRole(ALL), async (req, res) => {
  const { db } = req.app.locals
  const [departamentos, categorias, prioridades, estados] = await Promise.all([
    db.all('SELECT id_departamento, nombre, descripcion FROM departamentos WHERE activo ORDER BY nombre'),
    db.all(
      `SELECT c.id_categoria, c.nombre, c.descripcion, c.id_departamento, d.nombre AS departamento
       FROM categorias c JOIN departamentos d ON d.id_departamento = c.id_departamento
       WHERE c.activa AND d.activo ORDER BY d.nombre, c.nombre`
    ),
    db.all('SELECT id_prioridad, nombre, sla_primera_respuesta_horas, sla_resolucion_horas FROM prioridades ORDER BY id_prioridad'),
    db.all('SELECT id_estado, nombre, descripcion, es_estado_final FROM estados_incidencia ORDER BY id_estado')
  ])
  return res.json({
    departamentos: departamentos.map((d) => ({ id: d.id_departamento, nombre: d.nombre, descripcion: d.descripcion })),
    categorias: categorias.map((c) => ({ id: c.id_categoria, nombre: c.nombre, descripcion: c.descripcion, departamentoId: c.id_departamento, departamento: c.departamento })),
    prioridades: prioridades.map((p) => ({ id: p.id_prioridad, nombre: p.nombre, slaRespuestaHoras: p.sla_primera_respuesta_horas, slaResolucionHoras: p.sla_resolucion_horas })),
    estados: estados.map((e) => ({ id: e.id_estado, nombre: e.nombre, descripcion: e.descripcion, final: e.es_estado_final }))
  })
})

export default router
