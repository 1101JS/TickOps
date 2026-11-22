// Punto de entrada en Cloudflare Workers (tickops.bid).
// - El frontend (dist/) lo sirve Cloudflare directamente.
// - Las rutas /api/* se reenvían por un túnel de Cloudflare al servidor Node que corre en la PC (API_ORIGIN).
//   La base de datos PostgreSQL nunca se expone: solo la API de la PC habla con ella.
const OFFLINE_MESSAGE = 'El servidor de TickOps está apagado en este momento. Intenta más tarde.'

function offline(status = 503) {
  return new Response(JSON.stringify({ error: OFFLINE_MESSAGE }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (!env.API_ORIGIN) return offline()

    const target = new URL(url.pathname + url.search, env.API_ORIGIN)
    const hasBody = !['GET', 'HEAD'].includes(request.method)
    let response
    try {
      response = await fetch(target, {
        method: request.method,
        headers: request.headers,
        body: hasBody ? request.body : undefined,
        redirect: 'manual'
      })
    } catch {
      return offline()
    }

    // Si la PC o el túnel no responden, Cloudflare devuelve una página HTML de error (502/530/1033...).
    const isJson = (response.headers.get('content-type') || '').includes('application/json')
    if (response.status >= 500 && !isJson) return offline()
    return new Response(response.body, response)
  }
}
