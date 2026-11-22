// Pruebas del respaldo cifrado: se respalda la base temporal de prueba en una carpeta temporal.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { createBackup, decryptBackup, listBackups } from '../server/backup.js'
import { createTestDatabase } from './helpers.js'

let database
let dir
let previousDatabase
const password = 'clave-de-prueba-larga'

before(async () => {
  database = await createTestDatabase()
  dir = await mkdtemp(join(tmpdir(), 'tickops-respaldos-'))
  // pg_dump toma la base de PGDATABASE: se apunta a la de prueba mientras dura este archivo.
  previousDatabase = process.env.PGDATABASE
  process.env.PGDATABASE = database.name
})

after(async () => {
  process.env.PGDATABASE = previousDatabase
  await database?.drop()
  if (dir) await rm(dir, { recursive: true, force: true })
})

describe('Respaldo cifrado (server/backup.js)', () => {
  test('crea un respaldo cifrado que se puede descifrar', async () => {
    const result = await createBackup({ dir, password, keep: 5 })
    const encrypted = await readFile(result.path)
    assert.equal(encrypted.subarray(0, 5).toString(), 'TKBK1')
    assert.ok(!encrypted.includes(Buffer.from('PGDMP')), 'el contenido no debe quedar legible')

    const output = await decryptBackup(result.path, password, join(dir, 'descifrado.dump'))
    const plain = await readFile(output)
    assert.equal(plain.subarray(0, 5).toString(), 'PGDMP') // cabecera del formato personalizado de pg_dump
  })

  test('con una clave incorrecta no se descifra', async () => {
    const [latest] = await listBackups(dir)
    await assert.rejects(decryptBackup(latest.path, 'otra-clave-incorrecta', join(dir, 'x.dump')), /Clave incorrecta/)
  })

  test('conserva solo los últimos N respaldos', async () => {
    for (let i = 0; i < 3; i++) {
      await createBackup({ dir, password, keep: 2 })
      await new Promise((resolve) => setTimeout(resolve, 1100)) // nombres distintos (resolución de 1 s)
    }
    assert.equal((await listBackups(dir)).length, 2)
  })

  test('sin clave o sin carpeta no se respalda', async () => {
    await assert.rejects(createBackup({ dir, password: '' }), /BACKUP_PASSWORD/)
    await assert.rejects(createBackup({ dir: '', password }), /BACKUP_DIR/)
  })
})
