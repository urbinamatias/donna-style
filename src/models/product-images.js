// Acceso a datos de `product_images`. SQL crudo parametrizado, sin ORM.
const db = require('../db/pool');

// images: [{ filename, altText, sortOrder, isPrimary }]
async function bulkCreate(productId, images) {
  if (!images || images.length === 0) return [];
  const values = [];
  const placeholders = images
    .map((img, i) => {
      const base = i * 5;
      values.push(productId, img.filename, img.altText, img.sortOrder ?? 0, img.isPrimary ?? false);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    })
    .join(', ');
  const { rows } = await db.query(
    `INSERT INTO product_images (product_id, filename, alt_text, sort_order, is_primary)
     VALUES ${placeholders}
     RETURNING *`,
    values
  );
  return rows;
}

module.exports = { bulkCreate };
