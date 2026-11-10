-- Avance del audio de la traducción (0-100) para mostrarlo en la app, y cuántas
-- veces se empezó: si el proceso muere a mitad (p. ej. sin memoria) el barrido
-- lo vuelve a encolar, y sin este tope se quedaría "procesando" para siempre.
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS audio_progreso SMALLINT,
  ADD COLUMN IF NOT EXISTS audio_intentos SMALLINT NOT NULL DEFAULT 0;
