// Acceso a datos de `pages` (páginas informativas). SQL crudo parametrizado,
// sin ORM (§2/§8.1). Mismo patrón que carousel-slides.js: `nextSortOrder` +
// `reorder`/`reorderIds` compartido con services/ordering.js. El `slug` se
// pasa siempre desde el router (derivado UNA sola vez en el alta) y `update`
// deliberadamente nunca lo toca — mismo criterio que categories.js:120-126.
const db = require('../db/pool');
const { reorderIds } = require('../services/ordering');
const { escapeLikeLiteral, FOLD_FROM, FOLD_TO } = require('../services/text-search');

async function nextSortOrder() {
  const { rows } = await db.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM pages');
  return rows[0].next;
}

async function create({ title, slug, descriptionHtml, sortOrder }) {
  const resolvedSortOrder = sortOrder ?? (await nextSortOrder());
  const { rows } = await db.query(
    `INSERT INTO pages (title, slug, description_html, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [title, slug, descriptionHtml, resolvedSortOrder]
  );
  return rows[0];
}

// Panel: TODAS las páginas, activas e inactivas (mismo criterio que
// carousel-slides.js#findAllForAdmin) — filtro opcional por título, ILIKE
// tolerante a acentos, mismo patrón que products.js#searchActiveByName.
async function findAllForAdmin({ term } = {}) {
  if (!term) {
    const { rows } = await db.query('SELECT * FROM pages ORDER BY sort_order, id');
    return rows;
  }
  const pattern = `%${escapeLikeLiteral(term)}%`;
  const { rows } = await db.query(
    `SELECT * FROM pages
      WHERE translate(lower(title), $2, $3) LIKE translate(lower($1), $2, $3) ESCAPE '\\'
      ORDER BY sort_order, id`,
    [pattern, FOLD_FROM, FOLD_TO]
  );
  return rows;
}

// Chrome (menú+footer, spec "Enabled pages appear in menu and footer") —
// solo columnas necesarias para renderizar el link.
async function findActiveForMenu() {
  const { rows } = await db.query(
    'SELECT id, slug, title FROM pages WHERE is_active = true ORDER BY sort_order, id'
  );
  return rows;
}

// Público: null tanto si no existe como si existe pero está deshabilitada
// (spec "Public visibility follows enabled state") — el caller (public.js)
// hace next() en ambos casos, sin distinguir, para no filtrar la existencia
// de una página oculta.
async function findActiveBySlug(slug) {
  const { rows } = await db.query('SELECT * FROM pages WHERE slug = $1 AND is_active = true', [slug]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await db.query('SELECT * FROM pages WHERE id = $1', [id]);
  return rows[0] || null;
}

// Nunca toca slug/sort_order/is_active (spec "Slug is frozen after
// creation", "Page editing MUST NOT change position nor enabled state").
async function update(id, { title, descriptionHtml }) {
  const { rows } = await db.query(
    `UPDATE pages SET title = $2, description_html = $3, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, title, descriptionHtml]
  );
  return rows[0] || null;
}

async function setActive(id, isActive) {
  const { rows } = await db.query(
    'UPDATE pages SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [id, isActive]
  );
  return rows[0] || null;
}

async function remove(id) {
  await db.query('DELETE FROM pages WHERE id = $1', [id]);
}

// `orderedIds` es el array COMPLETO en el nuevo orden (sort_order = índice)
// — mismo shape que carousel-slides.js#reorder.
async function reorder(orderedIds) {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await db.query('UPDATE pages SET sort_order = $2 WHERE id = $1', [orderedIds[i], i]);
  }
}

module.exports = {
  create,
  nextSortOrder,
  findAllForAdmin,
  findActiveForMenu,
  findActiveBySlug,
  findById,
  update,
  setActive,
  remove,
  reorder,
  reorderIds,
};
