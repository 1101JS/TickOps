// Rutas del proyecto que usan varios módulos del servidor.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const DB_DIR = join(PROJECT_ROOT, 'db')
