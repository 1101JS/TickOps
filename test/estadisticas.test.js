// Hojas estadísticas (/api/estadisticas) sobre una base temporal aislada, con incidencias de fechas conocidas.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { createTestDatabase, insertUser, login, startServer } from './helpers.js'

let database
let server
let admin
let applicant

before(async () => {
  database = await createTestDatabase()
  const { db } = database
  await insertUser(db, { nombre: 'Admin Est', correo: 'admin@est.local' })
  const it = await db.first("SELECT d.id_departamento, (SELECT id_categoria FROM categorias WHERE id_departamento = d.id_departamento ORDER BY 1 LIMIT 1) AS cat FROM departamentos d WHERE d.nombre LIKE 'Inform%'")
  const mant = await db.first("SELECT d.id_departamento, (SELECT id_categoria FROM categorias WHERE id_departamento = d.id_departamento ORDER BY 1 LIMIT 1) AS cat FROM departamentos d WHERE d.nombre LIKE 'Mantenim%'")
  const ana = await insertUser(db, { nombre: 'Ana', correo: 'ana@est.local', rol: 'Agente', idDepartamento: it.id_departamento })
  const beto = await insertUser(db, { nombre: 'Beto', correo: 'beto@est.local', rol: 'Agente', idDepartamento: mant.id_departamento })
  const sol = await insertUser(db, { nombre: 'Sol', correo: 'sol@est.local', rol: 'Solicitante' })
  const estado = async (nombre) => (await db.first('SELECT id_estado FROM estados_incidencia WHERE nombre = $1', [nombre])).id_estado
  const resuelto = await estado('Resuelto')
  const cerrado = await estado('Cerrado')
  const pendiente = await estado('Pendiente')
  const prioridad = (await db.first("SELECT id_prioridad FROM prioridades WHERE nombre = 'Media'")).id_prioridad // SLA 48 h

  // [agente, categoría, estado, creada, resuelta]
  const rows = [
    [ana, it.cat, resuelto, '2026-01-10 08:00', '2026-01-10 12:00'], // en SLA, 4 h
    [ana, it.cat, cerrado, '2026-01-12 08:00', '2026-01-15 08:00'], // fuera de SLA, 72 h
    [ana, it.cat, resuelto, '2026-02-03 08:00', '2026-02-03 10:00'], // febrero
    [beto, mant.cat, resuelto, '2026-01-20 08:00', '2026-01-21 08:00'], // en SLA, 24 h
    [beto, mant.cat, pendiente, '2026-01-25 08:00', null],
    [null, it.cat, pendiente, '2026-02-05 08:00', null]
  ]
  for (const [agente, cat, est, creada, resuelta] of rows) {
    await db.run(
      `INSERT INTO incidencias (titulo, descripcion, id_categoria, id_prioridad, id_estado, id_solicitante, id_agente, fecha_creacion, fecha_resolucion)
       VALUES ('Prueba', 'Prueba', $1, $2, $3, $4, $5, $6, $7)`,
      [cat, prioridad, est, sol, agente, creada, resuelta]
    )
  }
  server = await startServer(db)
  admin = await login(server.url, 'admin@est.local')
  applicant = await login(server.url, 'sol@est.local')
})

after(async () => {
  await server?.close()
  await database?.drop()
})

const get = (query) => admin('GET', `/api/estadisticas?${query}`)
const byName = (data, name) => data.grupos.find((g) => g.nombre === name)

describe('Estadísticas', () => {
  test('solo el administrador las ve', async () => {
    assert.equal((await applicant('GET', '/api/estadisticas')).status, 403)
    assert.equal((await get('')).status, 200)
  })

  test('resueltas por agente en un rango de fechas', async () => {
    const enero = (await get('desde=2026-01-01&hasta=2026-01-31&agrupar=agente')).data
    assert.equal(byName(enero, 'Ana').resueltas, 2)
    assert.equal(byName(enero, 'Beto').resueltas, 1)
    assert.equal(enero.totales.resueltas, 3)
    assert.equal(byName(enero, 'Ana').enTiempo, 1)
    assert.equal(byName(enero, 'Ana').porcentajeEnTiempo, 50)
    assert.equal(byName(enero, 'Ana').horasPromedio, 38) // (4 + 72) / 2
    assert.equal(byName(enero, 'Beto').abiertas, 1)

    const febrero = (await get('desde=2026-02-01&hasta=2026-02-28&agrupar=agente')).data
    assert.equal(byName(febrero, 'Ana').resueltas, 1)
    assert.equal(byName(febrero, 'Beto').resueltas, 0)
  })

  test('el último día del rango se incluye', async () => {
    const dia = (await get('desde=2026-01-10&hasta=2026-01-10&agrupar=agente')).data
    assert.equal(dia.totales.resueltas, 1)
  })

  test('agrupa por departamento, y "sin asignar" aparece como grupo', async () => {
    const dep = (await get('agrupar=departamento')).data
    assert.equal(dep.grupos.find((g) => g.nombre.startsWith('Inform')).resueltas, 3)
    assert.equal(dep.grupos.find((g) => g.nombre.startsWith('Mantenim')).resueltas, 1)
    const ag = (await get('agrupar=agente')).data
    assert.equal(byName(ag, 'Sin asignar').abiertas, 1)
  })

  test('filtra por agente y devuelve la serie por mes', async () => {
    const ana = (await get('agrupar=agente&idAgente=' + (await database.db.first("SELECT id_usuario FROM usuarios WHERE nombre = 'Ana'")).id_usuario + '&periodo=mes')).data
    assert.deepEqual(ana.grupos.map((g) => g.nombre), ['Ana'])
    assert.deepEqual(ana.serie.map((s) => [s.periodo, s.creadas, s.resueltas]), [['2026-01-01', 2, 2], ['2026-02-01', 1, 1]])
  })

  test('rechaza parámetros inválidos', async () => {
    assert.equal((await get('desde=ayer')).status, 400)
    assert.equal((await get('agrupar=usuarios;DROP')).status, 400)
    assert.equal((await get('periodo=siglo')).status, 400)
    assert.equal((await get('desde=2026-03-01&hasta=2026-02-01')).status, 400)
    assert.equal((await get('idAgente=abc')).status, 400)
  })
})
