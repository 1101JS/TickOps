// Pruebas unitarias de la lógica del servidor (no necesitan base de datos).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { hashPassword, signToken, verifyPassword, verifyToken } from '../server/lib/crypto.js'
import { HttpError, email, fromDbError, intId, newPassword, text } from '../server/lib/http.js'
import { allowedTargets, canManage, incidentScope, shapeIncident } from '../server/lib/incidents.js'

const admin = { id: 1, role: 'admin', departamentoId: null }
const agentIT = { id: 2, role: 'agent', departamentoId: 1 }
const agentHR = { id: 3, role: 'agent', departamentoId: 3 }
const applicant = { id: 4, role: 'applicant', departamentoId: null }

// Fila de incidencia como la devuelve INCIDENT_SELECT.
function row(overrides = {}) {
  return {
    id_incidencia: 10, titulo: 'Sin red', descripcion: 'No hay internet',
    id_categoria: 2, categoria: 'Redes', id_departamento: 1, departamento: 'Informática (IT)',
    id_prioridad: 4, prioridad: 'Crítica', sla_primera_respuesta_horas: 1, sla_resolucion_horas: 8,
    id_estado: 1, estado: 'Pendiente', es_estado_final: false,
    id_solicitante: 4, solicitante: 'Sol', id_agente: null, agente: null,
    fecha_creacion: new Date(), fecha_actualizacion: new Date(), fecha_primera_respuesta: null,
    fecha_resolucion: null, fecha_cierre: null,
    ...overrides
  }
}

describe('Validación de datos (lib/http.js)', () => {
  test('text recorta espacios y exige el campo', () => {
    assert.equal(text('  hola  ', 'campo'), 'hola')
    assert.throws(() => text('   ', 'título'), { status: 400, message: 'El campo "título" es obligatorio.' })
    assert.equal(text(undefined, 'opcional', { required: false }), '')
  })

  test('text respeta el máximo de caracteres', () => {
    assert.throws(() => text('abcdef', 'nombre', { max: 5 }), { status: 400 })
  })

  test('intId acepta solo enteros positivos', () => {
    assert.equal(intId('7', 'id'), 7)
    for (const bad of ['0', '-1', '1.5', 'abc', null]) assert.throws(() => intId(bad, 'id'), HttpError)
  })

  test('email normaliza a minúsculas y valida el formato', () => {
    assert.equal(email(' Ana@Empresa.COM '), 'ana@empresa.com')
    assert.throws(() => email('no-es-correo'), { status: 400 })
  })

  test('newPassword exige al menos 8 caracteres', () => {
    assert.equal(newPassword('12345678'), '12345678')
    assert.throws(() => newPassword('corta'), { status: 400 })
  })

  test('fromDbError traduce errores de PostgreSQL', () => {
    assert.deepEqual(
      { ...fromDbError({ code: 'P0001', message: 'Regla de negocio: Cerrada es de solo lectura' }) },
      { status: 409 }
    )
    assert.equal(fromDbError({ code: 'P0001', message: 'Regla de negocio: Cerrada es de solo lectura' }).message, 'Cerrada es de solo lectura')
    assert.equal(fromDbError({ code: '23505', constraint: 'usuarios_correo_key' }).message, 'Ya existe un usuario con ese correo.')
    assert.equal(fromDbError({ code: '23505', constraint: 'uq_categoria_departamento' }).message, 'Ya existe una categoría con ese nombre en el departamento.')
    assert.equal(fromDbError({ code: '23503' }).status, 400)
    assert.equal(fromDbError({ code: 'XX000' }), null)
  })
})

describe('Permisos y estados (lib/incidents.js)', () => {
  test('canManage: admin todo, agente solo su departamento, solicitante nada', () => {
    assert.equal(canManage(admin, row()), true)
    assert.equal(canManage(agentIT, row()), true)
    assert.equal(canManage(agentHR, row()), false)
    assert.equal(canManage(applicant, row()), false)
  })

  test('incidentScope limita lo que ve cada rol', () => {
    assert.equal(incidentScope(admin, 1).sql, 'TRUE')
    assert.deepEqual(incidentScope(agentIT, 1).params, [1, 2])
    assert.deepEqual(incidentScope(applicant, 1), { sql: 'i.id_solicitante = $1', params: [4] })
  })

  test('flujo de estados para quien gestiona', () => {
    assert.deepEqual(allowedTargets(agentIT, row({ estado: 'Pendiente' })).sort(), ['En Proceso', 'Rechazado'])
    assert.deepEqual(allowedTargets(agentIT, row({ estado: 'En Proceso' })).sort(), ['Pendiente', 'Rechazado', 'Resuelto'])
    assert.deepEqual(allowedTargets(agentHR, row({ estado: 'Pendiente' })), [])
  })

  test('el solicitante puede cerrar o reabrir una resuelta dentro del plazo', () => {
    const resolved = row({ estado: 'Resuelto', fecha_resolucion: new Date() })
    assert.deepEqual(allowedTargets(applicant, resolved).sort(), ['Cerrado', 'En Proceso'])
    const old = row({ estado: 'Resuelto', fecha_resolucion: new Date(Date.now() - 30 * 24 * 3600 * 1000) })
    assert.deepEqual(allowedTargets(applicant, old), ['Cerrado'])
  })

  test('los estados finales son de solo lectura', () => {
    assert.deepEqual(allowedTargets(admin, row({ estado: 'Cerrado', es_estado_final: true })), [])
  })

  test('shapeIncident calcula el SLA y las acciones', () => {
    const late = shapeIncident(row({ fecha_creacion: new Date(Date.now() - 10 * 3600 * 1000) }), agentIT)
    assert.equal(late.sla.resolucionVencida, true)
    assert.equal(late.sla.respuestaVencida, true)
    assert.equal(late.acciones.gestionar, true)
    assert.equal(late.acciones.transferir, true)

    const fresh = shapeIncident(row(), applicant)
    assert.equal(fresh.sla.resolucionVencida, false)
    assert.equal(fresh.acciones.gestionar, false)
    assert.equal(fresh.acciones.comentarioInterno, false)
    assert.equal(fresh.acciones.comentar, true)
  })
})

describe('Cifrado (lib/crypto.js)', () => {
  test('hashPassword/verifyPassword', async () => {
    const hash = await hashPassword('secreta123', 1000)
    assert.match(hash, /^pbkdf2_sha256\$1000\$/)
    assert.equal(await verifyPassword('secreta123', hash), true)
    assert.equal(await verifyPassword('otra', hash), false)
  })

  test('el token de sesión se rechaza si se altera o con otra clave', async () => {
    const token = await signToken({ u: 5 }, 'clave')
    assert.deepEqual(await verifyToken(token, 'clave'), { u: 5 })
    assert.equal(await verifyToken(token, 'otra-clave'), null)
    assert.equal(await verifyToken(token.slice(0, -2) + 'xx', 'clave'), null)
  })
})
