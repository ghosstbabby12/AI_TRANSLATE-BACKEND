-- Datos de perfil: teléfono (opcional), foto (en S3/R2) e idioma de la interfaz.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS telefono TEXT,
  ADD COLUMN IF NOT EXISTS foto_key TEXT,
  ADD COLUMN IF NOT EXISTS idioma_interfaz TEXT NOT NULL DEFAULT 'es'
    CHECK (idioma_interfaz IN ('es', 'en')),
  ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now();
