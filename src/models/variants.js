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

module.exports = { bulkCreate };
