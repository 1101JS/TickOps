# Migraciones de la base de datos

Cada cambio de estructura (o de datos de catálogo) después de la versión base (`db/esquema.sql` + `db/catalogos.sql`)
va aquí como un archivo SQL numerado. Así todos los servidores —el de desarrollo y los de cada cliente— terminan con
la misma base, sin importar desde qué versión de TickOps partieron.

## Reglas

1. **Nombre:** `0001_descripcion_en_minusculas.sql`, `0002_...`, en orden. Cuatro dígitos, guion bajo, minúsculas.
2. **Nunca se edita ni se borra una migración ya publicada.** Si algo quedó mal, se escribe otra que lo corrija.
   TickOps guarda una huella de cada archivo aplicado y se detiene si alguno cambió.
3. **Una migración = un cambio coherente.** Se ejecuta completa dentro de una transacción: si falla, no queda nada
   a medias.
4. **No edites `db/esquema.sql` ni `db/catalogos.sql`:** son la versión base congelada. Un catálogo nuevo (por
   ejemplo, otro estado) también va como migración (`INSERT ...`).
5. **Nombres sin esquema** (`ALTER TABLE incidencias ...`): la migración corre con `search_path = public`.

## Flujo de trabajo

```bash
# 1. Escribe db/migraciones/0001_lo_que_cambia.sql
npm run migrar                # 2. Aplícala a tu base de desarrollo
npm run comprobar-esquema     # 3. Confirma que tu base = instalación nueva (base + migraciones)
npm test                      # 4. Las pruebas instalan desde cero con todas las migraciones
```

En el servidor de un cliente, con el código nuevo ya copiado: `npm run actualizar` (respalda, instala dependencias,
migra y compila). `npm run migrar -- --estado` muestra qué está aplicado y qué falta.

## Ejemplo

```sql
-- 0001_telefono_en_usuarios.sql
ALTER TABLE usuarios ADD COLUMN telefono varchar(30);
```
