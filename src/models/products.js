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

async function findById(id) {
  const { rows } = await db.query('SELECT * FROM products WHERE id = $1', [id]);
  return rows[0] || null;
}

// Ficha admin: sin el filtro `is_active = true` de findBySlugWithDetails —
// la dueña tiene que poder abrir y editar sus propios borradores (D9).
async function findByIdWithDetails(id) {
  const product = await findById(id);
  if (!product) return null;

  const [images, variants, categories] = await Promise.all([
    productImagesModel.findByProductId(product.id),
    variantsModel.findByProductId(product.id),
    findCategoriesForProduct(product.id),
  ]);

  return { ...product, images, variants, categories };
}

// Listado admin (Fase 6a, spec "Product listing and editing" + "Filter
// list"): a diferencia de findByCategory, incluye inactivos — es el panel,
// no el catálogo público.
async function findAllForAdmin({ isActive = null, categoryIds = null, page = 1, perPage = 50 } = {}) {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const offset = (safePage - 1) * perPage;

  const { rows } = await db.query(
    `SELECT p.*, COUNT(*) OVER() AS full_count
     FROM products p
     WHERE ($1::boolean IS NULL OR p.is_active = $1)
       AND ($2::bigint[] IS NULL OR EXISTS (
         SELECT 1 FROM product_categories pc
         WHERE pc.product_id = p.id AND pc.category_id = ANY($2::bigint[])
       ))
     ORDER BY p.created_at DESC
     LIMIT $3 OFFSET $4`,
    [isActive, categoryIds, perPage, offset]
  );

  const total = rows.length > 0 ? Number(rows[0].full_count) : 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return { rows: rows.map(stripFullCount), total, totalPages };
}

// Update parcial (Fase 6a, tasks.md 3.4). El `slug` SOLO cambia si viene
// explícito en el patch — nunca se re-deriva del `name` acá (decisión
// confirmada esta sesión: renombrar un producto no debe romper un link de
// WhatsApp/redes ya compartido). Campos opcionales nullable (description,
// sizeGuide, compareAtPrice) usan hasOwnProperty para distinguir "no vino en
// el patch" de "vino explícitamente en null" (vaciar el campo), igual que
// categories.update con parentId.
async function update(id, patch = {}, client = db) {
  const { name, slug, basePrice, isFeatured, isActive, freeShipping } = patch;

  // D9: activar un producto sin imágenes se rechaza acá, no en la ruta —
  // así ningún caller (form, script, futuro bulk-edit) puede saltarse la
  // invariante de §3.3.
  if (isActive === true) {
    const { rows: imgRows } = await client.query(
      'SELECT count(*)::int AS n FROM product_images WHERE product_id = $1',
      [id]
    );
    if (Number(imgRows[0].n) === 0) {
      const err = new Error('No se puede activar un producto sin al menos una imagen.');
      err.code = 'NO_IMAGES';
      throw err;
    }
  }

  const touches = (key) => Object.prototype.hasOwnProperty.call(patch, key);
  const description = touches('description') ? patch.description : undefined;
  const sizeGuide = touches('sizeGuide') ? patch.sizeGuide : undefined;
  const compareAtPrice = touches('compareAtPrice') ? patch.compareAtPrice : undefined;

  const { rows } = await client.query(
    `UPDATE products SET
       name = COALESCE($2, name),
       slug = COALESCE($3, slug),
       description = CASE WHEN $4 THEN $5 ELSE description END,
       size_guide = CASE WHEN $6 THEN $7 ELSE size_guide END,
       base_price = COALESCE($8, base_price),
       compare_at_price = CASE WHEN $9 THEN $10 ELSE compare_at_price END,
       is_featured = COALESCE($11, is_featured),
       is_active = COALESCE($12, is_active),
       free_shipping = COALESCE($13, free_shipping)
     WHERE id = $1
     RETURNING *`,
    [
      id,
      name ?? null,
      slug ?? null,
      description !== undefined,
      description ?? null,
      sizeGuide !== undefined,
      sizeGuide ?? null,
      basePrice ?? null,
      compareAtPrice !== undefined,
      compareAtPrice ?? null,
      isFeatured ?? null,
      isActive ?? null,
      freeShipping ?? null,
    ]
  );
  return rows[0] || null;
}

// D7: chequeo de aplicación, NUNCA se reemplaza por la FK — `order_items
// .variant_id` es `ON DELETE SET NULL` (004_orders.sql), no RESTRICT, así
// que Postgres solo no alcanza para bloquear el delete. Nota documentada en
// el propio design: una vez que una variante se borra, su vínculo a
// order_items también se pierde (SET NULL), así que este check puede volver
// `false` para un producto que alguna vez tuvo pedidos si sus variantes ya
// no existen — comportamiento esperado, no un bug.
async function hasOrders(productId) {
  const { rows } = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM order_items oi
       JOIN variants v ON v.id = oi.variant_id
       WHERE v.product_id = $1
     ) AS exists`,
    [productId]
  );
  return rows[0].exists;
}

async function remove(id, client = db) {
  await client.query('DELETE FROM products WHERE id = $1', [id]);
}

// Reemplaza la asignación N:N completa (Fase 6a, form de edición: siempre
// manda el set final de categorías, nunca un delta).
async function setCategories(productId, categoryIds, client = db) {
  await client.query('DELETE FROM product_categories WHERE product_id = $1', [productId]);
  if (!categoryIds || categoryIds.length === 0) return;

  const values = [];
  const placeholders = categoryIds
    .map((categoryId, i) => {
      values.push(productId, categoryId);
      return `($${i * 2 + 1}, $${i * 2 + 2})`;
    })
    .join(', ');
  await client.query(
    `INSERT INTO product_categories (product_id, category_id) VALUES ${placeholders}`,
    values
  );
}

module.exports = {
  create,
  findBySlug,
  findById,
  findByIdWithDetails,
  findAllForAdmin,
  addToCategories,
  setCategories,
  findByCategory,
  findBySlugWithDetails,
  findFeatured,
  findRelated,
  update,
  remove,
  hasOrders,
};
