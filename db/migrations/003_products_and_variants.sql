BEGIN;

-- Trigger compartido: sin ORM no hay auto-touch de updated_at, así que una
-- futura query de UPDATE nunca puede "olvidarse" de setearlo.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  size_guide TEXT NULL,
  base_price NUMERIC(12,2) NOT NULL CHECK (base_price >= 0),
  compare_at_price NUMERIC(12,2) NULL
    CHECK (compare_at_price IS NULL OR compare_at_price > base_price),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  free_shipping BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_products_touch_updated_at
  BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE product_categories (
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX idx_product_categories_category_id ON product_categories(category_id);

CREATE TABLE product_images (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  alt_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_product_images_product_id ON product_images(product_id);

-- Garantiza a nivel DB que a lo sumo una imagen por producto sea primaria
-- (evita que dos uploads "primary" convivan por una condición de carrera).
CREATE UNIQUE INDEX uq_product_images_one_primary
  ON product_images(product_id) WHERE is_primary;

CREATE TABLE variants (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NULL,
  size_order INTEGER NOT NULL DEFAULT 0,
  color TEXT NULL,
  color_hex TEXT NULL,
  sku TEXT NULL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  price_override NUMERIC(12,2) NULL CHECK (price_override IS NULL OR price_override >= 0),
  -- NULLS NOT DISTINCT (PG15+): sin esto, dos variantes sin talle/color
  -- (producto de variante única) podrían duplicarse sin que el UNIQUE lo note,
  -- porque Postgres por defecto trata NULL como distinto de NULL.
  UNIQUE NULLS NOT DISTINCT (product_id, size, color)
);

CREATE INDEX idx_variants_product_id ON variants(product_id);
CREATE UNIQUE INDEX uq_variants_sku ON variants(sku) WHERE sku IS NOT NULL;

COMMIT;
