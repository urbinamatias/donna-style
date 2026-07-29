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

module.exports = { create, findBySlug, findAll, findChildren, findDescendantIds, findMenuTree };
