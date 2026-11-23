// Cambio de vista del administrador (encabezado X-Vista): con su misma cuenta usa las incidencias
// como agente de un departamento o como solicitante, con las reglas de ese rol.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { createTestDatabase, insertUser, login, startServer } from './helpers.js'

let database
let server
let admin
let adminId
let agent
let agentId
let applicant
let it
let itCategory
let otherCategory
const asAgentIt = () => ({ 'x-vista': `agente:${it}` })
const asApplicant = { 'x-vista': 'solicitante' }

before(async () => {
  database = await createTestDatabase()
  adminId = await insertUser(database.db, { nombre: 'Admin Vista', correo: 'admin@vista.local' })
  server = await startServer(database.db)
  admin = await login(server.url, 'admin@vista.local')
  const catalog = (await admin('GET', '/api/catalogos')).data
  it = catalog.departamentos.find((d) => d.nombre.startsWith('Inform')).id
  itCategory = catalog.categorias.find((c) => c.departamentoId === it).id
  otherCategory = catalog.categorias.find((c) => c.departamentoId !== it).id
  agentId = (await admin('POST', '/api/usuarios', { nombre: 'Agente TI', correo: 'agente@vista.local', password: 'Prueba12345', role: 'agent', idDepartamento: it })).data.usuario.id
  await admin('POST', '/api/usuarios', { nombre: 'Sol Vista', correo: 'sol@vista.local', password: 'Prueba12345', role: 'applicant' })
  agent = await login(server.url, 'agente@vista.local')
  applicant = await login(server.url, 'sol@vista.local')
})

after(async () => {
  await server?.close()
  await database?.drop()
})

const newIncident = (request, idCategoria, headers) =>
  request('POST', '/api/incidencias', { titulo: 'Prueba de vista', descripcion: 'x', idCategoria, idPrioridad: 1 }, headers)

describe('Vista del administrador', () => {
  const ids = {}

  test('como solicitante registra incidencias a su nombre y ve solo las suyas', async () => {
    ids.fromApplicant = (await newIncident(applicant, itCategory)).data.incidencia.id
    const created = await newIncident(admin, itCategory, asApplicant)
    assert.equal(created.status, 201)
    assert.equal(created.data.incidencia.solicitanteId, adminId)
    ids.fromAdmin = created.data.incidencia.id
    const mine = (await admin('GET', '/api/incidencias', undefined, asApplicant)).data.incidencias.map((i) => i.id)
    assert.deepEqual(mine, [ids.fromAdmin])
    // Como solicitante no gestiona: no hay notas internas ni cambios de estado.
    assert.equal(created.data.incidencia.acciones.gestionar, false)
    assert.equal((await admin('POST', `/api/incidencias/${ids.fromAdmin}/comentarios`, { contenido: 'x', esInterno: true }, asApplicant)).status, 403)
  })

  test('como agente ve la cola de ese departamento y no la de otros', async () => {
    ids.otherDept = (await newIncident(applicant, otherCategory)).data.incidencia.id
    const queue = (await admin('GET', '/api/incidencias', undefined, asAgentIt())).data.incidencias.map((i) => i.id)
    assert.ok(queue.includes(ids.fromApplicant))
    assert.ok(!queue.includes(ids.otherDept))
    assert.equal((await admin('GET', `/api/incidencias/${ids.otherDept}`, undefined, asAgentIt())).status, 404)
  })

  test('como agente toma una incidencia con su propia cuenta y queda en el historial', async () => {
    const r = await admin('PATCH', `/api/incidencias/${ids.fromApplicant}`, { idAgente: adminId }, asAgentIt())
    assert.equal(r.status, 200)
    assert.equal(r.data.incidencia.estado, 'En Proceso')
    assert.equal(r.data.incidencia.agenteId, adminId)
    assert.equal(r.data.incidencia.historial.at(-1).responsable, 'Admin Vista')
    assert.ok(r.data.incidencia.acciones.comentarioInterno)
  })

  test('como agente sigue las reglas del agente: no reasigna a otros', async () => {
    const r = await admin('PATCH', `/api/incidencias/${ids.fromApplicant}`, { idAgente: agentId }, asAgentIt())
    assert.equal(r.status, 403)
    // Sin vista vuelve a ser administrador y sí puede reasignar.
    const back = await admin('PATCH', `/api/incidencias/${ids.fromApplicant}`, { idAgente: agentId })
    assert.equal(back.data.incidencia.agenteId, agentId)
  })

  test('sin vista el administrador ve todas las incidencias', async () => {
    const all = (await admin('GET', '/api/incidencias')).data.incidencias.map((i) => i.id)
    for (const id of Object.values(ids)) assert.ok(all.includes(id))
  })

  test('una vista inválida o de un departamento inexistente se rechaza', async () => {
    assert.equal((await admin('GET', '/api/incidencias', undefined, { 'x-vista': 'superadmin' })).status, 400)
    assert.equal((await admin('GET', '/api/incidencias', undefined, { 'x-vista': 'agente:99999' })).status, 400)
  })

  test('en otros roles el encabezado se ignora y no da permisos', async () => {
    const seen = (await applicant('GET', '/api/incidencias', undefined, asAgentIt())).data.incidencias.map((i) => i.id)
    assert.ok(!seen.includes(ids.fromAdmin))
    assert.equal((await agent('GET', `/api/incidencias/${ids.otherDept}`, undefined, asApplicant)).status, 404)
  })
})
