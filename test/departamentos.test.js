// Administración de departamentos (/api/departamentos) sobre una base temporal aislada.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { createTestDatabase, insertUser, login, startServer } from './helpers.js'

let database
let server
let admin
let applicant

before(async () => {
  database = await createTestDatabase()
  await insertUser(database.db, { nombre: 'Admin Dep', correo: 'admin@dep.local' })
  server = await startServer(database.db)
  admin = await login(server.url, 'admin@dep.local')
  await admin('POST', '/api/usuarios', { nombre: 'Sol Dep', correo: 'sol@dep.local', password: 'Prueba12345', role: 'applicant' })
  applicant = await login(server.url, 'sol@dep.local')
})

after(async () => {
  await server?.close()
  await database?.drop()
})

describe('Departamentos', () => {
  const ctx = {}

  test('solo el administrador puede administrarlos', async () => {
    assert.equal((await applicant('GET', '/api/departamentos')).status, 403)
    assert.equal((await applicant('POST', '/api/departamentos', { nombre: 'X' })).status, 403)
  })

  test('lista los departamentos con sus contadores', async () => {
    const list = (await admin('GET', '/api/departamentos')).data.departamentos
    assert.ok(list.length >= 1)
    const it = list.find((d) => d.nombre.startsWith('Inform'))
    assert.ok(it.categorias > 0)
    assert.equal(typeof it.abiertas, 'number')
    assert.equal(it.enUso, true)
  })

  test('crea uno nuevo; el nombre es obligatorio y único', async () => {
    const r = await admin('POST', '/api/departamentos', { nombre: 'Infraestructura', descripcion: 'Servidores y redes' })
    assert.equal(r.status, 201)
    assert.equal(r.data.departamento.activo, true)
    assert.equal(r.data.departamento.enUso, false)
    ctx.id = r.data.departamento.id
    assert.equal((await admin('POST', '/api/departamentos', { nombre: 'Infraestructura' })).status, 409)
    assert.equal((await admin('POST', '/api/departamentos', { descripcion: 'sin nombre' })).status, 400)
    // Aparece en los catálogos (formularios y selector de vista).
    assert.ok((await admin('GET', '/api/catalogos')).data.departamentos.some((d) => d.id === ctx.id))
  })

  test('edita nombre y descripción', async () => {
    const r = await admin('PATCH', `/api/departamentos/${ctx.id}`, { nombre: 'Infraestructura TI', descripcion: '' })
    assert.equal(r.data.departamento.nombre, 'Infraestructura TI')
    assert.equal(r.data.departamento.descripcion, null)
  })

  test('con incidencias abiertas no se desactiva', async () => {
    const category = (await admin('POST', '/api/categorias', { nombre: 'Servidores', idDepartamento: ctx.id })).data.categoria
    ctx.incident = (await applicant('POST', '/api/incidencias', { titulo: 'Servidor caído', descripcion: 'x', idCategoria: category.id, idPrioridad: 1 })).data.incidencia.id
    const r = await admin('PATCH', `/api/departamentos/${ctx.id}`, { activo: false })
    assert.equal(r.status, 409)
    assert.match(r.data.error, /abierta/)
  })

  test('sin incidencias abiertas se desactiva y deja de ofrecerse', async () => {
    await admin('PATCH', `/api/incidencias/${ctx.incident}`, { estado: 'Rechazado', comentario: 'Duplicada' })
    const r = await admin('PATCH', `/api/departamentos/${ctx.id}`, { activo: false })
    assert.equal(r.status, 200)
    assert.equal(r.data.departamento.activo, false)
    const catalog = (await admin('GET', '/api/catalogos')).data
    assert.ok(!catalog.departamentos.some((d) => d.id === ctx.id))
    assert.ok(!catalog.categorias.some((c) => c.departamentoId === ctx.id))
    // La vista de agente de un departamento inactivo se rechaza.
    assert.equal((await admin('GET', '/api/incidencias', undefined, { 'x-vista': `agente:${ctx.id}` })).status, 400)
    // Reactivar
    assert.equal((await admin('PATCH', `/api/departamentos/${ctx.id}`, { activo: true })).data.departamento.activo, true)
  })

  test('uno usado no se elimina; uno sin uso sí', async () => {
    const used = await admin('DELETE', `/api/departamentos/${ctx.id}`)
    assert.equal(used.status, 409)
    assert.match(used.data.error, /desactívalo/)
    const empty = (await admin('POST', '/api/departamentos', { nombre: 'Temporal' })).data.departamento
    assert.equal((await admin('DELETE', `/api/departamentos/${empty.id}`)).status, 200)
    assert.equal((await admin('PATCH', `/api/departamentos/${empty.id}`, { nombre: 'X' })).status, 404)
  })

  test('el último departamento activo no se desactiva', async () => {
    const list = (await admin('GET', '/api/departamentos')).data.departamentos.filter((d) => d.activo)
    const results = []
    for (const d of list) results.push((await admin('PATCH', `/api/departamentos/${d.id}`, { activo: false })).status)
    assert.equal(results.at(-1), 409)
    assert.ok((await admin('GET', '/api/catalogos')).data.departamentos.length >= 1)
    for (const d of list) await admin('PATCH', `/api/departamentos/${d.id}`, { activo: true })
  })
})
