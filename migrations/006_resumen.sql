-- Resumen de la transcripción generado con IA, bajo demanda (en el idioma de la traducción).
-- resumen_texto usa un formato sencillo: "## Título" para secciones y "- " para viñetas.
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS resumen_estado TEXT
    CHECK (resumen_estado IN ('procesando', 'listo', 'error')),
  ADD COLUMN IF NOT EXISTS resumen_texto TEXT,
  ADD COLUMN IF NOT EXISTS resumen_error TEXT,
  ADD COLUMN IF NOT EXISTS resumen_en TIMESTAMPTZ;
