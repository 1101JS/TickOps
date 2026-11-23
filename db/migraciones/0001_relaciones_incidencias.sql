-- Relaciones entre incidencias: una incidencia "relacionada" apunta a una "principal", ya sea porque es un
-- duplicado (se reportó lo mismo) o porque la causa el problema raíz de la principal.
-- Un solo nivel: la principal no puede ser a su vez relacionada, y una relacionada no puede tener relacionadas.
-- (La aplicación lo valida bloqueando ambas incidencias; el trigger lo garantiza también en la base.)
CREATE TABLE relaciones_incidencias (
    id_relacion integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_principal integer NOT NULL REFERENCES incidencias (id_incidencia) ON DELETE CASCADE,
    id_relacionada integer NOT NULL UNIQUE REFERENCES incidencias (id_incidencia) ON DELETE CASCADE,
    tipo varchar(20) NOT NULL CHECK (tipo IN ('duplicada', 'causa_raiz')),
    id_usuario integer NOT NULL REFERENCES usuarios (id_usuario),
    fecha_creacion timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_relacion_distinta CHECK (id_principal <> id_relacionada)
);

CREATE INDEX idx_relaciones_incidencias_principal ON relaciones_incidencias (id_principal);

CREATE FUNCTION fn_validar_relacion_incidencia() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM relaciones_incidencias WHERE id_relacionada = NEW.id_principal) THEN
        RAISE EXCEPTION 'La incidencia #% ya está relacionada con otra; no puede ser principal.', NEW.id_principal;
    END IF;
    IF EXISTS (SELECT 1 FROM relaciones_incidencias WHERE id_principal = NEW.id_relacionada) THEN
        RAISE EXCEPTION 'La incidencia #% tiene incidencias relacionadas; no puede relacionarse con otra.', NEW.id_relacionada;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_relacion_incidencia BEFORE INSERT OR UPDATE ON relaciones_incidencias
    FOR EACH ROW EXECUTE FUNCTION fn_validar_relacion_incidencia();
