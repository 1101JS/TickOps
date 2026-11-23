# TickOps

Plataforma de gestión de incidencias de soporte técnico (landing comercial + portal de incidencias).
El backend trabaja sobre la base PostgreSQL **sistema_incidencias**: el navegador solo habla con la API y la API es la única que toca la base.

```
src/        Frontend Vue 3 + Vite (landing, login, paneles por rol)
server/             Backend Node.js + Express
  app.js          Crea la aplicación Express de la API REST y monta middlewares y routers
  middleware.js   CSRF, sesión (req.user), control de roles, validación de JSON y manejo de errores
  routes/         Un router por recurso: auth, catalogos, incidencias (+ adjuntos), categorias, departamentos, usuarios (y agentes)
  lib/http.js     Errores HTTP, validación de datos y traducción de errores de PostgreSQL
  lib/users.js    Usuarios, sesión firmada y límite de intentos de login
  lib/incidents.js Reglas de incidencias: permisos por rol, estados permitidos, SLA e historial
  lib/attachments.js Adjuntos: tipos permitidos, validación del contenido y almacenamiento en disco
  lib/crypto.js   Contraseñas PBKDF2 y cookies de sesión firmadas (HMAC)
  db.js           Conexión a PostgreSQL (paquete pg, variables PG* del .env)
  backup.js       Respaldo cifrado de la base (pg_dump + AES-256-GCM) y retención
  respaldo.js     Comandos de consola: npm run respaldo / descifrar-respaldo
  node.js         Servidor local: API Express + frontend compilado (dist/) + respaldo automático
  crear-admin.js  Crea un administrador desde la consola
  instalar.js     Instalación en un servidor nuevo: .env, base de datos y primer administrador
  migrar.js       Aplica las migraciones pendientes (npm run migrar)
  actualizar.js   Actualiza un servidor: respaldo + dependencias + migraciones + compilación
  comprobar-esquema.js  Compara la base de desarrollo con una instalación nueva
  lib/install.js  Crea la base y carga los archivos de db/ (lo usan instalar.js y las pruebas)
  lib/migrations.js  Motor de migraciones (db/migraciones, tabla esquema_migraciones)
  worker.js       Cloudflare (tickops.bid): sirve el sitio y reenvía /api al túnel de la PC
db/                 esquema.sql + catalogos.sql (versión base, congelada), migraciones/ (cambios posteriores),
                    plantilla.sql (departamentos y categorías de ejemplo)
test/               Pruebas automáticas (npm test)
iniciar-tickops.bat  Arranca todo en la PC (PostgreSQL + túnel + API); hay un acceso directo en el escritorio
```

## Puesta en marcha

### Instalación en un servidor nuevo (cliente)

Requisitos: Node 22.13+ y PostgreSQL 13 o superior (con un usuario que pueda crear bases de datos).

```bash
npm install
npm run instalar
npm run build
npm run lan        # http://localhost:3000 (y http://<ip-del-equipo>:3000 en la red)
```

`npm run instalar`:

1. Si no hay `.env`, pide los datos de PostgreSQL y lo crea con `SESSION_SECRET` y `BACKUP_PASSWORD` generados al azar
   (la clave de respaldo se muestra una vez: guárdala fuera del equipo).
2. Crea la base (`PGDATABASE`), carga `db/esquema.sql` + `db/catalogos.sql` en una sola transacción y aplica todas
   las migraciones de `db/migraciones/`. Pregunta si cargar `db/plantilla.sql` (4 departamentos y 7 categorías de
   ejemplo); sin ella, el admin crea los suyos.
3. Crea el primer administrador.

**Nunca instala sobre una base que ya tenga tablas**, así que no puede borrar ni mezclar información existente.
Opciones: `npm run instalar -- --con-plantilla | --sin-plantilla | --sin-admin`.

Si se pierde la contraseña del administrador: `npm run crear-admin` crea otro desde la consola del servidor.

### Migraciones y actualizaciones

`db/esquema.sql` y `db/catalogos.sql` son la **versión base congelada**: no se editan. Todo cambio posterior de la
base va como archivo numerado en `db/migraciones/` (reglas en `db/migraciones/LEEME.md`). La tabla
`esquema_migraciones` registra cuáles se aplicaron, con una huella de cada archivo.

```bash
npm run migrar                 # aplica las migraciones pendientes a PGDATABASE
npm run migrar -- --estado     # muestra aplicadas y pendientes (no cambia nada)
npm run comprobar-esquema      # ¿tu base = instalación nueva (base + migraciones)? Detecta cambios hechos a mano
```

**Actualizar el servidor de un cliente** (con el código nuevo ya copiado):

```bash
npm run actualizar             # respaldo cifrado → npm install → migraciones → npm run build
```

Después hay que reiniciar TickOps. Si no hay respaldo configurado, pregunta antes de seguir
(`--sin-respaldo` para no preguntar; también `--sin-dependencias` y `--sin-compilar`).

Garantías: cada migración corre en su propia transacción (si falla, la base queda como antes de ella y no se aplican
las siguientes); dos procesos no pueden migrar a la vez; se detiene si una migración ya aplicada fue editada o si la
base es de una versión más nueva que el código. Al arrancar, el servidor avisa si hay migraciones pendientes.

### Variables de `.env`

```
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=tu-contraseña
PGDATABASE=sistema_incidencias
PORT=3000
SESSION_SECRET=una-cadena-larga-y-aleatoria
ALLOW_REGISTRATION=false
# Respaldo automático (opcional; ver "Respaldos")
BACKUP_DIR=C:\Users\<usuario>\Respaldos TickOps
BACKUP_PASSWORD=otra-cadena-larga-y-aleatoria
BACKUP_KEEP=14
BACKUP_REMOTE=tickops:Respaldos TickOps   # copia en la nube con rclone (opcional)
# Carpeta de adjuntos (opcional; por defecto ./adjuntos, fuera de git)
ATTACHMENTS_DIR=
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

## Pruebas

```bash
npm test
```

Usa el ejecutor de pruebas integrado de Node (`node:test`), sin dependencias extra. Necesita PostgreSQL y el `.env`.

- `test/lib.test.js`: lógica sin base de datos (validaciones, permisos por rol, flujo de estados, SLA, cifrado).
- `test/api.test.js`: la API completa con Express (sesión, roles, usuarios, categorías, ciclo de vida de una
  incidencia, comentarios internos, transferencias, protecciones CSRF/JSON).
- `test/backup.test.js`: respaldo cifrado, clave incorrecta y retención.
- `test/attachments.test.js`: adjuntos (subir, descargar, permisos, tipos y tamaños, respaldo de archivos).
- `test/vista.test.js`: cambio de vista del administrador (como agente o solicitante).
- `test/departamentos.test.js`: administración de departamentos y sus reglas.
- `test/instalar.test.js`: instalación desde `db/` (base nueva, plantilla opcional, `.env` generado, protección de
  bases existentes y el comando `npm run instalar` completo).
- `test/migraciones.test.js`: orden, registro, reversión de una migración que falla, archivos editados, base más
  nueva que el código y `npm run actualizar`.

Cada archivo crea una base temporal **con el mismo instalador que usan los clientes** (archivos de `db/`), sin leer
la base real, y la borra al terminar. Así cada `npm test` comprueba también que `db/` instala un sistema que funciona.

## Respaldos

Mientras TickOps está encendido, el servidor revisa al arrancar y cada hora: si el último respaldo tiene 24 h o más,
crea uno nuevo en `BACKUP_DIR` (`tickops-AAAA-MM-DD_HHMMSS.dump.enc`) y conserva los últimos `BACKUP_KEEP`.
El archivo es un `pg_dump` cifrado con AES-256-GCM usando `BACKUP_PASSWORD`.
Los adjuntos (que no están dentro de la base) se copian cifrados a `BACKUP_DIR\adjuntos`, solo los nuevos;
para recuperarlos: `npm run respaldo -- restaurar-adjuntos`.

- **Guarda `BACKUP_PASSWORD` fuera de la PC** (gestor de contraseñas): si el disco falla, sin esa clave los respaldos de la nube no sirven.
- **Copia en la nube (rclone):** si `BACKUP_REMOTE` está configurado, después de cada respaldo (y al arrancar) se suben
  los archivos nuevos, ya cifrados, a ese destino; allí se conservan los mismos últimos `BACKUP_KEEP` respaldos de la base.
  Si falla la conexión, se reintenta cada hora. Hoy el destino es una cuenta de OneDrive del proyecto (remoto `tickops`),
  independiente del OneDrive personal de la PC. Para conectar la cuenta: `rclone config` (o `rclone authorize "onedrive"`).
- `npm run respaldo -- subir` sube manualmente lo que falte.

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

## Adjuntos y reportes

- **Adjuntos:** en la ficha de cada incidencia (y al registrarla) se pueden subir capturas, PDF, texto, Word, Excel,
  PowerPoint o ZIP; hasta 5 por envío, 5 MB cada uno y 20 por incidencia. Se valida la extensión y la firma del
  archivo; no se aceptan HTML, SVG ni ejecutables. Descarga: quien ve la incidencia. Eliminar: quien lo subió o el admin.
  Una incidencia cerrada o rechazada no admite cambios en sus adjuntos.
- **Reportes:** en el panel del administrador, "Exportar Excel" y "Exportar PDF" generan el listado con los filtros
  aplicados (Excel `.xlsx` real y PDF con resumen por estado). Se generan en el navegador.

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
