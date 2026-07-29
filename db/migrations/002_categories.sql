BEGIN;

CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id BIGINT NULL REFERENCES categories(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_categories_parent_id ON categories(parent_id);

-- Máximo 2 niveles (§0.1): un CHECK no puede mirar otras filas, así que la
-- invariante se aplica con un trigger. Cubre dos formas de romperla:
-- (a) colgar esta fila de un padre que ya tiene padre, y
-- (b) re-parentar esta fila bajo alguien cuando ella misma ya tiene hijos
--     (si no, un UPDATE de re-parentado en un nodo con hijos crea una
--     cadena de 3 niveles sin que (a) lo detecte).
CREATE OR REPLACE FUNCTION enforce_category_depth() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'categories: % no puede ser padre de sí misma', NEW.id;
  END IF;

  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM categories WHERE id = NEW.parent_id AND parent_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'categories: max 2 levels (parent % already has a parent)', NEW.parent_id;
  END IF;

  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM categories WHERE parent_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'categories: max 2 levels (% already has children, cannot become a child itself)', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_categories_max_depth
  BEFORE INSERT OR UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION enforce_category_depth();

COMMIT;
