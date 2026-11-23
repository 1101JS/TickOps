// Cliente HTTP para la API de TickOps (mismo origen: /api en Cloudflare o en el servidor LAN).
export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// Vista activa del administrador ("agente:<id>" o "solicitante"); la fija ViewService. El servidor la ignora en otros roles.
let viewHeader = null
export function setViewHeader(value) {
  viewHeader = value || null
}

function headers(extra = {}) {
  return viewHeader ? { ...extra, 'x-vista': viewHeader } : extra
}

export async function api(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: headers(body !== undefined ? { 'content-type': 'application/json' } : {}),
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor.')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, data.error || `Error ${response.status}`)
  return data
}

// Envío de archivos (multipart/form-data). El navegador pone el content-type con su "boundary".
export async function apiUpload(path, formData) {
  let response
  try {
    response = await fetch(`/api${path}`, { method: 'POST', credentials: 'same-origin', headers: headers(), body: formData })
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor.')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, data.error || `Error ${response.status}`)
  return data
}
