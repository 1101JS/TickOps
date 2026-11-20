// Esquema y datos iniciales. Se aplican automáticamente al arrancar (D1 en Cloudflare o SQLite en LAN).
// Para cambiar el esquema, agrega una nueva entrada al final de MIGRATIONS; nunca edites una ya aplicada.
import { hashPassword } from './lib/crypto.js'

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export const MIGRATIONS = [
  {
    id: '0001_init',
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        email TEXT,
        role TEXT NOT NULL CHECK (role IN ('admin','technician','applicant')),
        specialty TEXT,
        password_hash TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (${NOW})
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (${NOW})
      )`,
      `CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        priority TEXT NOT NULL CHECK (priority IN ('Baja','Media','Alta')),
        status TEXT NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente','En proceso','Resuelta')),
        reporter_id INTEGER NOT NULL REFERENCES users(id),
        technician_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (${NOW}),
        updated_at TEXT NOT NULL DEFAULT (${NOW})
      )`,
      `CREATE TABLE IF NOT EXISTS ticket_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (${NOW})
      )`,
      'CREATE INDEX IF NOT EXISTS idx_tickets_reporter ON tickets(reporter_id)',
      'CREATE INDEX IF NOT EXISTS idx_tickets_technician ON tickets(technician_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_updates_ticket ON ticket_updates(ticket_id)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)'
    ]
  }
]

// Hashes precalculados (PBKDF2, 20 000 iteraciones) para no gastar CPU del Worker al sembrar.
const DEMO_HASH = {
  admin: 'pbkdf2_sha256$20000$gU0txf3hBKCVVzHwtL1XjQ==$pvRiL28IRAQQjerzvI+LHrY1QmCYT27QWhTod0DUpJs=',
  tecnico: 'pbkdf2_sha256$20000$oEJaE1Ktkl4HMsKAWvNvBQ==$3vBWuPaeaMPnI+5+axJXXphan/crmk7OMYAHfWgHVSA=',
  usuario: 'pbkdf2_sha256$20000$im86TSo/Qb1zii60Pfx3Fg==$WsqqeavO/B6Dz/tuvKOb4dhA3DeRIti1I9gJtUUVo9s='
}

// Cuentas demo: admin/admin, tecnico|carlos|maria|jose/tecnico, usuario/usuario
const DEMO_USERS = [
  [1, 'admin', 'Administrador', 'admin@tickops.bid', 'admin', null, DEMO_HASH.admin],
  [2, 'tecnico', 'Ana López', 'ana.lopez@tickops.bid', 'technician', 'Hardware y redes', DEMO_HASH.tecnico],
  [3, 'carlos', 'Carlos Mejía', 'carlos.mejia@tickops.bid', 'technician', 'Software', DEMO_HASH.tecnico],
  [4, 'maria', 'María García', 'maria.garcia@tickops.bid', 'technician', 'Redes', DEMO_HASH.tecnico],
  [5, 'jose', 'José Rivera', 'jose.rivera@tickops.bid', 'technician', 'Soporte general', DEMO_HASH.tecnico],
  [6, 'usuario', 'Usuario final', 'usuario@tickops.bid', 'applicant', null, DEMO_HASH.usuario]
]

const DEMO_TICKETS = [
  [98, 'Error en el sistema', 'El sistema institucional mostraba un error al guardar los cambios.', 'Software', 'Alta', 'Resuelta', 6, 3, '2026-11-12T15:00:00.000Z'],
  [103, 'Sin conexión a internet', 'El aula 203 no tiene conexión a la red institucional desde esta mañana.', 'Redes', 'Alta', 'Pendiente', 6, 2, '2026-11-14T14:00:00.000Z']
]

const DEMO_UPDATES = [
  [1, 98, null, 'Incidencia registrada y asignada automáticamente.', '2026-11-12T15:00:00.000Z'],
  [2, 98, 3, 'Incidencia resuelta y validada.', '2026-11-12T20:00:00.000Z'],
  [3, 103, null, 'Incidencia registrada y asignada automáticamente.', '2026-11-14T14:00:00.000Z']
]

async function seedDemo(db) {
  // INSERT OR IGNORE con ids fijos: es seguro aunque dos instancias del Worker siembren a la vez.
  for (const user of DEMO_USERS) {
    await db.run('INSERT OR IGNORE INTO users (id, username, name, email, role, specialty, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)', ...user)
  }
  for (const [id, title, description, category, priority, status, reporterId, technicianId, createdAt] of DEMO_TICKETS) {
    await db.run(
      'INSERT OR IGNORE INTO tickets (id, title, description, category, priority, status, reporter_id, technician_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, title, description, category, priority, status, reporterId, technicianId, createdAt, createdAt
    )
  }
  for (const update of DEMO_UPDATES) {
    await db.run('INSERT OR IGNORE INTO ticket_updates (id, ticket_id, author_id, text, created_at) VALUES (?, ?, ?, ?, ?)', ...update)
  }
}

// Instalación limpia (modo LAN / cliente): crea el primer administrador desde variables de entorno.
async function bootstrapAdmin(db, config) {
  if (!config.adminPassword) return
  const existing = await db.first('SELECT COUNT(*) AS total FROM users')
  if (existing.total > 0) return
  const hash = await hashPassword(config.adminPassword, config.passwordIterations)
  await db.run(
    "INSERT OR IGNORE INTO users (username, name, role, password_hash) VALUES (?, 'Administrador', 'admin', ?)",
    config.adminUsername, hash
  )
}

export async function ensureSchema(db, config) {
  await db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (${NOW}))`)
  const applied = new Set((await db.all('SELECT id FROM schema_migrations')).map((row) => row.id))

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue
    for (const statement of migration.statements) await db.run(statement)
    await db.run('INSERT OR IGNORE INTO schema_migrations (id) VALUES (?)', migration.id)
  }

  if (config.seedDemo && !applied.has('seed_demo')) {
    await seedDemo(db)
    await db.run("INSERT OR IGNORE INTO schema_migrations (id) VALUES ('seed_demo')")
  }

  await bootstrapAdmin(db, config)
}
