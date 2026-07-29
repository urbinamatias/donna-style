BEGIN;

-- Tabla de sesiones para connect-pg-simple (Fase 4 — Carrito). Creada acá,
-- por migración numerada, en vez de por el auto-create de la librería
-- (`createTableIfMissing`), para que quede trackeada en `schema_migrations`
-- como cualquier otra tabla del esquema (design.md D1). `expire` es
-- TIMESTAMPTZ, no el `timestamp` sin zona horaria que trae el ejemplo de la
-- librería: las queries internas de connect-pg-simple usan `to_timestamp()`,
-- que devuelve timestamptz, así que una columna naive compararía corrido
-- por el TZ del servidor.
CREATE TABLE session (
  sid TEXT PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_session_expire ON session (expire);

COMMIT;
