// Acceso a datos de `variants`. SQL crudo parametrizado, sin ORM.
const db = require('../db/pool');

// variants: [{ size, sizeOrder, color, colorHex, sku, stock, priceOverride }]
async function bulkCreate(productId, variants) {
  if (!variants || variants.length === 0) return [];
  const values = [];
  const placeholders = variants
    .map((v, i) => {
      const base = i * 8;
      values.push(
        productId,
        v.size ?? null,
        v.sizeOrder ?? 0,
        v.color ?? null,
        v.colorHex ?? null,
        v.sku ?? null,
        v.stock ?? 0,
        v.priceOverride ?? null
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    })
    .join(', ');
  const { rows } = await db.query(
    `INSERT INTO variants
       (product_id, size, size_order, color, color_hex, sku, stock, price_override)
     VALUES ${placeholders}
     RETURNING *`,
    values
  );
  return rows;
}

async function findByProductId(productId) {
  const { rows } = await db.query(
    'SELECT * FROM variants WHERE product_id = $1 ORDER BY size_order, color',
    [productId]
  );
  return rows;
}

// Fase 4 (design.md): re-deriva variantes desde filas LIVE para el carrito.
// Nunca confía en precio/stock enviado por el cliente (§CLAUDE.md) — cada
// POST de carrito llama esto para revalidar contra la DB real. `ANY($1)`
// con array vacío en Postgres no rompe, pero evitamos la query igual.
async function findByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const { rows } = await db.query(
    `SELECT
       v.id, v.product_id, v.size, v.color, v.stock,
       COALESCE(v.price_override, p.base_price) AS price,
       p.name AS product_name, p.slug AS product_slug,
       img.filename AS image_filename
     FROM variants v
     JOIN products p ON p.id = v.product_id
     LEFT JOIN LATERAL (
       SELECT filename FROM product_images
       WHERE product_id = v.product_id
       ORDER BY is_primary DESC, sort_order ASC
       LIMIT 1
     ) img ON true
     WHERE v.id = ANY($1::bigint[])`,
    [ids]
  );
  return rows.map((row) => ({ ...row, id: Number(row.id), product_id: Number(row.product_id) }));
}

module.exports = { bulkCreate, findByProductId, findByIds };
