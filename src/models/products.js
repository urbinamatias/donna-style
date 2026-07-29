// Acceso a datos de `products`. SQL crudo parametrizado, sin ORM (§2/§8.1).
const db = require('../db/pool');
const productImagesModel = require('./product-images');
const variantsModel = require('./variants');

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

// Whitelist de columnas de orden: nunca se interpola el valor de query string
// directamente en el SQL (§8.1, "cero concatenación"). El valor externo solo
// se usa como clave de este mapa; si no matchea, cae a 'newest'.
const SORT_WHITELIST = {
  price_asc: 'base_price ASC',
  price_desc: 'base_price DESC',
  az: 'name ASC',
  za: 'name DESC',
  newest: 'created_at DESC',
  oldest: 'created_at ASC',
};

function stripFullCount(row) {
  const { full_count, ...rest } = row;
  return rest;
}

// Listado de categoría (§5.4). `categoryIds` ya viene resuelto por la capa de
// rutas (self, o self+descendientes para el rollup de categoría padre —
// §0.1 regla 2). Usa EXISTS en vez de JOIN para no duplicar filas cuando un
// producto está asignado a más de un id del array (ej. 2x1 + categoría real).
async function findByCategory({
  categoryIds,
  priceMin = null,
  priceMax = null,
  sort = 'newest',
  page = 1,
  perPage = 24,
}) {
  const orderBy = SORT_WHITELIST[sort] || SORT_WHITELIST.newest;
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const offset = (safePage - 1) * perPage;

  const { rows } = await db.query(
    `SELECT p.*, COUNT(*) OVER() AS full_count
     FROM products p
     WHERE p.is_active = true
       AND EXISTS (
         SELECT 1 FROM product_categories pc
         WHERE pc.product_id = p.id AND pc.category_id = ANY($1::bigint[])
       )
       AND ($2::numeric IS NULL OR p.base_price >= $2)
       AND ($3::numeric IS NULL OR p.base_price <= $3)
     ORDER BY ${orderBy}
     LIMIT $4 OFFSET $5`,
    [categoryIds, priceMin, priceMax, perPage, offset]
  );

  const total = rows.length > 0 ? Number(rows[0].full_count) : 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return { rows: rows.map(stripFullCount), total, totalPages };
}

async function findCategoriesForProduct(productId) {
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.slug, c.parent_id
     FROM categories c
     JOIN product_categories pc ON pc.category_id = c.id
     WHERE pc.product_id = $1
     ORDER BY c.sort_order, c.name`,
    [productId]
  );
  return rows;
}

// Ficha (§5.6): 1 query base + Promise.all para imágenes/variantes/categorías
// (no un mega-JOIN — el 1:N de imágenes y variantes multiplica filas por
// producto de forma cartesiana; ver design.md "Ficha data loading").
async function findBySlugWithDetails(slug) {
  const product = await findBySlug(slug);
  if (!product) return null;

  const [images, variants, categories] = await Promise.all([
    productImagesModel.findByProductId(product.id),
    variantsModel.findByProductId(product.id),
    findCategoriesForProduct(product.id),
  ]);

  return { ...product, images, variants, categories };
}

// Destacados de home (§5.2 item 3).
async function findFeatured(limit = 8) {
  const { rows } = await db.query(
    'SELECT * FROM products WHERE is_featured = true AND is_active = true ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return rows;
}

// "Productos similares" de la ficha (§5.6): misma categoría, excluye el actual.
async function findRelated(productId, categoryIds, limit = 4) {
  if (!categoryIds || categoryIds.length === 0) return [];
  const { rows } = await db.query(
    `SELECT DISTINCT p.*
     FROM products p
     WHERE p.is_active = true
       AND p.id != $1
       AND EXISTS (
         SELECT 1 FROM product_categories pc
         WHERE pc.product_id = p.id AND pc.category_id = ANY($2::bigint[])
       )
     ORDER BY p.created_at DESC
     LIMIT $3`,
    [productId, categoryIds, limit]
  );
  return rows;
}

module.exports = {
  create,
  findBySlug,
  addToCategories,
  findByCategory,
  findBySlugWithDetails,
  findFeatured,
  findRelated,
};
