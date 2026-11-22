// Conexión a PostgreSQL con el paquete "pg".
// Lee la configuración de las variables estándar PGHOST, PGPORT, PGUSER, PGPASSWORD y PGDATABASE (archivo .env).
import pg from 'pg'

// COUNT(*) y otros BIGINT llegan como texto por defecto; aquí se convierten a número.
pg.types.setTypeParser(20, (value) => Number(value))

function wrap(client) {
  return {
    async all(sql, params = []) {
      return (await client.query(sql, params)).rows
    },
    async first(sql, params = []) {
      return (await client.query(sql, params)).rows[0] ?? null
    },
    async run(sql, params = []) {
      const result = await client.query(sql, params)
      return { rows: result.rows, count: result.rowCount }
    }
  }
}

export function createDb(options = {}) {
  const pool = new pg.Pool({ max: 10, ...options })
  // Un cliente inactivo que pierde la conexión no debe tumbar el servidor.
  pool.on('error', (error) => console.error('PostgreSQL:', error.message))

  return {
    ...wrap(pool),
    // Ejecuta fn dentro de una transacción: si algo falla, se revierte todo.
    async tx(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn(wrap(client))
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    end: () => pool.end()
  }
}
