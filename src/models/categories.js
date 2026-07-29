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

module.exports = { create, findBySlug, findAll, findChildren };
