BEGIN;

-- Fase "Páginas informativas" (spec informational-pages, design.md D1/D2):
-- páginas de contenido gestionadas por la dueña (envíos, cambios, etc.).
-- `slug` se deriva UNA sola vez en el alta y queda congelado (mismo criterio
-- que `categories.slug`, CLAUDE.md — renombrar nunca rompe un link
-- compartido). `is_active` arranca en `false` (decisión confirmada: página
-- nueva nace deshabilitada para revisión). `sort_order` maneja el único
-- orden compartido por menú y footer (D8, mismo patrón que
-- carousel_slides/product_images).
CREATE TABLE pages (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description_html TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE INDEX idx_pages_sort_order ON pages(sort_order);

COMMIT;
