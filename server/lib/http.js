// Errores HTTP y validación de datos de entrada, compartidos por todos los routers.

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function text(value, field, { max = 200, required = true } = {}) {
  const result = typeof value === 'string' ? value.trim() : ''
  if (required && !result) throw new HttpError(400, `El campo "${field}" es obligatorio.`)
  if (result.length > max) throw new HttpError(400, `El campo "${field}" supera ${max} caracteres.`)
  return result
}

export function intId(value, field) {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new HttpError(400, `El campo "${field}" no es válido.`)
  return number
}

export function email(value) {
  const result = text(value, 'correo', { max: 120 }).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, 'El correo no tiene un formato válido.')
  return result
}

export function newPassword(value) {
  const result = typeof value === 'string' ? value : ''
  if (result.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.')
  if (result.length > 200) throw new HttpError(400, 'La contraseña es demasiado larga.')
  return result
}

const DUPLICATE_MESSAGES = {
  usuarios_correo_key: 'Ya existe un usuario con ese correo.',
  uq_categoria_departamento: 'Ya existe una categoría con ese nombre en el departamento.'
}

// Traduce errores de PostgreSQL a respuestas comprensibles.
export function fromDbError(error) {
  if (error.code === 'P0001') return new HttpError(409, error.message.replace(/^Regla de negocio:\s*/i, ''))
  if (error.code === '23505') {
    return new HttpError(409, DUPLICATE_MESSAGES[error.constraint] || 'Ya existe un registro con esos datos.')
  }
  if (error.code === '23503') return new HttpError(400, 'Uno de los datos relacionados no existe.')
  if (error.code === '23514') return new HttpError(400, 'Algún dato no cumple las reglas de la base de datos.')
  return null
}
