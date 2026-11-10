-- Audio de la traducción (voz sintética alineada con los tiempos del video), generado bajo demanda.
-- El MP3 vive en S3/R2; aquí solo su estado y su clave.
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS audio_estado TEXT
    CHECK (audio_estado IN ('procesando', 'listo', 'error')),
  ADD COLUMN IF NOT EXISTS audio_key TEXT,
  ADD COLUMN IF NOT EXISTS audio_error TEXT;
