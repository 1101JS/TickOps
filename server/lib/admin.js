// Alta del administrador desde la consola (npm run crear-admin y npm run instalar).
import { hashPassword } from './crypto.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Pide nombre, correo y contraseña con "ask" (ver prompt.js) y crea el usuario Administrador.
export async function promptAndCreateAdmin(db, ask, { iterations = Number(process.env.PBKDF2_ITERATIONS || 100000) } = {}) {
  const role = await db.first("SELECT id_rol FROM roles WHERE nombre = 'Administrador'")
  if (!role) throw new Error('La base no tiene el rol "Administrador" en la tabla roles.')

  const nombre = await ask('Nombre completo: ')
  if (!nombre || nombre.length > 100) throw new Error('El nombre es obligatorio (máximo 100 caracteres).')

  const correo = (await ask('Correo: ')).toLowerCase()
  if (!EMAIL.test(correo) || correo.length > 120) throw new Error('El correo no tiene un formato válido.')
  if (await db.first('SELECT 1 FROM usuarios WHERE lower(correo) = $1', [correo])) throw new Error('Ya existe un usuario con ese correo.')

  const password = await ask('Contraseña (mínimo 8 caracteres): ', { hidden: true })
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.')
  if ((await ask('Repite la contraseña: ', { hidden: true })) !== password) throw new Error('Las contraseñas no coinciden.')

  const created = await db.first(
    'INSERT INTO usuarios (nombre, correo, password_hash, id_rol) VALUES ($1, $2, $3, $4) RETURNING id_usuario',
    [nombre, correo, await hashPassword(password, iterations), role.id_rol]
  )
  return { id: created.id_usuario, correo }
}

// Mensaje comprensible para los errores de conexión más comunes.
export function consoleError(error) {
  if (error.code === '28P01') return 'Contraseña de PostgreSQL incorrecta (revisa PGPASSWORD en .env).'
  if (error.code === 'ECONNREFUSED') return 'No se pudo conectar a PostgreSQL (¿está encendido el servicio?).'
  if (error.code === '3D000') return `La base de datos "${process.env.PGDATABASE}" no existe. Para crearla usa: npm run instalar`
  return error.message
}
