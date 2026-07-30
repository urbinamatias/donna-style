// Acceso a datos de `categories`. SQL crudo parametrizado, sin ORM (§2/§8.1).
const db = require('../db/pool');

async function create({ name, slug, parentId = null, sortOrder = 0 }) {
  const { rows } = await db.query(
    `INSERT INTO categories (name, slug, parent_id, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, slug, parentId, sortOrder]
  );
  return rows[0];
}

async function findBySlug(slug) {
  const { rows } = await db.query('SELECT * FROM categories WHERE slug = $1', [slug]);
  return rows[0] || null;
}

async function findAll() {
  const { rows } = await db.query('SELECT * FROM categories ORDER BY sort_order, name');
  return rows;
}

// Próximo lugar en el orden, siempre al final de sus hermanas (fase 6c QA:
// una categoría nueva se creaba con `sort_order` 0 por defecto — como
// `findAll`/`findMenuTree` ordenan ASC, terminaba adelante de categorías ya
// existentes en vez de al final). Alcance por `parent_id`: el orden es entre
// hermanas del mismo nivel, no global.
async function nextSortOrder(parentId) {
  const { rows } = await db.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM categories WHERE parent_id IS NOT DISTINCT FROM $1',
    [parentId]
  );
  return rows[0].next;
}

async function findChildren(parentId) {
  const { rows } = await db.query(
    'SELECT * FROM categories WHERE parent_id = $1 ORDER BY sort_order, name',
    [parentId]
  );
  return rows;
}

// IDs de las hijas directas de una categoría (§0.1 regla 2, rollup padre→hijas).
async function findDescendantIds(categoryId) {
  const { rows } = await db.query('SELECT id FROM categories WHERE parent_id = $1', [categoryId]);
  return rows.map((r) => r.id);
}

// Árbol para el mega menú (§0.1, §5.1, §5.4): solo categorías (padre O hija)
// con al menos un producto activo asignado, propio o heredado de sus hijas.
// El link "Ver todo en {categoría}" NO se genera acá — eso es responsabilidad
// exclusiva de la vista (mega-menu.ejs), nunca del modelo (§0.1 regla 1).
async function findMenuTree() {
  const { rows } = await db.query(`
    SELECT
      c.id, c.name, c.slug, c.parent_id,
      EXISTS (
        SELECT 1
        FROM product_categories pc
        JOIN products p ON p.id = pc.product_id
        WHERE pc.category_id = c.id AND p.is_active = true
      ) AS has_own_active_products
    FROM categories c
    ORDER BY c.sort_order, c.name
  `);

  const byId = new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, slug: r.slug, children: [] }]));
  const parents = rows.filter((r) => r.parent_id === null);
  const activeIds = new Set(rows.filter((r) => r.has_own_active_products).map((r) => r.id));

  const tree = [];
  for (const parent of parents) {
    const children = rows.filter((r) => r.parent_id === parent.id);
    const visibleChildren = children.filter((c) => activeIds.has(c.id));
    const parentHasProducts = activeIds.has(parent.id) || visibleChildren.length > 0;
    if (!parentHasProducts) continue;

    const node = byId.get(parent.id);
    node.children = visibleChildren.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
    tree.push(node);
  }

  return tree;
}

async function findById(id) {
  const { rows } = await db.query('SELECT * FROM categories WHERE id = $1', [id]);
  return rows[0] || null;
}

// Update parcial (Fase 6a, tasks.md 2.1): solo escribe las columnas que
// vienen definidas, para que el form de edición pueda mandar solo lo que
// cambió. El trigger `trg_categories_max_depth` (002) sigue siendo la única
// fuente de verdad del límite de 2 niveles — acá no se duplica esa regla,
// el error de Postgres se deja subir para que la ruta lo mapee a un mensaje
// legible (design.md D8).
async function update(id, patch = {}) {
  const { name, slug, sortOrder } = patch;
  // `parentId` necesita distinguir "no vino en el patch" (no tocar) de
  // "vino explícitamente en null" (re-parentar a raíz) — por eso se chequea
  // con hasOwnProperty en vez de un simple `??`, que no podría diferenciar
  // ambos casos.
  const touchesParent = Object.prototype.hasOwnProperty.call(patch, 'parentId');
  const parentId = touchesParent ? patch.parentId : null;

  const { rows } = await db.query(
    `UPDATE categories SET
       name = COALESCE($2, name),
       slug = COALESCE($3, slug),
       parent_id = CASE WHEN $4 THEN $5::bigint ELSE parent_id END,
       sort_order = COALESCE($6, sort_order)
     WHERE id = $1
     RETURNING *`,
    [id, name ?? null, slug ?? null, touchesParent, parentId, sortOrder ?? null]
  );
  return rows[0] || null;
}

// hasProducts (Fase 6a, tasks.md reconciliación con design.md D7/D8 —
// "block-with-count", mismo patrón que products.hasOrders): nunca se borra
// una categoría en uso, porque `product_categories` cascadea y podría dejar
// un producto sin ninguna categoría (viola §3.3, mínimo 1 categoría).
async function hasProducts(id) {
  const { rows } = await db.query(
    'SELECT EXISTS (SELECT 1 FROM product_categories WHERE category_id = $1) AS exists',
    [id]
  );
  return rows[0].exists;
}

async function remove(id) {
  await db.query('DELETE FROM categories WHERE id = $1', [id]);
}

module.exports = {
  create,
  nextSortOrder,
  findBySlug,
  findById,
  findAll,
  findChildren,
  findDescendantIds,
  findMenuTree,
  update,
  hasProducts,
  remove,
};
