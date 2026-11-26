-- Imágenes en los comentarios: un adjunto puede pertenecer a un comentario concreto.
-- NULL = adjunto general de la incidencia (como hasta ahora). Si se borra el comentario, se borran sus registros de adjunto.
ALTER TABLE adjuntos ADD COLUMN id_comentario integer REFERENCES comentarios (id_comentario) ON DELETE CASCADE;

CREATE INDEX idx_adjuntos_comentario ON adjuntos (id_comentario) WHERE id_comentario IS NOT NULL;
