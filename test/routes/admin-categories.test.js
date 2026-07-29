// Test de integración del router de categorías admin (Fase 6a). Requiere
// Postgres + bcryptjs instalado (login real necesario para pasar el guard).
const test = require('node:test');
const assert = require('node:assert/strict');

const bcrypt = require('bcryptjs');
const { pool } = require('../../src/db/pool');
const app = require('../../src/app');

let server;
let baseUrl;
let testAdmin;
const createdCategoryIds = [];

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const email = `test-admin-cat-${Date.now()}@donnastyle.com`;
  const passwordHash = await bcrypt.hash('password-de-test-123', 12);
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING *`,
    [email, passwordHash]
  );
  testAdmin = rows[0];
});

test.after(async () => {
  if (createdCategoryIds.length > 0) {
    await pool.query('DELETE FROM categories WHERE id = ANY($1::bigint[])', [createdCategoryIds]);
  }
  if (testAdmin) await pool.query('DELETE FROM admin_users WHERE id = $1', [testAdmin.id]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

function extractCookie(res) {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  return raw.split(';')[0];
}

async function getCsrfToken(cookie) {
  const res = await fetch(`${baseUrl}/admin`, { headers: { cookie } });
  await res.text();
  const sid = decodeURIComponent(cookie.split('=')[1]).split('.')[0].replace(/^s:/, '');
  const { rows } = await pool.query('SELECT sess FROM session WHERE sid = $1', [sid]);
  return rows[0]?.sess?.csrfToken;
}

async function loginSession() {
  const anonRes = await fetch(`${baseUrl}/admin/login`, { redirect: 'manual' });
  const anonCookie = extractCookie(anonRes);
  const csrfToken = await getCsrfToken(anonCookie);
  const loginRes = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: anonCookie },
    redirect: 'manual',
    body: `email=${encodeURIComponent(testAdmin.email)}&password=password-de-test-123&_csrf=${csrfToken}`,
  });
  await loginRes.text();
  const cookie = extractCookie(loginRes) || anonCookie;
  const freshCsrf = await getCsrfToken(cookie);
  return { cookie, csrfToken: freshCsrf };
}

test('POST /admin/categorias sin CSRF es 403 y no crea nada', async () => {
  const { cookie } = await loginSession();
  const { rows: before } = await pool.query('SELECT count(*)::int AS n FROM categories');

  const res = await fetch(`${baseUrl}/admin/categorias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `name=Sin CSRF&slug=sin-csrf-${Date.now()}`,
  });
  assert.equal(res.status, 403);

  const { rows: after } = await pool.query('SELECT count(*)::int AS n FROM categories');
  assert.equal(after[0].n, before[0].n);
});

test('crear categoría raíz, re-parentar a nivel 2, e intentar un tercer nivel es rechazado con mensaje legible', async () => {
  const { cookie, csrfToken } = await loginSession();

  const rootRes = await fetch(`${baseUrl}/admin/categorias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `name=Root Test&slug=root-test-${Date.now()}&_csrf=${csrfToken}`,
  });
  await rootRes.text();
  assert.equal(rootRes.status, 303);

  const { rows: rootRows } = await pool.query('SELECT id FROM categories ORDER BY id DESC LIMIT 1');
  const rootId = rootRows[0].id;
  createdCategoryIds.push(rootId);

  const childRes = await fetch(`${baseUrl}/admin/categorias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `name=Child Test&slug=child-test-${Date.now()}&parent_id=${rootId}&_csrf=${csrfToken}`,
  });
  await childRes.text();
  assert.equal(childRes.status, 303);

  const { rows: childRows } = await pool.query('SELECT id FROM categories WHERE parent_id = $1', [rootId]);
  const childId = childRows[0].id;
  createdCategoryIds.push(childId);

  const grandchildRes = await fetch(`${baseUrl}/admin/categorias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `name=Grandchild&slug=grandchild-${Date.now()}&parent_id=${childId}&_csrf=${csrfToken}`,
  });
  const body = await grandchildRes.text();
  assert.equal(grandchildRes.status, 400);
  assert.match(body, /2 niveles/);
});

test('borrar categoría con productos asignados es bloqueado', async () => {
  const { cookie, csrfToken } = await loginSession();

  const { rows: catRows } = await pool.query(
    `INSERT INTO categories (name, slug) VALUES ('Con productos', $1) RETURNING id`,
    [`con-productos-${Date.now()}`]
  );
  const categoryId = catRows[0].id;
  createdCategoryIds.push(categoryId);

  const { rows: prodRows } = await pool.query(
    `INSERT INTO products (name, slug, base_price) VALUES ('Prod test', $1, 100) RETURNING id`,
    [`prod-test-cat-${Date.now()}`]
  );
  const productId = prodRows[0].id;
  await pool.query('INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2)', [
    productId,
    categoryId,
  ]);

  try {
    const res = await fetch(`${baseUrl}/admin/categorias/${categoryId}/eliminar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
      body: `_csrf=${csrfToken}`,
    });
    const body = await res.text();
    assert.equal(res.status, 400);
    assert.match(body, /productos asignados/i);

    const stillThere = await pool.query('SELECT id FROM categories WHERE id = $1', [categoryId]);
    assert.equal(stillThere.rows.length, 1);
  } finally {
    await pool.query('DELETE FROM products WHERE id = $1', [productId]);
  }
});
