CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS videos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id       TEXT        NOT NULL,
  nombre           TEXT        NOT NULL,
  origen_tipo      TEXT        NOT NULL CHECK (origen_tipo IN ('archivo', 'url')),
  origen_url       TEXT,
  -- Clave del video original en S3 (nunca se guarda el binario en la BD)
  storage_key      TEXT,
  idioma_destino   TEXT        NOT NULL,
  idioma_origen    TEXT,
  estado           TEXT        NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'procesando', 'completo', 'error')),
  total_segmentos  INTEGER,
  duracion_seg     NUMERIC(10, 3),
  error            TEXT,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_videos_usuario ON videos (usuario_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS segmentos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id         UUID        NOT NULL REFERENCES videos (id) ON DELETE CASCADE,
  indice           INTEGER     NOT NULL,
  tiempo_inicio    NUMERIC(10, 3) NOT NULL,
  tiempo_fin       NUMERIC(10, 3) NOT NULL,
  -- Trozo de audio en S3, para que cualquier worker pueda reintentarlo
  audio_key        TEXT        NOT NULL,
  texto_original   TEXT,
  texto_traducido  TEXT,
  estado           TEXT        NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'procesando', 'listo', 'error')),
  intentos         INTEGER     NOT NULL DEFAULT 0,
  ultimo_error     TEXT,
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (video_id, indice)
);

CREATE INDEX IF NOT EXISTS idx_segmentos_video_estado ON segmentos (video_id, estado);
