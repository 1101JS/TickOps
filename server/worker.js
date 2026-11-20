// Punto de entrada en Cloudflare Workers (modo en línea / demostración en tickops.bid).
// Las rutas /api/* llegan aquí (run_worker_first en wrangler.jsonc); el resto lo sirve Static Assets desde dist/.
import { handleApi, readConfig } from './app.js'

function d1Adapter(d1) {
  return {
    key: d1,
    async all(sql, ...params) {
      return (await d1.prepare(sql).bind(...params).all()).results
    },
    first(sql, ...params) {
      return d1.prepare(sql).bind(...params).first()
    },
    async run(sql, ...params) {
      const result = await d1.prepare(sql).bind(...params).run()
      return { lastId: result.meta.last_row_id, changes: result.meta.changes }
    }
  }
}

let cached = null

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (!cached || cached.binding !== env.DB) {
      cached = { binding: env.DB, db: d1Adapter(env.DB), config: readConfig(env) }
    }
    return handleApi(request, cached)
  }
}
