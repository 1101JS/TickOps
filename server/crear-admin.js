// Crea un usuario Administrador en PostgreSQL con la contraseña cifrada (PBKDF2), igual que la API.
//   npm run crear-admin
// Pide nombre, correo y contraseña por consola. La contraseña no se muestra mientras se escribe.
import { createInterface } from 'node:readline'
import { hashPassword } from './lib/crypto.js'
import { createDb } from './db.js'

const interactive = Boolean(process.stdin.isTTY)
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: interactive })
const lines = rl[Symbol.asyncIterator]()

// Mientras "muted" está activo, lo que se teclea no aparece en pantalla.
let muted = false
const writeToOutput = rl._writeToOutput?.bind(rl)
rl._writeToOutput = (chunk) => {
  if (!muted && writeToOutput) writeToOutput(chunk)
}

async function ask(question, { hidden = false } = {}) {
  process.stdout.write(question)
  muted = hidden && interactive
  const { value, done } = await lines.next()
  if (muted) process.stdout.write('\n')
  muted = false
  if (done) throw new Error('Entrada cancelada.')
  return value.trim()
}

const db = createDb({ max: 1 })

try {
  const info = await db.first(
    `SELECT current_database() AS base,
            (SELECT id_rol FROM roles WHERE nombre = 'Administrador') AS id_rol,
            (SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE r.nombre = 'Administrador') AS admins`
  )
  if (!info.id_rol) throw new Error('La base no tiene el rol "Administrador" en la tabla roles.')
  console.log(`Base de datos: ${info.base} · administradores actuales: ${info.admins}`)
  console.log('Crear nuevo administrador\n')

  const nombre = await ask('Nombre completo: ')
  if (!nombre || nombre.length > 100) throw new Error('El nombre es obligatorio (máximo 100 caracteres).')

  const correo = (await ask('Correo: ')).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 120) throw new Error('El correo no tiene un formato válido.')
  if (await db.first('SELECT 1 FROM usuarios WHERE lower(correo) = $1', [correo])) throw new Error('Ya existe un usuario con ese correo.')

  const password = await ask('Contraseña (mínimo 8 caracteres): ', { hidden: true })
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.')
  if ((await ask('Repite la contraseña: ', { hidden: true })) !== password) throw new Error('Las contraseñas no coinciden.')

  const hash = await hashPassword(password, Number(process.env.PBKDF2_ITERATIONS || 100000))
  const created = await db.first(
    'INSERT INTO usuarios (nombre, correo, password_hash, id_rol) VALUES ($1, $2, $3, $4) RETURNING id_usuario',
    [nombre, correo, hash, info.id_rol]
  )
  console.log(`\nListo: administrador #${created.id_usuario} (${correo}) creado. Ya puedes iniciar sesión en el sitio.`)
  process.exitCode = 0
} catch (error) {
  const message = error.code === '28P01' ? 'Contraseña de PostgreSQL incorrecta (revisa PGPASSWORD en .env).'
    : error.code === 'ECONNREFUSED' ? 'No se pudo conectar a PostgreSQL (¿está encendido el servicio?).'
    : error.message
  console.error(`\nError: ${message}`)
  process.exitCode = 1
} finally {
  rl.close()
  await db.end()
}
