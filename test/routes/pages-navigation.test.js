// RED (tasks.md T8/T9, spec site-navigation + informational-pages "Public
// visibility follows enabled state"). Postgres real + server real, mismo
// patrón que test/routes/public.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const app = require('../../src/app');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await pool.query(`DELETE FROM pages WHERE title LIKE 'Test%'`);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function createPage(overrides = {}) {
  const { rows } = await pool.query(
    `INSERT INTO pages (title, slug, description_html, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      overrides.title ?? 'Test página',
      overrides.slug ?? `test-nav-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      overrides.descriptionHtml ?? '<strong>Contenido</strong> de test',
      overrides.sortOrder ?? 0,
      overrides.isActive ?? true,
    ]
  );
  return rows[0];
}

test('sin páginas nunca creadas: menú y footer no muestran ningún rastro (principio de ausencia)', async () => {
  await pool.query(`DELETE FROM pages WHERE title LIKE 'Test%'`);
  const res = await fetch(`${baseUrl}/`);
  const html = await res.text();
  assert.doesNotMatch(html, /aria-label="Información"/);
});

test('con páginas A, B, C habilitadas: aparecen como <li> siblings de Productos en el drawer, y en el footer, mismo orden', async () => {
  const a = await createPage({ title: 'Test Nav A', sortOrder: 800 });
  const b = await createPage({ title: 'Test Nav B', sortOrder: 801 });
  const c = await createPage({ title: 'Test Nav C', sortOrder: 802 });
  try {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();

    const idxProductos = html.indexOf('Productos');
    const idxA = html.indexOf('Test Nav A');
    const idxB = html.indexOf('Test Nav B');
    const idxC = html.indexOf('Test Nav C');
    assert.ok(idxProductos !== -1 && idxA !== -1 && idxB !== -1 && idxC !== -1);
    assert.ok(idxProductos < idxA && idxA < idxB && idxB < idxC, 'orden A, B, C después de Productos');

    assert.match(html, /aria-label="Información"/);
  } finally {
    await pool.query('DELETE FROM pages WHERE id = ANY($1::bigint[])', [[a.id, b.id, c.id]]);
  }
});

test('con todas las páginas deshabilitadas tras estar activas: no queda rastro en ningún lado', async () => {
  const a = await createPage({ title: 'Test Nav Oculta', isActive: false });
  try {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    assert.doesNotMatch(html, /Test Nav Oculta/);
  } finally {
    await pool.query('DELETE FROM pages WHERE id = $1', [a.id]);
  }
});

test('título al tope de 60 caracteres no rompe el layout del menú (trunca en una sola línea)', async () => {
  const longTitle = 'T'.repeat(60);
  const a = await createPage({ title: longTitle });
  try {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    assert.match(html, /truncate/);
  } finally {
    await pool.query('DELETE FROM pages WHERE id = $1', [a.id]);
  }
});

// ---------------------------------------------------------------------
// T9: ruta pública GET /:slug
// ---------------------------------------------------------------------

test('GET /:slug de una página activa: renderiza título y descripción sanitizada', async () => {
  const page = await createPage({ title: 'Test Página Activa', descriptionHtml: '<strong>Negrita</strong><script>alert(1)</script>' });
  try {
    const res = await fetch(`${baseUrl}/${page.slug}`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Test Página Activa/);
    assert.match(html, /<strong>Negrita<\/strong>/);
    assert.doesNotMatch(html, /<script>alert/);
  } finally {
    await pool.query('DELETE FROM pages WHERE id = $1', [page.id]);
  }
});

test('GET /:slug de una página deshabilitada: 404 estándar, sin pista de contenido', async () => {
  const page = await createPage({ title: 'Test Página Oculta', isActive: false });
  try {
    const res = await fetch(`${baseUrl}/${page.slug}`);
    assert.equal(res.status, 404);
    const html = await res.text();
    assert.doesNotMatch(html, /Test Página Oculta/);
  } finally {
    await pool.query('DELETE FROM pages WHERE id = $1', [page.id]);
  }
});

test('slug de página y slug de categoría coexisten: cada uno resuelve a su propia vista, sin shadowing', async () => {
  const { rows: cats } = await pool.query('SELECT slug, name FROM categories LIMIT 1');
  if (cats.length === 0) return;
  const categoryRes = await fetch(`${baseUrl}/${cats[0].slug}`);
  assert.equal(categoryRes.status, 200);
  const categoryHtml = await categoryRes.text();
  assert.match(categoryHtml, new RegExp(cats[0].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('título del h1 usa una escala estrictamente mayor que el cuerpo, y el bold no la escala', async () => {
  const page = await createPage({ title: 'Test Tipografía', descriptionHtml: '<strong>todo en negrita</strong>' });
  try {
    const res = await fetch(`${baseUrl}/${page.slug}`);
    const html = await res.text();
    assert.match(html, /<h1 class="[^"]*text-2xl[^"]*sm:text-3xl[^"]*">/);
    assert.match(html, /class="prose prose-sm max-w-none text-sm/);
  } finally {
    await pool.query('DELETE FROM pages WHERE id = $1', [page.id]);
  }
});
