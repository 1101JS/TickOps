# TickOps

Plataforma de gestión de incidencias de soporte técnico (landing comercial + portal de incidencias).
El backend trabaja sobre la base PostgreSQL **sistema_incidencias**: el navegador solo habla con la API y la API es la única que toca la base.

```
src/        Frontend Vue 3 + Vite (landing, login, paneles por rol)
server/             Backend Node.js + Express
  app.js          Crea la aplicación Express de la API REST y monta middlewares y routers
  middleware.js   CSRF, sesión (req.user), control de roles, validación de JSON y manejo de errores
  routes/         Un router por recurso: auth, catalogos, incidencias, categorias, usuarios (y agentes)
  lib/http.js     Errores HTTP, validación de datos y traducción de errores de PostgreSQL
  lib/users.js    Usuarios, sesión firmada y límite de intentos de login
  lib/incidents.js Reglas de incidencias: permisos por rol, estados permitidos, SLA e historial
  lib/crypto.js   Contraseñas PBKDF2 y cookies de sesión firmadas (HMAC)
  db.js           Conexión a PostgreSQL (paquete pg, variables PG* del .env)
  backup.js       Respaldo cifrado de la base (pg_dump + AES-256-GCM) y retención
  respaldo.js     Comandos de consola: npm run respaldo / descifrar-respaldo
  node.js         Servidor local: API Express + frontend compilado (dist/) + respaldo automático
  crear-admin.js  Crea un administrador desde la consola
  worker.js       Cloudflare (tickops.bid): sirve el sitio y reenvía /api al túnel de la PC
iniciar-tickops.bat  Arranca todo en la PC (PostgreSQL + túnel + API); hay un acceso directo en el escritorio
```

## Puesta en marcha

Requisitos: Node 22.13+ y PostgreSQL con la base `sistema_incidencias` restaurada.

1. Crea el archivo `.env` en la raíz (no se sube a git):

   ```
   PGHOST=localhost
   PGPORT=5432
   PGUSER=postgres
   PGPASSWORD=tu-contraseña
   PGDATABASE=sistema_incidencias
   SESSION_SECRET=una-cadena-larga-y-aleatoria
   ALLOW_REGISTRATION=false
   # Respaldo automático (opcional; ver "Respaldos")
   BACKUP_DIR=C:\Users\<usuario>\OneDrive\Respaldos TickOps
   BACKUP_PASSWORD=otra-cadena-larga-y-aleatoria
   BACKUP_KEEP=14
   ```

2. Instala dependencias y crea el primer administrador:

   ```bash
   npm install
   npm run crear-admin
   ```

3. Arranca:

   ```bash
   npm run build
   npm run lan        # http://localhost:3000 (y http://<ip-del-equipo>:3000 en la red)
   ```

### Desarrollo (recarga en caliente)

Dos terminales:

```bash
npm run dev:api    # API en :3000, se reinicia sola al cambiar server/
npm run dev        # Vite en :5173, reenvía /api al :3000
```

## En línea con la PC como servidor

```
Navegador → tickops.bid (Worker) → /api → túnel Cloudflare "tickops" (origen.tickops.bid) → PC: Node :3000 → PostgreSQL
```

- El túnel sale desde la PC (no se abren puertos) y solo deja pasar rutas `/api/`; PostgreSQL no se publica.
- Configuración del túnel en `%USERPROFILE%\.cloudflared\config.yml`; la API acepta el origen de `TRUSTED_ORIGINS` (.env).
- Con la PC apagada el sitio carga, pero la API responde "El servidor de TickOps está apagado".

## Respaldos

Mientras TickOps está encendido, el servidor revisa al arrancar y cada hora: si el último respaldo tiene 24 h o más,
crea uno nuevo en `BACKUP_DIR` (`tickops-AAAA-MM-DD_HHMMSS.dump.enc`) y conserva los últimos `BACKUP_KEEP`.
El archivo es un `pg_dump` cifrado con AES-256-GCM usando `BACKUP_PASSWORD`.

- **Guarda `BACKUP_PASSWORD` fuera de la PC** (gestor de contraseñas): si el disco falla, sin esa clave los respaldos de la nube no sirven.
- `BACKUP_DIR` puede ser cualquier carpeta sincronizada (OneDrive, Google Drive para escritorio, etc.); cambiar de servicio es cambiar esa línea.

```bash
npm run respaldo                               # crear uno ahora
npm run respaldo -- listar                     # ver los guardados
npm run descifrar-respaldo -- "ruta\archivo.dump.enc"   # descifrar y ver cómo restaurar
```

Restaurar (en una base nueva, sin tocar la actual):

```bash
createdb sistema_incidencias_restaurada
pg_restore --no-owner -d sistema_incidencias_restaurada "ruta\archivo.dump"
```

Luego se revisa y, si está bien, se apunta `PGDATABASE` a la base restaurada. Borra el `.dump` descifrado al terminar.

## Roles

| Rol | Ve | Puede |
|---|---|---|
| Administrador | Todas las incidencias | Asignar cualquier agente del departamento, cambiar prioridad/categoría/estado, transferir, gestionar usuarios |
| Agente | La cola de su departamento (y lo que él mismo solicitó) | Tomar/soltar incidencias, cambiar estado, notas internas, comentario de resolución, transferir |
| Solicitante | Solo sus incidencias | Registrar, comentar, confirmar la solución (cerrar) o reabrir dentro de 3 días hábiles |

Flujo de estados: Pendiente → En Proceso → Resuelto → Cerrado (o Rechazado). Cerrado y Rechazado son de solo lectura.
Las reglas de los triggers de la base se respetan y sus mensajes llegan al usuario (p. ej. no se puede marcar Resuelto sin comentario de resolución).

## Seguridad

- Contraseñas con PBKDF2-SHA256 (100 000 iteraciones) y sal aleatoria.
- Sesión en cookie `HttpOnly` + `SameSite=Lax`, firmada con `SESSION_SECRET`, válida 12 h. Cambiar la contraseña invalida las sesiones anteriores; desactivar un usuario lo saca de inmediato.
- Todas las consultas son parametrizadas. Las peticiones que modifican datos deben venir del mismo origen (CSRF).
- 10 intentos fallidos de login por correo bloquean ese correo 15 minutos.

## API

| Método | Ruta | Roles |
|---|---|---|
| POST | /api/auth/login · /logout · /register | público (registro solo si ALLOW_REGISTRATION=true) |
| GET | /api/auth/me · /api/auth/config · /api/health | público |
| GET | /api/catalogos | todos |
| GET | /api/incidencias · /api/incidencias/:id | todos (filtrado por rol) |
| POST | /api/incidencias | todos |
| PATCH | /api/incidencias/:id | según rol: `idPrioridad`, `idCategoria`, `idAgente`, `estado`, `comentario` |
| POST | /api/incidencias/:id/comentarios | todos sobre sus incidencias (`esInterno`/`esResolucion` solo soporte) |
| POST | /api/incidencias/:id/transferencias | admin, agente del departamento |
| GET | /api/agentes | admin, agente |
| GET · POST · PATCH | /api/usuarios · /api/usuarios/:id | admin |
