// Acceso a datos de `products`. SQL crudo parametrizado, sin ORM (§2/§8.1).
const db = require('../db/pool');

async function create({
  name,
  slug,
  description = null,
  sizeGuide = null,
  basePrice,
  compareAtPrice = null,
  isFeatured = false,
  isActive = true,
  freeShipping = false,
}) {
  const { rows } = await db.query(
    `INSERT INTO products
       (name, slug, description, size_guide, base_price, compare_at_price,
        is_featured, is_active, free_shipping)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [name, slug, description, sizeGuide, basePrice, compareAtPrice, isFeatured, isActive, freeShipping]
  );
  return rows[0];
}

async function findBySlug(slug) {
  const { rows } = await db.query('SELECT * FROM products WHERE slug = $1', [slug]);
  return rows[0] || null;
}

// Bulk INSERT de la relación N:N producto-categoría (§0.1: un producto puede
// estar en más de una categoría a la vez, ej. 2x1).
async function addToCategories(productId, categoryIds) {
  if (!categoryIds || categoryIds.length === 0) return;
  const values = [];
  const placeholders = categoryIds
    .map((categoryId, i) => {
      values.push(productId, categoryId);
      return `($${i * 2 + 1}, $${i * 2 + 2})`;
    })
    .join(', ');
  await db.query(
    `INSERT INTO product_categories (product_id, category_id) VALUES ${placeholders}`,
    values
  );
}

module.exports = { create, findBySlug, addToCategories };
