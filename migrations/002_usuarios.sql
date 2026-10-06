CREATE TABLE IF NOT EXISTS usuarios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         TEXT        NOT NULL,
  -- Se guarda siempre en minúsculas (lo normaliza la API)
  email          TEXT        NOT NULL UNIQUE,
  password_hash  TEXT        NOT NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- videos.usuario_id sigue siendo TEXT (sin FK) porque los videos creados antes
-- del login pertenecen a ids anónimos del navegador; al iniciar sesión se
-- transfieren a la cuenta (ver reclamarVideosAnonimos).
