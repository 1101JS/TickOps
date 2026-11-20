// Cliente HTTP para la API de TickOps (mismo origen: /api en Cloudflare o en el servidor LAN).
export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor.')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, data.error || `Error ${response.status}`)
  return data
}
