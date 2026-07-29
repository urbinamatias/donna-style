BEGIN;

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  order_code TEXT NOT NULL UNIQUE,
  public_token TEXT NOT NULL UNIQUE,
  customer_name TEXT NULL,
  customer_note TEXT NULL,
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  items_count INTEGER NOT NULL CHECK (items_count >= 0),
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'confirmado', 'entregado', 'cancelado')),
  whatsapp_sent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Postgres resuelve el default BIGSERIAL/nextval() de NEW.id ANTES de que
-- corran los triggers BEFORE ROW, así que NEW.id ya está poblado acá: un
-- solo INSERT alcanza, no hace falta INSERT + UPDATE posterior.
CREATE OR REPLACE FUNCTION set_order_code() RETURNS TRIGGER AS $$
BEGIN
  NEW.order_code := 'PED-' || lpad(NEW.id::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_set_code
  BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION set_order_code();

CREATE TRIGGER trg_orders_touch_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- SET NULL (no RESTRICT): product_name_snapshot/unit_price ya preservan el
  -- historial del pedido aunque el producto/variante se borre más adelante.
  variant_id BIGINT NULL REFERENCES variants(id) ON DELETE SET NULL,
  product_name_snapshot TEXT NOT NULL,
  size TEXT NULL,
  color TEXT NULL,
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_variant_id ON order_items(variant_id);

COMMIT;
