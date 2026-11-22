// Pruebas de adjuntos: subir, ver, descargar, permisos, validación de tipo/tamaño y respaldo de los archivos.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { restoreAttachments, syncAttachments } from '../server/backup.js'
import { createTestDatabase, insertUser, login, startServer } from './helpers.js'

// PNG mínimo de 1×1 píxel.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')

function form(...files) {
  const data = new FormData()
  for (const [name, content, type = 'application/octet-stream'] of files) data.append('archivos', new Blob([content], { type }), name)
  return data
}

let database
let server
let admin
let sol
let agent
let incidentId

before(async () => {
  database = await createTestDatabase()
  await insertUser(database.db, { nombre: 'Admin', correo: 'admin@prueba.local' })
  server = await startServer(database.db)
  admin = await login(server.url, 'admin@prueba.local')
  const catalog = (await admin('GET', '/api/catalogos')).data
  const it = catalog.departamentos.find((d) => d.nombre.startsWith('Inform')).id
  await admin('POST', '/api/usuarios', { nombre: 'Sol', correo: 'sol@prueba.local', password: 'Prueba12345', role: 'applicant' })
  await admin('POST', '/api/usuarios', { nombre: 'Otro', correo: 'otro@prueba.local', password: 'Prueba12345', role: 'applicant' })
  await admin('POST', '/api/usuarios', { nombre: 'Agente', correo: 'agente@prueba.local', password: 'Prueba12345', role: 'agent', idDepartamento: it })
  sol = await login(server.url, 'sol@prueba.local')
  agent = await login(server.url, 'agente@prueba.local')
  const category = catalog.categorias.find((c) => c.departamentoId === it)
  incidentId = (await sol('POST', '/api/incidencias', { titulo: 'Pantalla azul', descripcion: 'Adjunto captura', idCategoria: category.id, idPrioridad: catalog.prioridades[0].id })).data.incidencia.id
})

after(async () => {
  await server?.close()
  await database?.drop()
})

describe('Adjuntos de incidencias', () => {
  test('el solicitante sube una captura y un texto', async () => {
    const r = await sol('POST', `/api/incidencias/${incidentId}/adjuntos`, form(['captura.png', PNG, 'image/png'], ['registro.log', 'Error 0x0000007B']))
    assert.equal(r.status, 201)
    const files = r.data.incidencia.adjuntos
    assert.equal(files.length, 2)
    assert.equal(files[0].nombre, 'captura.png')
    assert.equal(files[0].esImagen, true)
    assert.equal(files[0].tamano, PNG.length)
    assert.equal((await readdir(server.attachmentsDir)).length, 2)
  })

  test('el agente del departamento ve y descarga el archivo; el contenido es idéntico', async () => {
    const [file] = (await agent('GET', `/api/incidencias/${incidentId}`)).data.incidencia.adjuntos
    const r = await agent('GET', `/api/incidencias/${incidentId}/adjuntos/${file.id}`)
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('content-type'), 'image/png')
    assert.match(r.headers.get('content-disposition'), /^inline/)
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
    assert.ok(r.raw.equals(PNG))
    const download = await agent('GET', `/api/incidencias/${incidentId}/adjuntos/${file.id}?descargar`)
    assert.match(download.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''captura\.png/)
  })

  test('quien no puede ver la incidencia no puede descargar sus archivos', async () => {
    const [file] = (await sol('GET', `/api/incidencias/${incidentId}`)).data.incidencia.adjuntos
    const stranger = await login(server.url, 'otro@prueba.local')
    assert.equal((await stranger('GET', `/api/incidencias/${incidentId}/adjuntos/${file.id}`)).status, 404)
    assert.equal((await stranger('POST', `/api/incidencias/${incidentId}/adjuntos`, form(['x.txt', 'hola']))).status, 404)
  })

  test('se rechazan tipos no permitidos y archivos que no son lo que dicen', async () => {
    const html = await sol('POST', `/api/incidencias/${incidentId}/adjuntos`, form(['pagina.html', '<script>alert(1)</script>']))
    assert.equal(html.status, 400)
    assert.match(html.data.error, /tipo de archivo no permitido/)
    const fake = await sol('POST', `/api/incidencias/${incidentId}/adjuntos`, form(['falsa.png', 'no soy una imagen']))
    assert.equal(fake.status, 400)
    assert.match(fake.data.error, /no parece un archivo \.png válido/)
  })

  test('límites: 5 MB por archivo y 5 archivos por envío', async () => {
    const big = await sol('POST', `/api/incidencias/${incidentId}/adjuntos`, form(['grande.txt', 'a'.repeat(5 * 1024 * 1024 + 1)]))
    assert.equal(big.status, 413)
    const many = form(...Array.from({ length: 6 }, (_, i) => [`n${i}.txt`, 'x']))
    assert.equal((await sol('POST', `/api/incidencias/${incidentId}/adjuntos`, many)).status, 400)
    assert.equal((await sol('POST', `/api/incidencias/${incidentId}/adjuntos`, new FormData())).status, 400)
  })

  test('solo quien lo subió o un administrador puede eliminar', async () => {
    const [png, log] = (await sol('GET', `/api/incidencias/${incidentId}`)).data.incidencia.adjuntos
    assert.equal((await agent('DELETE', `/api/incidencias/${incidentId}/adjuntos/${png.id}`)).status, 403)
    const r = await sol('DELETE', `/api/incidencias/${incidentId}/adjuntos/${log.id}`)
    assert.equal(r.status, 200)
    assert.equal(r.data.incidencia.adjuntos.length, 1)
    assert.equal((await readdir(server.attachmentsDir)).length, 1)
  })

  test('una incidencia cerrada o rechazada no admite adjuntos nuevos', async () => {
    await agent('PATCH', `/api/incidencias/${incidentId}`, { estado: 'Rechazado', comentario: 'Duplicada' })
    const r = await sol('POST', `/api/incidencias/${incidentId}/adjuntos`, form(['tarde.txt', 'x']))
    assert.equal(r.status, 409)
    const [png] = (await admin('GET', `/api/incidencias/${incidentId}`)).data.incidencia.adjuntos
    assert.equal((await admin('DELETE', `/api/incidencias/${incidentId}/adjuntos/${png.id}`)).status, 409)
  })

  test('el respaldo copia los adjuntos cifrados y se pueden restaurar', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tickops-respaldo-adjuntos-'))
    const restoreTo = await mkdtemp(join(tmpdir(), 'tickops-restaurados-'))
    try {
      const config = { dir, password: 'clave-de-prueba-larga', attachmentsDir: server.attachmentsDir }
      assert.equal(await syncAttachments(config), 1)
      assert.equal(await syncAttachments(config), 0) // incremental: no repite lo ya respaldado
      const [encrypted] = await readdir(join(dir, 'adjuntos'))
      assert.match(encrypted, /\.png\.enc$/)
      assert.equal(await restoreAttachments({ ...config, attachmentsDir: restoreTo }), 1)
      const [restored] = await readdir(restoreTo)
      assert.ok(existsSync(join(server.attachmentsDir, restored)))
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(restoreTo, { recursive: true, force: true })
    }
  })
})
