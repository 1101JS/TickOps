-- Departamentos y categorías de ejemplo (opcionales). "npm run instalar" pregunta si cargarlos.
-- Después el administrador puede editarlos, desactivarlos o crear los suyos desde el panel.

INSERT INTO departamentos (nombre, descripcion) VALUES
  ('Informática (IT)', 'Soporte técnico, hardware, software y redes'),
  ('Mantenimiento', 'Infraestructura, electricidad, climatización y fontanería'),
  ('Recursos Humanos', 'Gestiones de personal, planilla y beneficios'),
  ('Operaciones', 'Procesos operativos y logística interna');

INSERT INTO categorias (id_departamento, nombre, descripcion)
SELECT d.id_departamento, c.nombre, c.descripcion
FROM (VALUES
  ('Informática (IT)', 'Hardware', 'Fallas en computadoras, impresoras y periféricos'),
  ('Informática (IT)', 'Redes', 'Problemas de conectividad, Wi-Fi o acceso local'),
  ('Informática (IT)', 'Software', 'Instalación, licencias y errores de aplicaciones'),
  ('Mantenimiento', 'Electricidad', 'Fallas eléctricas, luminarias y tomas de corriente'),
  ('Mantenimiento', 'Fontanería', 'Fugas, tuberías y servicios sanitarios'),
  ('Recursos Humanos', 'Constancias y Permisos', 'Solicitudes administrativas de RRHH'),
  ('Operaciones', 'Logística Interna', 'Requerimientos de suministros y coordinación operativa')
) AS c(departamento, nombre, descripcion)
JOIN departamentos d ON d.nombre = c.departamento;
