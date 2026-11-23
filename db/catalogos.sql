-- Catálogos obligatorios de TickOps. Los instala "npm run instalar" después de db/esquema.sql.
-- El código busca roles y estados por su NOMBRE: no cambies los nombres sin cambiar también el servidor.
-- Los identificadores los asigna la base (columnas GENERATED ALWAYS AS IDENTITY) en el orden de inserción.

INSERT INTO roles (nombre, descripcion) VALUES
  ('Administrador', 'Control global de departamentos, categorías, usuarios y configuraciones'),
  ('Agente', 'Gestor departamental que atiende y resuelve tickets de su departamento'),
  ('Solicitante', 'Empleado que registra incidencias y consulta el estado de sus solicitudes');

INSERT INTO estados_incidencia (nombre, descripcion, es_estado_final) VALUES
  ('Pendiente', 'Incidencia registrada en espera de asignación o atención', FALSE),
  ('En Proceso', 'Incidencia asignada y en atención por un agente', FALSE),
  ('Resuelto', 'Solución aplicada; en ventana de 3 días hábiles para reapertura', FALSE),
  ('Cerrado', 'Incidencia finalizada en modo de solo lectura', TRUE),
  ('Rechazado', 'Solicitud descartada o fuera del ámbito del departamento', TRUE);

-- SLA en horas: primera respuesta y resolución.
INSERT INTO prioridades (nombre, sla_primera_respuesta_horas, sla_resolucion_horas) VALUES
  ('Baja', 24, 72),
  ('Media', 8, 48),
  ('Alta', 4, 24),
  ('Crítica', 2, 8);
