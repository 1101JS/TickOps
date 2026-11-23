-- Esquema BASE de la base de datos de TickOps: tablas, funciones, triggers e índices, sin datos.
-- Congelado: NO se edita. Los cambios de estructura van en db/migraciones/ (ver README, "Migraciones").
-- Lo instala "npm run instalar", que después aplica todas las migraciones.

--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: fn_aplicar_transferencia_departamento(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_aplicar_transferencia_departamento() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_id_pendiente INT;
BEGIN
    SELECT id_estado INTO v_id_pendiente FROM estados_incidencia WHERE nombre = 'Pendiente';

    UPDATE incidencias
    SET id_estado = v_id_pendiente,
        id_agente = NULL,
        fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id_incidencia = NEW.id_incidencia;

    RETURN NEW;
END;
$$;

--
-- Name: fn_evitar_eliminar_agente_ocupado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_evitar_eliminar_agente_ocupado() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_en_proceso INT;
BEGIN
    SELECT COUNT(*) INTO v_en_proceso
    FROM incidencias i
    JOIN estados_incidencia e ON i.id_estado = e.id_estado
    WHERE i.id_agente = OLD.id_usuario AND e.nombre = 'En Proceso';

    IF v_en_proceso > 0 THEN
        RAISE EXCEPTION 'No se puede eliminar al usuario #% porque tiene % incidencia(s) En Proceso. Reasígnelas primero.', OLD.id_usuario, v_en_proceso;
    END IF;

    RETURN OLD;
END;
$$;

--
-- Name: fn_registrar_historial_incidencia(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_registrar_historial_incidencia() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (OLD.id_estado IS DISTINCT FROM NEW.id_estado) OR (OLD.id_agente IS DISTINCT FROM NEW.id_agente) THEN
        INSERT INTO historial_incidencias (
            id_incidencia,
            id_usuario_responsable,
            id_estado_anterior,
            id_estado_nuevo,
            id_agente_anterior,
            id_agente_nuevo,
            detalle
        ) VALUES (
            NEW.id_incidencia,
            COALESCE(NEW.id_agente, OLD.id_agente),
            OLD.id_estado,
            NEW.id_estado,
            OLD.id_agente,
            NEW.id_agente,
            'Cambio registrado automáticamente por actualización del ticket'
        );
    END IF;
    RETURN NEW;
END;
$$;

--
-- Name: fn_validar_cambio_incidencia(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validar_cambio_incidencia() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_estado_anterior VARCHAR(30);
    v_estado_nuevo VARCHAR(30);
    v_tiene_resolucion BOOLEAN;
BEGIN
    SELECT nombre INTO v_estado_anterior FROM estados_incidencia WHERE id_estado = OLD.id_estado;
    SELECT nombre INTO v_estado_nuevo FROM estados_incidencia WHERE id_estado = NEW.id_estado;

    -- Regla 9: Un ticket cerrado es de solo lectura
    IF v_estado_anterior = 'Cerrado' THEN
        RAISE EXCEPTION 'No se puede modificar la incidencia #% porque ya se encuentra en estado Cerrado.', OLD.id_incidencia;
    END IF;

    -- Regla 5: Exigir comentario de resolución antes de pasar a 'Resuelto'
    IF v_estado_nuevo = 'Resuelto' AND v_estado_anterior <> 'Resuelto' THEN
        SELECT EXISTS (
            SELECT 1 FROM comentarios
            WHERE id_incidencia = OLD.id_incidencia AND es_resolucion = TRUE
        ) INTO v_tiene_resolucion;

        IF NOT v_tiene_resolucion THEN
            RAISE EXCEPTION 'Regla de negocio: Debe registrar un comentario de resolución antes de marcar la incidencia #% como Resuelto.', OLD.id_incidencia;
        END IF;

        NEW.fecha_resolucion := CURRENT_TIMESTAMP;
    END IF;

    -- Registrar fecha de cierre automáticamente
    IF v_estado_nuevo = 'Cerrado' AND v_estado_anterior <> 'Cerrado' THEN
        NEW.fecha_cierre := CURRENT_TIMESTAMP;
    END IF;

    NEW.fecha_actualizacion := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: adjuntos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adjuntos (
    id_adjunto integer NOT NULL,
    id_incidencia integer NOT NULL,
    id_usuario integer NOT NULL,
    nombre_archivo character varying(255) NOT NULL,
    ruta_almacenamiento text NOT NULL,
    tipo_mime character varying(100) NOT NULL,
    tamano_bytes integer NOT NULL,
    fecha_subida timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT adjuntos_tamano_bytes_check CHECK (((tamano_bytes > 0) AND (tamano_bytes <= 5242880)))
);

--
-- Name: adjuntos_id_adjunto_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.adjuntos ALTER COLUMN id_adjunto ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.adjuntos_id_adjunto_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: articulos_faq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articulos_faq (
    id_articulo integer NOT NULL,
    id_categoria integer NOT NULL,
    id_autor integer NOT NULL,
    titulo character varying(150) NOT NULL,
    contenido text NOT NULL,
    publicado boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: articulos_faq_id_articulo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.articulos_faq ALTER COLUMN id_articulo ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.articulos_faq_id_articulo_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias (
    id_categoria integer NOT NULL,
    id_departamento integer NOT NULL,
    nombre character varying(80) NOT NULL,
    descripcion character varying(200),
    activa boolean DEFAULT true NOT NULL
);

--
-- Name: categorias_id_categoria_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.categorias ALTER COLUMN id_categoria ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.categorias_id_categoria_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: comentarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comentarios (
    id_comentario integer NOT NULL,
    id_incidencia integer NOT NULL,
    id_usuario integer NOT NULL,
    contenido text NOT NULL,
    es_interno boolean DEFAULT false NOT NULL,
    es_resolucion boolean DEFAULT false NOT NULL,
    fecha_creacion timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT comentarios_contenido_check CHECK ((length(TRIM(BOTH FROM contenido)) > 0))
);

--
-- Name: comentarios_id_comentario_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.comentarios ALTER COLUMN id_comentario ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.comentarios_id_comentario_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: departamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departamentos (
    id_departamento integer NOT NULL,
    nombre character varying(80) NOT NULL,
    descripcion character varying(200),
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: departamentos_id_departamento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.departamentos ALTER COLUMN id_departamento ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.departamentos_id_departamento_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: estados_incidencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estados_incidencia (
    id_estado integer NOT NULL,
    nombre character varying(30) NOT NULL,
    descripcion character varying(150),
    es_estado_final boolean DEFAULT false NOT NULL
);

--
-- Name: estados_incidencia_id_estado_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.estados_incidencia ALTER COLUMN id_estado ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.estados_incidencia_id_estado_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: historial_incidencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historial_incidencias (
    id_historial integer NOT NULL,
    id_incidencia integer NOT NULL,
    id_usuario_responsable integer,
    id_estado_anterior integer,
    id_estado_nuevo integer NOT NULL,
    id_agente_anterior integer,
    id_agente_nuevo integer,
    detalle text,
    fecha_evento timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: historial_incidencias_id_historial_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.historial_incidencias ALTER COLUMN id_historial ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.historial_incidencias_id_historial_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: incidencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incidencias (
    id_incidencia integer NOT NULL,
    titulo character varying(150) NOT NULL,
    descripcion text NOT NULL,
    id_categoria integer NOT NULL,
    id_prioridad integer NOT NULL,
    id_estado integer NOT NULL,
    id_solicitante integer NOT NULL,
    id_agente integer,
    fecha_creacion timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_primera_respuesta timestamp with time zone,
    fecha_resolucion timestamp with time zone,
    fecha_cierre timestamp with time zone
);

--
-- Name: incidencias_id_incidencia_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.incidencias ALTER COLUMN id_incidencia ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.incidencias_id_incidencia_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: prioridades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prioridades (
    id_prioridad integer NOT NULL,
    nombre character varying(30) NOT NULL,
    sla_primera_respuesta_horas integer NOT NULL,
    sla_resolucion_horas integer NOT NULL,
    CONSTRAINT prioridades_sla_primera_respuesta_horas_check CHECK ((sla_primera_respuesta_horas > 0)),
    CONSTRAINT prioridades_sla_resolucion_horas_check CHECK ((sla_resolucion_horas > 0))
);

--
-- Name: prioridades_id_prioridad_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.prioridades ALTER COLUMN id_prioridad ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.prioridades_id_prioridad_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id_rol integer NOT NULL,
    nombre character varying(50) NOT NULL,
    descripcion character varying(150) NOT NULL
);

--
-- Name: roles_id_rol_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.roles ALTER COLUMN id_rol ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.roles_id_rol_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: tokens_restablecimiento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tokens_restablecimiento (
    id_token integer NOT NULL,
    id_usuario integer NOT NULL,
    token_hash character varying(255) NOT NULL,
    fecha_expiracion timestamp with time zone NOT NULL,
    usado boolean DEFAULT false NOT NULL,
    fecha_creacion timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: tokens_restablecimiento_id_token_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tokens_restablecimiento ALTER COLUMN id_token ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tokens_restablecimiento_id_token_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: transferencias_departamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transferencias_departamento (
    id_transferencia integer NOT NULL,
    id_incidencia integer NOT NULL,
    id_departamento_origen integer NOT NULL,
    id_departamento_destino integer NOT NULL,
    id_usuario_transfiere integer NOT NULL,
    motivo text NOT NULL,
    fecha_transferencia timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_departamentos_distintos CHECK ((id_departamento_origen <> id_departamento_destino)),
    CONSTRAINT transferencias_departamento_motivo_check CHECK ((length(TRIM(BOTH FROM motivo)) > 0))
);

--
-- Name: transferencias_departamento_id_transferencia_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.transferencias_departamento ALTER COLUMN id_transferencia ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.transferencias_departamento_id_transferencia_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id_usuario integer NOT NULL,
    nombre character varying(100) NOT NULL,
    correo character varying(120) NOT NULL,
    password_hash character varying(255) NOT NULL,
    id_rol integer NOT NULL,
    id_departamento integer,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: usuarios_id_usuario_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ALTER COLUMN id_usuario ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.usuarios_id_usuario_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: adjuntos adjuntos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjuntos
    ADD CONSTRAINT adjuntos_pkey PRIMARY KEY (id_adjunto);

--
-- Name: articulos_faq articulos_faq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articulos_faq
    ADD CONSTRAINT articulos_faq_pkey PRIMARY KEY (id_articulo);

--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id_categoria);

--
-- Name: comentarios comentarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios
    ADD CONSTRAINT comentarios_pkey PRIMARY KEY (id_comentario);

--
-- Name: departamentos departamentos_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos
    ADD CONSTRAINT departamentos_nombre_key UNIQUE (nombre);

--
-- Name: departamentos departamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos
    ADD CONSTRAINT departamentos_pkey PRIMARY KEY (id_departamento);

--
-- Name: estados_incidencia estados_incidencia_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estados_incidencia
    ADD CONSTRAINT estados_incidencia_nombre_key UNIQUE (nombre);

--
-- Name: estados_incidencia estados_incidencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estados_incidencia
    ADD CONSTRAINT estados_incidencia_pkey PRIMARY KEY (id_estado);

--
-- Name: historial_incidencias historial_incidencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_incidencias
    ADD CONSTRAINT historial_incidencias_pkey PRIMARY KEY (id_historial);

--
-- Name: incidencias incidencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidencias
    ADD CONSTRAINT incidencias_pkey PRIMARY KEY (id_incidencia);

--
-- Name: prioridades prioridades_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prioridades
    ADD CONSTRAINT prioridades_nombre_key UNIQUE (nombre);

--
-- Name: prioridades prioridades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prioridades
    ADD CONSTRAINT prioridades_pkey PRIMARY KEY (id_prioridad);

--
-- Name: roles roles_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_nombre_key UNIQUE (nombre);

--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id_rol);

--
-- Name: tokens_restablecimiento tokens_restablecimiento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens_restablecimiento
    ADD CONSTRAINT tokens_restablecimiento_pkey PRIMARY KEY (id_token);

--
-- Name: tokens_restablecimiento tokens_restablecimiento_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens_restablecimiento
    ADD CONSTRAINT tokens_restablecimiento_token_hash_key UNIQUE (token_hash);

--
-- Name: transferencias_departamento transferencias_departamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_departamento
    ADD CONSTRAINT transferencias_departamento_pkey PRIMARY KEY (id_transferencia);

--
-- Name: categorias uq_categoria_departamento; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT uq_categoria_departamento UNIQUE (id_departamento, nombre);

--
-- Name: usuarios usuarios_correo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_correo_key UNIQUE (correo);

--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id_usuario);

--
-- Name: idx_categorias_departamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categorias_departamento ON public.categorias USING btree (id_departamento);

--
-- Name: idx_comentarios_incidencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comentarios_incidencia ON public.comentarios USING btree (id_incidencia);

--
-- Name: idx_historial_incidencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historial_incidencia ON public.historial_incidencias USING btree (id_incidencia);

--
-- Name: idx_incidencias_agente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidencias_agente ON public.incidencias USING btree (id_agente);

--
-- Name: idx_incidencias_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidencias_categoria ON public.incidencias USING btree (id_categoria);

--
-- Name: idx_incidencias_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidencias_estado ON public.incidencias USING btree (id_estado);

--
-- Name: idx_incidencias_prioridad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidencias_prioridad ON public.incidencias USING btree (id_prioridad);

--
-- Name: idx_incidencias_solicitante; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidencias_solicitante ON public.incidencias USING btree (id_solicitante);

--
-- Name: idx_usuarios_departamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_departamento ON public.usuarios USING btree (id_departamento);

--
-- Name: transferencias_departamento trg_aplicar_transferencia_departamento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_aplicar_transferencia_departamento AFTER INSERT ON public.transferencias_departamento FOR EACH ROW EXECUTE FUNCTION public.fn_aplicar_transferencia_departamento();

--
-- Name: usuarios trg_evitar_eliminar_agente_ocupado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_evitar_eliminar_agente_ocupado BEFORE DELETE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.fn_evitar_eliminar_agente_ocupado();

--
-- Name: incidencias trg_registrar_historial_incidencia; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_registrar_historial_incidencia AFTER UPDATE ON public.incidencias FOR EACH ROW EXECUTE FUNCTION public.fn_registrar_historial_incidencia();

--
-- Name: incidencias trg_validar_cambio_incidencia; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validar_cambio_incidencia BEFORE UPDATE ON public.incidencias FOR EACH ROW EXECUTE FUNCTION public.fn_validar_cambio_incidencia();

--
-- Name: adjuntos adjuntos_id_incidencia_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjuntos
    ADD CONSTRAINT adjuntos_id_incidencia_fkey FOREIGN KEY (id_incidencia) REFERENCES public.incidencias(id_incidencia) ON DELETE CASCADE;

--
-- Name: adjuntos adjuntos_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjuntos
    ADD CONSTRAINT adjuntos_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario) ON DELETE RESTRICT;

--
-- Name: articulos_faq articulos_faq_id_autor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articulos_faq
    ADD CONSTRAINT articulos_faq_id_autor_fkey FOREIGN KEY (id_autor) REFERENCES public.usuarios(id_usuario) ON DELETE RESTRICT;

--
-- Name: articulos_faq articulos_faq_id_categoria_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articulos_faq
    ADD CONSTRAINT articulos_faq_id_categoria_fkey FOREIGN KEY (id_categoria) REFERENCES public.categorias(id_categoria) ON DELETE RESTRICT;

--
-- Name: categorias categorias_id_departamento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_id_departamento_fkey FOREIGN KEY (id_departamento) REFERENCES public.departamentos(id_departamento) ON DELETE RESTRICT;

--
-- Name: comentarios comentarios_id_incidencia_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios
    ADD CONSTRAINT comentarios_id_incidencia_fkey FOREIGN KEY (id_incidencia) REFERENCES public.incidencias(id_incidencia) ON DELETE CASCADE;

--
-- Name: comentarios comentarios_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios
    ADD CONSTRAINT comentarios_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario) ON DELETE RESTRICT;

--
-- Name: historial_incidencias historial_incidencias_id_agente_anterior_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_incidencias
    ADD CONSTRAINT historial_incidencias_id_agente_anterior_fkey FOREIGN KEY (id_agente_anterior) REFERENCES public.usuarios(id_usuario) ON DELETE RESTRICT;

--
-- Name: historial_incidencias historial_incidencias_id_agente_nuevo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_incidencias
    ADD CONSTRAINT historial_incidencias_id_agente_nuevo_fkey FOREIGN KEY (id_agente_nuevo) REFERENCES public.usuarios(id_usuario) ON DELETE RESTRICT;

--
-- Name: historial_incidencias historial_incidencias_id_estado_anterior_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_incidencias
    ADD CONSTRAINT historial_incidencias_id_estado_anterior_fkey FOREIGN KEY (id_estado_anterior) REFERENCES public.estados_incidencia(id_estado) ON DELETE RESTRICT;

--
-- Name: historial_incidencias historial_incidencias_id_estado_nuevo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_incidencias
    ADD CONSTRAINT historial_incidencias_id_estado_nuevo_fkey FOREIGN KEY (id_estado_nuevo) REFERENCES public.estados_incidencia(id_estado) ON DELETE RESTRICT;

--
-- Name: historial_incidencias historial_incidencias_id_incidencia_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_incidencias
    ADD CONSTRAINT historial_incidencias_id_incidencia_fkey FOREIGN KEY (id_incidencia) REFERENCES public.incidencias(id_incidencia) ON DELETE CASCADE;

--
-- Name: historial_incidencias historial_incidencias_id_usuario_responsable_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_incidencias
    ADD CONSTRAINT historial_incidencias_id_usuario_responsable_fkey FOREIGN KEY (id_usuario_responsable) REFERENCES public.usuarios(id_usuario) ON DELETE RESTRICT;

--
-- Name: incidencias incidencias_id_agente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidencias
    ADD CONSTRAINT incidencias_id_agente_fkey FOREIGN KEY (id_agente) REFERENCES public.usuarios(id_usuario) ON DELETE RESTRICT;

--
-- Name: incidencias incidencias_id_categoria_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidencias
    ADD CONSTRAINT incidencias_id_categoria_fkey FOREIGN KEY (id_categoria) REFERENCES public.categorias(id_categoria) ON DELETE RESTRICT;

--
-- Name: incidencias incidencias_id_estado_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidencias
    ADD CONSTRAINT incidencias_id_estado_fkey FOREIGN KEY (id_estado) REFERENCES public.estados_incidencia(id_estado) ON DELETE RESTRICT;

--
-- Name: incidencias incidencias_id_prioridad_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidencias
    ADD CONSTRAINT incidencias_id_prioridad_fkey FOREIGN KEY (id_prioridad) REFERENCES public.prioridades(id_prioridad) ON DELETE RESTRICT;

--
-- Name: incidencias incidencias_id_solicitante_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidencias
    ADD CONSTRAINT incidencias_id_solicitante_fkey FOREIGN KEY (id_solicitante) REFERENCES public.usuarios(id_usuario) ON DELETE RESTRICT;

--
-- Name: tokens_restablecimiento tokens_restablecimiento_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens_restablecimiento
    ADD CONSTRAINT tokens_restablecimiento_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE;

--
-- Name: transferencias_departamento transferencias_departamento_id_departamento_destino_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_departamento
    ADD CONSTRAINT transferencias_departamento_id_departamento_destino_fkey FOREIGN KEY (id_departamento_destino) REFERENCES public.departamentos(id_departamento) ON DELETE RESTRICT;

--
-- Name: transferencias_departamento transferencias_departamento_id_departamento_origen_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_departamento
    ADD CONSTRAINT transferencias_departamento_id_departamento_origen_fkey FOREIGN KEY (id_departamento_origen) REFERENCES public.departamentos(id_departamento) ON DELETE RESTRICT;

--
-- Name: transferencias_departamento transferencias_departamento_id_incidencia_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_departamento
    ADD CONSTRAINT transferencias_departamento_id_incidencia_fkey FOREIGN KEY (id_incidencia) REFERENCES public.incidencias(id_incidencia) ON DELETE CASCADE;

--
-- Name: transferencias_departamento transferencias_departamento_id_usuario_transfiere_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencias_departamento
    ADD CONSTRAINT transferencias_departamento_id_usuario_transfiere_fkey FOREIGN KEY (id_usuario_transfiere) REFERENCES public.usuarios(id_usuario) ON DELETE RESTRICT;

--
-- Name: usuarios usuarios_id_departamento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_id_departamento_fkey FOREIGN KEY (id_departamento) REFERENCES public.departamentos(id_departamento) ON DELETE RESTRICT;

--
-- Name: usuarios usuarios_id_rol_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_id_rol_fkey FOREIGN KEY (id_rol) REFERENCES public.roles(id_rol) ON DELETE RESTRICT;

--
-- PostgreSQL database dump complete
--
