// Crea un usuario Administrador en PostgreSQL con la contraseña cifrada (PBKDF2), igual que la API.
//   npm run crear-admin
// Pide nombre, correo y contraseña por consola. La contraseña no se muestra mientras se escribe.
// Sirve también para recuperar el acceso si se pierde la contraseña del único administrador.
import { consoleError, promptAndCreateAdmin } from './lib/admin.js'
import { createPrompt } from './lib/prompt.js'
import { createDb } from './db.js'

const prompt = createPrompt()
const db = createDb({ max: 1 })

try {
  const info = await db.first(
    `SELECT current_database() AS base,
            (SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE r.nombre = 'Administrador') AS admins`
  )
  console.log(`Base de datos: ${info.base} · administradores actuales: ${info.admins}`)
  console.log('Crear nuevo administrador\n')
  const created = await promptAndCreateAdmin(db, prompt.ask)
  console.log(`\nListo: administrador #${created.id} (${created.correo}) creado. Ya puedes iniciar sesión en el sitio.`)
  process.exitCode = 0
} catch (error) {
  console.error(`\nError: ${consoleError(error)}`)
  process.exitCode = 1
} finally {
  prompt.close()
  await db.end()
}
