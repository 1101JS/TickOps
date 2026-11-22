// Pruebas de la API completa (Express + PostgreSQL) sobre una base temporal aislada.
// Recorren lo que pide la propuesta: sesión, roles, incidencias, asignación, estados, comentarios,
// administración de usuarios y categorías, además de las protecciones (CSRF, JSON, permisos).
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { client, createTestDatabase, insertUser, login, startServer } from './helpers.js'

let database
let server
let url
let admin
let catalog
let it // departamento de Informática
let other // otro departamento
const ctx = {}

before(async () => {
  database = await createTestDatabase()
  await insertUser(database.db, { nombre: 'Admin Prueba', correo: 'admin@prueba.local' })
  server = await startServer(database.db)
  url = server.url
  admin = await login(url, 'admin@prueba.local')
  catalog = (await admin('GET', '/api/catalogos')).data
  it = catalog.departamentos.find((d) => d.nombre.startsWith('Inform')).id
  other = catalog.departamentos.find((d) => d.id !== it).id
})

after(async () => {
  await server?.close()
  await database?.drop()
})

describe('Protecciones generales', () => {
  test('health responde con la base de prueba', async () => {
    const r = await client(url)('GET', '/api/health')
    assert.equal(r.status, 200)
    assert.equal(r.data.base, database.name)
  })

  test('sin sesión no se puede consultar nada', async () => {
    assert.equal((await client(url)('GET', '/api/incidencias')).status, 401)
  })

  test('rutas inexistentes e ids no numéricos devuelven 404 en JSON', async () => {
    const anon = client(url)
    const missing = await anon('GET', '/api/no-existe')
    assert.equal(missing.status, 404)
    assert.ok(missing.data.error)
    assert.equal((await admin('GET', '/api/incidencias/abc')).status, 404)
  })

  test('cuerpo inválido: JSON mal formado (400) o sin JSON (415)', async () => {
    const anon = client(url)
    const bad = await anon('POST', '/api/auth/login', '{malo')
    assert.equal(bad.status, 400)
    assert.equal(bad.data.error, 'JSON inválido.')
    assert.equal((await anon('POST', '/api/auth/login', 'correo=x', { 'content-type': 'text/plain' })).status, 415)
  })

  test('CSRF: se rechazan cambios desde otro origen', async () => {
    const r = await client(url)('POST', '/api/auth/login', { correo: 'a@b.c' }, { origin: 'https://malicioso.example' })
    assert.equal(r.status, 403)
  })

  test('cabeceras: sin caché y sin x-powered-by', async () => {
    const r = await admin('GET', '/api/auth/me')
    assert.equal(r.headers.get('cache-control'), 'no-store')
    assert.equal(r.headers.get('x-powered-by'), null)
  })
})

describe('Autenticación', () => {
  test('contraseña incorrecta → 401', async () => {
    const r = await client(url)('POST', '/api/auth/login', { correo: 'admin@prueba.local', password: 'incorrecta' })
    assert.equal(r.status, 401)
  })

  test('la cookie de sesión es HttpOnly y SameSite=Lax; Secure solo detrás de HTTPS', async () => {
    const plain = await client(url)('POST', '/api/auth/login', { correo: 'admin@prueba.local', password: 'Prueba12345' })
    assert.match(plain.setCookie, /HttpOnly/i)
    assert.match(plain.setCookie, /SameSite=Lax/i)
    assert.doesNotMatch(plain.setCookie, /Secure/i)
    const proxied = await client(url)('POST', '/api/auth/login', { correo: 'admin@prueba.local', password: 'Prueba12345' }, { 'x-forwarded-proto': 'https' })
    assert.match(proxied.setCookie, /Secure/i)
  })

  test('me devuelve el usuario de la sesión', async () => {
    const r = await admin('GET', '/api/auth/me')
    assert.equal(r.data.user.correo, 'admin@prueba.local')
    assert.equal(r.data.user.role, 'admin')
  })

  test('demasiados intentos fallidos bloquean el correo', async () => {
    const anon = client(url)
    for (let i = 0; i < 10; i++) await anon('POST', '/api/auth/login', { correo: 'nadie@prueba.local', password: 'x' })
    assert.equal((await anon('POST', '/api/auth/login', { correo: 'nadie@prueba.local', password: 'x' })).status, 429)
  })

  test('el registro público está deshabilitado por defecto', async () => {
    const r = await client(url)('POST', '/api/auth/register', { nombre: 'X', correo: 'x@prueba.local', password: 'Prueba12345' })
    assert.equal(r.status, 403)
  })
})

describe('Administración de usuarios', () => {
  test('el administrador crea un agente y un solicitante', async () => {
    const agent = await admin('POST', '/api/usuarios', { nombre: 'Agente IT', correo: 'agente@prueba.local', password: 'Prueba12345', role: 'agent', idDepartamento: it })
    assert.equal(agent.status, 201)
    ctx.agentId = agent.data.usuario.id
    const sol = await admin('POST', '/api/usuarios', { nombre: 'Solicitante', correo: 'sol@prueba.local', password: 'Prueba12345', role: 'applicant' })
    assert.equal(sol.status, 201)
    ctx.agent = await login(url, 'agente@prueba.local')
    ctx.sol = await login(url, 'sol@prueba.local')
  })

  test('un agente sin departamento no se puede crear', async () => {
    const r = await admin('POST', '/api/usuarios', { nombre: 'X', correo: 'x2@prueba.local', password: 'Prueba12345', role: 'agent' })
    assert.equal(r.status, 400)
  })

  test('correo duplicado → 409', async () => {
    const r = await admin('POST', '/api/usuarios', { nombre: 'Dup', correo: 'sol@prueba.local', password: 'Prueba12345', role: 'applicant' })
    assert.equal(r.status, 409)
    assert.match(r.data.error, /correo/)
  })

  test('editar usuario', async () => {
    const r = await admin('PATCH', `/api/usuarios/${ctx.agentId}`, { nombre: 'Agente IT 2' })
    assert.equal(r.data.usuario.nombre, 'Agente IT 2')
  })

  test('solo el administrador ve y gestiona usuarios', async () => {
    assert.equal((await ctx.sol('GET', '/api/usuarios')).status, 403)
    assert.equal((await ctx.agent('POST', '/api/usuarios', {})).status, 403)
  })

  test('el administrador no puede desactivarse a sí mismo', async () => {
    const me = (await admin('GET', '/api/auth/me')).data.user
    assert.equal((await admin('PATCH', `/api/usuarios/${me.id}`, { activo: false })).status, 400)
  })
})

describe('Gestión de categorías', () => {
  test('listar categorías con su uso', async () => {
    const r = await admin('GET', '/api/categorias')
    assert.equal(r.status, 200)
    assert.ok(r.data.categorias.length > 0)
    assert.ok(r.data.categorias.every((c) => 'enUso' in c && 'incidencias' in c))
  })

  test('crear categoría y verla en los catálogos', async () => {
    const r = await admin('POST', '/api/categorias', { nombre: 'Impresoras', descripcion: 'Atascos y tóner', idDepartamento: it })
    assert.equal(r.status, 201)
    ctx.category = r.data.categoria
    const catalogs = (await ctx.sol('GET', '/api/catalogos')).data
    assert.ok(catalogs.categorias.some((c) => c.id === ctx.category.id))
  })

  test('validaciones: nombre obligatorio y sin duplicados en el departamento', async () => {
    assert.equal((await admin('POST', '/api/categorias', { idDepartamento: it })).status, 400)
    const dup = await admin('POST', '/api/categorias', { nombre: 'Impresoras', idDepartamento: it })
    assert.equal(dup.status, 409)
    assert.equal(dup.data.error, 'Ya existe una categoría con ese nombre en el departamento.')
  })

  test('mover de departamento una categoría sin incidencias', async () => {
    let r = await admin('PATCH', `/api/categorias/${ctx.category.id}`, { idDepartamento: other })
    assert.equal(r.data.categoria.departamentoId, other)
    r = await admin('PATCH', `/api/categorias/${ctx.category.id}`, { idDepartamento: it })
    assert.equal(r.data.categoria.departamentoId, it)
  })

  test('solo el administrador gestiona categorías', async () => {
    assert.equal((await ctx.sol('GET', '/api/categorias')).status, 403)
    assert.equal((await ctx.agent('POST', '/api/categorias', { nombre: 'X', idDepartamento: it })).status, 403)
  })

  test('eliminar una categoría sin uso', async () => {
    const tmp = (await admin('POST', '/api/categorias', { nombre: 'Temporal', idDepartamento: it })).data.categoria
    assert.equal((await admin('DELETE', `/api/categorias/${tmp.id}`)).status, 200)
    assert.equal((await admin('PATCH', `/api/categorias/${tmp.id}`, { nombre: 'x' })).status, 404)
  })
})

describe('Ciclo de vida de una incidencia', () => {
  test('el solicitante registra una incidencia (queda Pendiente, sin agente)', async () => {
    const r = await ctx.sol('POST', '/api/incidencias', { titulo: 'Impresora atascada', descripcion: 'No imprime', idCategoria: ctx.category.id, idPrioridad: catalog.prioridades[1].id })
    assert.equal(r.status, 201)
    assert.equal(r.data.incidencia.estado, 'Pendiente')
    assert.equal(r.data.incidencia.agenteId, null)
    assert.equal(r.data.incidencia.historial.length, 1)
    ctx.incident = r.data.incidencia.id
  })

  test('datos inválidos no se guardan', async () => {
    assert.equal((await ctx.sol('POST', '/api/incidencias', { descripcion: 'x', idCategoria: ctx.category.id, idPrioridad: 1 })).status, 400)
  })

  test('cada rol ve solo lo que le corresponde', async () => {
    assert.ok((await ctx.sol('GET', '/api/incidencias')).data.incidencias.some((i) => i.id === ctx.incident))
    assert.ok((await ctx.agent('GET', '/api/incidencias')).data.incidencias.some((i) => i.id === ctx.incident))
    await admin('POST', '/api/usuarios', { nombre: 'Otro', correo: 'otro@prueba.local', password: 'Prueba12345', role: 'applicant' })
    const stranger = await login(url, 'otro@prueba.local')
    assert.equal((await stranger('GET', `/api/incidencias/${ctx.incident}`)).status, 404)
  })

  test('una categoría con incidencias no se mueve ni se elimina; sí se desactiva', async () => {
    assert.equal((await admin('PATCH', `/api/categorias/${ctx.category.id}`, { idDepartamento: other })).status, 409)
    assert.equal((await admin('DELETE', `/api/categorias/${ctx.category.id}`)).status, 409)
    const off = await admin('PATCH', `/api/categorias/${ctx.category.id}`, { activa: false })
    assert.equal(off.data.categoria.activa, false)
    const blocked = await ctx.sol('POST', '/api/incidencias', { titulo: 'Otra', descripcion: 'x', idCategoria: ctx.category.id, idPrioridad: 1 })
    assert.equal(blocked.status, 400)
    assert.equal((await ctx.sol('GET', `/api/incidencias/${ctx.incident}`)).data.incidencia.categoria, 'Impresoras')
    await admin('PATCH', `/api/categorias/${ctx.category.id}`, { activa: true })
  })

  test('comentarios: el solicitante comenta, pero no hace notas internas', async () => {
    assert.equal((await ctx.sol('POST', `/api/incidencias/${ctx.incident}/comentarios`, { contenido: 'Sigue fallando' })).status, 201)
    assert.equal((await ctx.sol('POST', `/api/incidencias/${ctx.incident}/comentarios`, { contenido: 'x', esInterno: true })).status, 403)
  })

  test('las notas internas no las ve el solicitante', async () => {
    await ctx.agent('POST', `/api/incidencias/${ctx.incident}/comentarios`, { contenido: 'Revisar fusor', esInterno: true })
    const forSol = (await ctx.sol('GET', `/api/incidencias/${ctx.incident}`)).data.incidencia
    const forAgent = (await ctx.agent('GET', `/api/incidencias/${ctx.incident}`)).data.incidencia
    assert.ok(!forSol.comentarios.some((c) => c.esInterno))
    assert.ok(forAgent.comentarios.some((c) => c.esInterno))
  })

  test('asignación: poner En Proceso exige un agente', async () => {
    assert.equal((await admin('PATCH', `/api/incidencias/${ctx.incident}`, { estado: 'En Proceso' })).status, 400)
    const r = await admin('PATCH', `/api/incidencias/${ctx.incident}`, { estado: 'En Proceso', idAgente: ctx.agentId, comentario: 'Ya le atiendo' })
    assert.equal(r.data.incidencia.estado, 'En Proceso')
    assert.equal(r.data.incidencia.agenteId, ctx.agentId)
    assert.ok(r.data.incidencia.fechaPrimeraRespuesta)
  })

  test('el agente resuelve con comentario de resolución', async () => {
    assert.equal((await ctx.agent('POST', `/api/incidencias/${ctx.incident}/comentarios`, { contenido: 'Cambié el tóner', esResolucion: true })).status, 201)
    const r = await ctx.agent('PATCH', `/api/incidencias/${ctx.incident}`, { estado: 'Resuelto' })
    assert.equal(r.data.incidencia.estado, 'Resuelto')
  })

  test('el solicitante confirma y cierra; cerrada queda de solo lectura', async () => {
    const r = await ctx.sol('PATCH', `/api/incidencias/${ctx.incident}`, { estado: 'Cerrado' })
    assert.equal(r.data.incidencia.estado, 'Cerrado')
    assert.equal((await ctx.sol('POST', `/api/incidencias/${ctx.incident}/comentarios`, { contenido: 'x' })).status, 409)
    assert.equal((await admin('PATCH', `/api/incidencias/${ctx.incident}`, { estado: 'En Proceso' })).status, 409)
  })

  test('el historial registra cada cambio con su responsable', async () => {
    const detail = (await admin('GET', `/api/incidencias/${ctx.incident}`)).data.incidencia
    assert.deepEqual(detail.historial.map((h) => h.estadoNuevo), ['Pendiente', 'En Proceso', 'Resuelto', 'Cerrado'])
    assert.ok(detail.historial.every((h) => h.responsable))
  })

  test('rechazar exige motivo', async () => {
    const inc = (await ctx.sol('POST', '/api/incidencias', { titulo: 'Duplicada', descripcion: 'x', idCategoria: ctx.category.id, idPrioridad: 1 })).data.incidencia
    assert.equal((await ctx.agent('PATCH', `/api/incidencias/${inc.id}`, { estado: 'Rechazado' })).status, 400)
    const r = await ctx.agent('PATCH', `/api/incidencias/${inc.id}`, { estado: 'Rechazado', comentario: 'Es duplicada de otra' })
    assert.equal(r.data.incidencia.estado, 'Rechazado')
  })

  test('transferir a otro departamento: el agente deja de verla', async () => {
    const inc = (await ctx.sol('POST', '/api/incidencias', { titulo: 'Para transferir', descripcion: 'x', idCategoria: ctx.category.id, idPrioridad: 1 })).data.incidencia
    const target = catalog.categorias.find((c) => c.departamentoId === other)
    const r = await ctx.agent('POST', `/api/incidencias/${inc.id}/transferencias`, { idCategoria: target.id, motivo: 'No es de IT' })
    assert.equal(r.status, 201)
    assert.equal(r.data.incidencia, null)
    const moved = (await ctx.sol('GET', `/api/incidencias/${inc.id}`)).data.incidencia
    assert.equal(moved.departamentoId, other)
    assert.equal(moved.estado, 'Pendiente')
    assert.equal(moved.transferencias.length, 1)
  })

  test('un agente no puede quitarle la incidencia asignada a otro agente', async () => {
    const inc = (await ctx.sol('POST', '/api/incidencias', { titulo: 'De IT', descripcion: 'x', idCategoria: ctx.category.id, idPrioridad: 1 })).data.incidencia
    await admin('PATCH', `/api/incidencias/${inc.id}`, { idAgente: ctx.agentId })
    await admin('POST', '/api/usuarios', { nombre: 'Agente 2', correo: 'agente2@prueba.local', password: 'Prueba12345', role: 'agent', idDepartamento: it })
    const agent2 = await login(url, 'agente2@prueba.local')
    assert.equal((await agent2('PATCH', `/api/incidencias/${inc.id}`, { idAgente: null })).status, 403)
  })
})

describe('Cierre de sesión', () => {
  test('logout borra la cookie y la sesión deja de valer', async () => {
    const session = await login(url, 'admin@prueba.local')
    const r = await session('POST', '/api/auth/logout')
    assert.equal(r.status, 200)
    assert.match(r.setCookie, /Max-Age=0/i)
    assert.equal((await session('GET', '/api/incidencias')).status, 401)
  })
})
