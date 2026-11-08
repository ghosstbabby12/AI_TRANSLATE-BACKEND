-- Fotograma del video para la vista previa (vive en S3/R2, junto al original).
-- Las traducciones del mismo archivo comparten la misma miniatura.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS miniatura_key TEXT;
