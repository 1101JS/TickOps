// /api/estadisticas: hojas estadísticas de incidencias (solo Administrador).
//   GET /api/estadisticas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&agrupar=agente|departamento|categoria|prioridad
//       &idDepartamento=&idAgente=&idCategoria=&idPrioridad=&periodo=dia|semana|mes
// Devuelve una fila por grupo con lo ocurrido DENTRO del rango, la fila de totales y la serie en el tiempo.
// Para comparar dos rangos (o dos meses) el cliente pide el mismo informe dos veces.
// Criterios:
//   creadas     incidencias registradas en el rango (fecha_creacion)
//   resueltas   incidencias que pasaron a Resuelto en el rango (fecha_resolucion), cuenten o no ya como Cerradas
//   agente      el asignado a la incidencia ahora (si se reasignó después de resolver, cuenta al actual)
//   departamento el de la categoría actual de la incidencia
//   en tiempo   resueltas dentro del SLA de resolución de su prioridad
//   abiertas    incidencias abiertas AHORA (no depende del rango)
import { Router } from 'express'
import { HttpError } from '../lib/http.js'
import { requireRole } from '../middleware.js'

const router = Router()
router.use(requireRole(['admin']))

// Cada agrupación: expresión de la clave y del nombre (se usan solo estas, nunca texto del cliente).
const GROUPS = {
  agente: { key: 'COALESCE(i.id_agente, 0)', label: "COALESCE(ua.nombre, 'Sin asignar')" },
  departamento: { key: 'd.id_departamento', label: 'd.nombre' },
  categoria: { key: 'c.id_categoria', label: "c.nombre || ' · ' || d.nombre" },
  prioridad: { key: 'p.id_prioridad', label: 'p.nombre' }
}
const PERIODS = ['dia', 'semana', 'mes']
const DATE = /^\d{4}-\d{2}-\d{2}$/

function dateParam(value, field) {
  if (value === undefined || value === '') return null
  if (typeof value !== 'string' || !DATE.test(value) || Number.isNaN(Date.parse(value))) throw new HttpError(400, `La fecha "${field}" debe tener el formato AAAA-MM-DD.`)
  return value
}

function optionalId(value, field) {
  if (value === undefined || value === '') return null
  const id = Number(value)
  if (!Number.isInteger(id) || id < 0) throw new HttpError(400, `El filtro "${field}" no es válido.`)
  return id
}

router.get('/', async (req, res) => {
  const { db } = req.app.locals
  const q = req.query
  const group = GROUPS[q.agrupar ?? 'agente']
  if (!group) throw new HttpError(400, `"agrupar" debe ser uno de: ${Object.keys(GROUPS).join(', ')}.`)
  const period = q.periodo ?? 'mes'
  if (!PERIODS.includes(period)) throw new HttpError(400, `"periodo" debe ser uno de: ${PERIODS.join(', ')}.`)
  const desde = dateParam(q.desde, 'desde')
  const hasta = dateParam(q.hasta, 'hasta')
  if (desde && hasta && desde > hasta) throw new HttpError(400, 'La fecha inicial no puede ser posterior a la final.')
  // 0 en idAgente = "sin asignar".
  const filters = [optionalId(q.idDepartamento, 'departamento'), optionalId(q.idAgente, 'agente'), optionalId(q.idCategoria, 'categoría'), optionalId(q.idPrioridad, 'prioridad')]

  // Parámetros: $1 desde, $2 hasta (exclusivo: día siguiente), $3..$6 filtros.
  const params = [desde, hasta, ...filters]
  const base = `
    FROM incidencias i
    JOIN categorias c ON c.id_categoria = i.id_categoria
    JOIN departamentos d ON d.id_departamento = c.id_departamento
    JOIN prioridades p ON p.id_prioridad = i.id_prioridad
    JOIN estados_incidencia e ON e.id_estado = i.id_estado
    LEFT JOIN usuarios ua ON ua.id_usuario = i.id_agente
    WHERE ($3::int IS NULL OR d.id_departamento = $3)
      AND ($4::int IS NULL OR COALESCE(i.id_agente, 0) = $4)
      AND ($5::int IS NULL OR c.id_categoria = $5)
      AND ($6::int IS NULL OR p.id_prioridad = $6)`
  const inRange = (column) =>
    `${column} >= COALESCE($1::date, '-infinity'::date) AND ${column} < COALESCE(($2::date + 1), 'infinity'::date)`

  const rows = await db.all(
    `SELECT ${group.key} AS clave, ${group.label} AS nombre,
            COUNT(*) FILTER (WHERE ${inRange('i.fecha_creacion')}) AS creadas,
            COUNT(*) FILTER (WHERE i.fecha_resolucion IS NOT NULL AND ${inRange('i.fecha_resolucion')}) AS resueltas,
            COUNT(*) FILTER (WHERE e.nombre = 'Rechazado' AND ${inRange('i.fecha_actualizacion')}) AS rechazadas,
            COUNT(*) FILTER (WHERE i.fecha_resolucion IS NOT NULL AND ${inRange('i.fecha_resolucion')}
                               AND i.fecha_resolucion <= i.fecha_creacion + p.sla_resolucion_horas * INTERVAL '1 hour') AS en_tiempo,
            AVG(EXTRACT(EPOCH FROM (i.fecha_resolucion - i.fecha_creacion)) / 3600.0)
              FILTER (WHERE i.fecha_resolucion IS NOT NULL AND ${inRange('i.fecha_resolucion')}) AS horas_promedio,
            COUNT(*) FILTER (WHERE NOT e.es_estado_final AND e.nombre <> 'Resuelto') AS abiertas
     ${base}
     GROUP BY 1, 2
     ORDER BY resueltas DESC, creadas DESC, nombre`,
    params
  )

  const series = await db.all(
    `SELECT to_char(date_trunc('${period === 'dia' ? 'day' : period === 'semana' ? 'week' : 'month'}', t.fecha), 'YYYY-MM-DD') AS periodo,
            SUM(t.creada)::int AS creadas, SUM(t.resuelta)::int AS resueltas
     FROM (
       SELECT i.fecha_creacion AS fecha, 1 AS creada, 0 AS resuelta ${base} AND ${inRange('i.fecha_creacion')}
       UNION ALL
       SELECT i.fecha_resolucion, 0, 1 ${base} AND i.fecha_resolucion IS NOT NULL AND ${inRange('i.fecha_resolucion')}
     ) t
     GROUP BY 1 ORDER BY 1`,
    params
  )

  const groups = rows
    .map((row) => ({
      clave: Number(row.clave),
      nombre: row.nombre,
      creadas: row.creadas,
      resueltas: row.resueltas,
      rechazadas: row.rechazadas,
      abiertas: row.abiertas,
      enTiempo: row.en_tiempo,
      porcentajeEnTiempo: row.resueltas ? Math.round((row.en_tiempo / row.resueltas) * 1000) / 10 : null,
      horasPromedio: row.horas_promedio === null ? null : Math.round(Number(row.horas_promedio) * 10) / 10
    }))
    // Se omiten grupos sin ninguna actividad ni incidencias abiertas en el rango.
    .filter((row) => row.creadas || row.resueltas || row.rechazadas || row.abiertas)

  const sum = (field) => groups.reduce((total, row) => total + row[field], 0)
  const resolvedHours = groups.reduce((total, row) => total + (row.horasPromedio ?? 0) * row.resueltas, 0)
  const resueltas = sum('resueltas')
  res.json({
    desde,
    hasta,
    agrupar: q.agrupar ?? 'agente',
    periodo: period,
    grupos: groups,
    totales: {
      creadas: sum('creadas'),
      resueltas,
      rechazadas: sum('rechazadas'),
      abiertas: sum('abiertas'),
      enTiempo: sum('enTiempo'),
      porcentajeEnTiempo: resueltas ? Math.round((sum('enTiempo') / resueltas) * 1000) / 10 : null,
      horasPromedio: resueltas ? Math.round((resolvedHours / resueltas) * 10) / 10 : null
    },
    serie: series
  })
})

export default router
