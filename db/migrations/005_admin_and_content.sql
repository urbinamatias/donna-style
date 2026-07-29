BEGIN;

CREATE TABLE admin_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE carousel_slides (
  id BIGSERIAL PRIMARY KEY,
  image_desktop TEXT NOT NULL,
  image_mobile TEXT NULL,
  alt_text TEXT NOT NULL,
  link_url TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

COMMIT;
