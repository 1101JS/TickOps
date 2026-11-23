// Relaciones entre incidencias: duplicadas y por causa raíz, permisos, un solo nivel y resolución en bloque.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { createTestDatabase, insertUser, login, startServer } from './helpers.js'

let database
let server
let admin
let adminId
let agent
let agentId
let otherAgent
let applicant
let it
let itCategory
let otherCategory

before(async () => {
  database = await createTestDatabase()
  adminId = await insertUser(database.db, { nombre: 'Admin Rel', correo: 'admin@rel.local' })
  server = await startServer(database.db)
  admin = await login(server.url, 'admin@rel.local')
  const catalog = (await admin('GET', '/api/catalogos')).data
  it = catalog.departamentos.find((d) => d.nombre.startsWith('Inform')).id
  itCategory = catalog.categorias.find((c) => c.departamentoId === it).id
  const other = catalog.categorias.find((c) => c.departamentoId !== it)
  otherCategory = other.id
  agentId = (await admin('POST', '/api/usuarios', { nombre: 'Agente TI', correo: 'agente@rel.local', password: 'Prueba12345', role: 'agent', idDepartamento: it })).data.usuario.id
  await admin('POST', '/api/usuarios', { nombre: 'Agente Otro', correo: 'otro@rel.local', password: 'Prueba12345', role: 'agent', idDepartamento: other.departamentoId })
  await admin('POST', '/api/usuarios', { nombre: 'Sol Rel', correo: 'sol@rel.local', password: 'Prueba12345', role: 'applicant' })
  agent = await login(server.url, 'agente@rel.local')
  otherAgent = await login(server.url, 'otro@rel.local')
  applicant = await login(server.url, 'sol@rel.local')
})

after(async () => {
  await server?.close()
  await database?.drop()
})

const create = async (titulo, idCategoria = itCategory) =>
  (await applicant('POST', '/api/incidencias', { titulo, descripcion: 'x', idCategoria, idPrioridad: 1 })).data.incidencia.id
const link = (request, child, idPrincipal, tipo = 'duplicada', headers) =>
  request('PUT', `/api/incidencias/${child}/relacion`, { idPrincipal, tipo }, headers)
// Lleva una incidencia a Resuelto como el agente (tomar + comentario de resolución).
async function resolve(id) {
  await agent('PATCH', `/api/incidencias/${id}`, { idAgente: agentId })
  const r = await agent('PATCH', `/api/incidencias/${id}`, { estado: 'Resuelto', comentario: 'Se reinició el servidor.' })
  assert.equal(r.status, 200, r.data?.error)
}

describe('Relaciones entre incidencias', () => {
  test('el agente relaciona una duplicada y ambas lo muestran (también el listado)', async () => {
    const root = await create('Servidor caído')
    const dup = await create('No abre el sistema')
    const r = await link(agent, dup, root)
    assert.equal(r.status, 200, r.data?.error)
    assert.equal(r.data.incidencia.principalId, root)
    assert.equal(r.data.incidencia.tipoRelacion, 'duplicada')
    assert.deepEqual(
      { id: r.data.incidencia.principal.id, tipo: r.data.incidencia.principal.tipo, titulo: r.data.incidencia.principal.titulo, visible: r.data.incidencia.principal.visible },
      { id: root, tipo: 'duplicada', titulo: 'Servidor caído', visible: true }
    )
    assert.match(r.data.incidencia.historial.at(-1).detalle, new RegExp(`#${root}`))
    const principal = (await agent('GET', `/api/incidencias/${root}`)).data.incidencia
    assert.equal(principal.totalRelacionadas, 1)
    assert.equal(principal.relacionadas[0].id, dup)
    assert.equal(principal.relacionadas[0].gestionable, true)
    assert.equal(principal.acciones.resolverRelacionadas, false) // la principal aún no está resuelta
    const listed = (await agent('GET', '/api/incidencias')).data.incidencias.find((i) => i.id === dup)
    assert.equal(listed.principalId, root)
  })

  test('el solicitante no relaciona y ve la principal sin título', async () => {
    const root = await create('Raíz privada')
    const child = await create('Mi problema')
    assert.equal((await link(applicant, child, root)).status, 403)
    // La principal es de otra persona: el solicitante solo ve su número y estado.
    const root2 = (await admin('POST', '/api/incidencias', { titulo: 'Corte de red general', descripcion: 'x', idCategoria: itCategory, idPrioridad: 1 })).data.incidencia.id
    assert.equal((await link(agent, child, root2, 'causa_raiz')).status, 200)
    const seen = (await applicant('GET', `/api/incidencias/${child}`)).data.incidencia
    assert.equal(seen.principal.id, root2)
    assert.equal(seen.principal.tipo, 'causa_raiz')
    assert.equal(seen.principal.titulo, null)
    assert.equal(seen.principal.visible, false)
    assert.equal(seen.acciones.relacionar, false)
  })

  test('un agente de otro departamento no puede relacionar ni ver la principal', async () => {
    const root = await create('Raíz TI')
    const child = await create('Hija TI')
    assert.equal((await link(otherAgent, child, root)).status, 404)
    const foreign = await create('Otra área', otherCategory)
    // El agente de TI no ve la incidencia del otro departamento: no puede usarla como principal.
    assert.equal((await link(agent, child, foreign)).status, 404)
  })

  test('un solo nivel: ni la principal puede depender de otra ni una relacionada tener relacionadas', async () => {
    const a = await create('A')
    const b = await create('B')
    const c = await create('C')
    assert.equal((await link(agent, b, a)).status, 200)
    const chained = await link(agent, c, b)
    assert.equal(chained.status, 409)
    assert.match(chained.data.error, new RegExp(`#${a}`))
    const parentUp = await link(agent, a, c)
    assert.equal(parentUp.status, 409)
    assert.equal((await link(agent, a, a)).status, 400)
    assert.equal((await agent('PUT', `/api/incidencias/${c}/relacion`, { idPrincipal: a, tipo: 'otro' })).status, 400)
  })

  test('se puede cambiar de principal y quitar la relación', async () => {
    const a = await create('Principal 1')
    const b = await create('Principal 2')
    const child = await create('Hija movida')
    await link(agent, child, a)
    const moved = await link(agent, child, b, 'causa_raiz')
    assert.equal(moved.data.incidencia.principalId, b)
    assert.equal((await agent('GET', `/api/incidencias/${a}`)).data.incidencia.totalRelacionadas, 0)
    const removed = await agent('DELETE', `/api/incidencias/${child}/relacion`)
    assert.equal(removed.status, 200)
    assert.equal(removed.data.incidencia.principal, null)
    assert.equal((await agent('DELETE', `/api/incidencias/${child}/relacion`)).status, 409)
  })

  test('resuelve en bloque las relacionadas (incluso pendientes sin agente) al resolver la principal', async () => {
    const root = await create('Caída del correo')
    const pending = await create('No llegan correos')
    const inProgress = await create('Correo lento')
    await link(agent, pending, root, 'causa_raiz')
    await link(agent, inProgress, root, 'causa_raiz')
    await agent('PATCH', `/api/incidencias/${inProgress}`, { idAgente: agentId })

    const early = await agent('POST', `/api/incidencias/${root}/relacionadas/resolver`, { ids: [pending], estado: 'Resuelto', comentario: 'x' })
    assert.equal(early.status, 409)

    await resolve(root)
    assert.equal((await agent('GET', `/api/incidencias/${root}`)).data.incidencia.acciones.resolverRelacionadas, true)
    const r = await agent('POST', `/api/incidencias/${root}/relacionadas/resolver`, { ids: [pending, inProgress], estado: 'Resuelto', comentario: 'Se restableció el servidor de correo.' })
    assert.equal(r.status, 200, r.data?.error)
    assert.equal(r.data.actualizadas, 2)
    assert.ok(r.data.incidencia.relacionadas.every((c) => c.estado === 'Resuelto'))
    const child = (await agent('GET', `/api/incidencias/${pending}`)).data.incidencia
    assert.equal(child.agenteId, agentId)
    assert.ok(child.fechaPrimeraRespuesta)
    assert.ok(child.comentarios.some((c) => c.esResolucion && c.contenido.includes('Se restableció')))
    assert.equal(child.historial.at(-1).responsable, 'Agente TI')
    // El solicitante puede confirmar o reabrir cada una como siempre.
    assert.ok((await applicant('GET', `/api/incidencias/${pending}`)).data.incidencia.acciones.estados.includes('Cerrado'))
    // Volver a resolverlas no cambia nada; cerrarlas sí.
    assert.equal((await agent('POST', `/api/incidencias/${root}/relacionadas/resolver`, { ids: [pending], estado: 'Resuelto', comentario: 'x' })).data.actualizadas, 0)
    const closed = await agent('POST', `/api/incidencias/${root}/relacionadas/resolver`, { ids: [pending, inProgress], estado: 'Cerrado', comentario: 'Cierre general.' })
    assert.equal(closed.data.actualizadas, 2)
    assert.ok(closed.data.incidencia.relacionadas.every((c) => c.estado === 'Cerrado' && c.estadoFinal))
    assert.equal(closed.data.incidencia.acciones.resolverRelacionadas, false)
  })

  test('todo o nada: si una no se puede, no cambia ninguna', async () => {
    const root = await create('Raíz bloque')
    const ok = await create('Válida')
    const notChild = await create('No relacionada')
    await link(agent, ok, root)
    await resolve(root)
    const r = await agent('POST', `/api/incidencias/${root}/relacionadas/resolver`, { ids: [ok, notChild], estado: 'Cerrado', comentario: 'x' })
    assert.equal(r.status, 400)
    assert.equal((await agent('GET', `/api/incidencias/${ok}`)).data.incidencia.estado, 'Pendiente')
    assert.equal((await agent('POST', `/api/incidencias/${root}/relacionadas/resolver`, { ids: [], estado: 'Cerrado', comentario: 'x' })).status, 400)
    assert.equal((await agent('POST', `/api/incidencias/${root}/relacionadas/resolver`, { ids: [ok], estado: 'Cerrado', comentario: '' })).status, 400)
    assert.equal((await applicant('POST', `/api/incidencias/${root}/relacionadas/resolver`, { ids: [ok], estado: 'Cerrado', comentario: 'x' })).status, 403)
  })

  test('el administrador en vista de agente relaciona y resuelve con su cuenta', async () => {
    const view = { 'x-vista': `agente:${it}` }
    const root = await create('Raíz admin')
    const child = await create('Hija admin')
    assert.equal((await link(admin, child, root, 'duplicada', view)).status, 200)
    // Como agente de otro departamento no ve estas incidencias.
    const otherDept = (await admin('GET', '/api/catalogos')).data.departamentos.find((d) => d.id !== it).id
    assert.equal((await admin('DELETE', `/api/incidencias/${child}/relacion`, undefined, { 'x-vista': `agente:${otherDept}` })).status, 404)
    await admin('PATCH', `/api/incidencias/${root}`, { idAgente: adminId }, view)
    await admin('PATCH', `/api/incidencias/${root}`, { estado: 'Resuelto', comentario: 'Listo.' }, view)
    const r = await admin('POST', `/api/incidencias/${root}/relacionadas/resolver`, { ids: [child], estado: 'Cerrado', comentario: 'Era duplicada.' }, view)
    assert.equal(r.status, 200, r.data?.error)
    const closed = (await admin('GET', `/api/incidencias/${child}`)).data.incidencia
    assert.equal(closed.estado, 'Cerrado')
    assert.equal(closed.agenteId, adminId)
  })
})
