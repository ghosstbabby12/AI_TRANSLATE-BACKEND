-- Video con los subtítulos incrustados ("quemados"), generado bajo demanda.
-- El archivo vive en S3/R2; aquí solo su estado y su clave.
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS export_estado TEXT
    CHECK (export_estado IN ('procesando', 'listo', 'error')),
  ADD COLUMN IF NOT EXISTS export_key TEXT,
  ADD COLUMN IF NOT EXISTS export_error TEXT;
