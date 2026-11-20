# TickOps

Plataforma de gestión de incidencias de soporte técnico (landing comercial + portal de tickets).
Un mismo código funciona **en línea** (Cloudflare, demo en https://tickops.bid) y **en red local** (instalación del cliente).

```
src/        Frontend Vue 3 + Vite (landing, login, paneles por rol)
server/
  app.js      API REST (agnóstica de plataforma: Request → Response)
  schema.js   Esquema SQL, migraciones automáticas y datos demo
  worker.js   Entrada Cloudflare Workers + D1
  node.js     Entrada LAN: Node + SQLite (node:sqlite), sirve también dist/
wrangler.jsonc  Configuración de Cloudflare
```

## Modo en línea (Cloudflare)

Cada `git push` a `main` dispara Workers Builds: `npm run build` y `npx wrangler deploy`.
- `/api/*` lo atiende el Worker; el resto se sirve como estático desde `dist/`.
- La base D1 `tickops` se crea en el primer deploy y el esquema se aplica solo en la primera petición.
- `SEED_DEMO=true` (en `wrangler.jsonc`) crea las cuentas demo:

| Usuario | Contraseña | Rol |
|---|---|---|
| admin | admin | Administrador |
| tecnico, carlos, maria, jose | tecnico | Técnico |
| usuario | usuario | Solicitante |

Deploy manual: `npx wrangler login` y luego `npm run deploy`.

## Modo LAN (cliente)

Requiere Node 22.13 o superior. No necesita internet ni servicios de Cloudflare.

```bash
npm install
npm run build
# primer arranque: crea el administrador
ADMIN_PASSWORD="una-clave-segura" npm run lan     # PowerShell: $env:ADMIN_PASSWORD="..."; npm run lan
```

Queda disponible en `http://<ip-del-servidor>:3000` para toda la red. También se puede crear un archivo `.env`:

```
PORT=3000
HOST=0.0.0.0
DB_PATH=data/tickops.db
ADMIN_USERNAME=admin
ADMIN_PASSWORD=una-clave-segura
ALLOW_REGISTRATION=true
PBKDF2_ITERATIONS=100000
```

`npm run lan:demo` arranca con las cuentas demo. Para respaldar, basta con copiar `data/tickops.db`.

## Desarrollo

```bash
npm run dev:api   # Worker + D1 local en :8787 (o: npm run lan, y API_TARGET=http://localhost:3000)
npm run dev       # Vite en :5173 con proxy /api
```

## API

| Método | Ruta | Roles |
|---|---|---|
| POST | /api/auth/login · /logout · /register | público |
| GET | /api/auth/me | público |
| GET | /api/tickets · /api/tickets/:id | todos (filtrado por rol) |
| POST | /api/tickets | admin, solicitante (asignación automática al técnico con menos carga) |
| PATCH | /api/tickets/:id | admin (todo) · técnico (solo estado) |
| POST | /api/tickets/:id/updates | todos sobre sus tickets |
| GET | /api/technicians | admin, técnico |
| GET/POST | /api/users | admin |
| GET | /api/health | público |
