// Test de integración del router de productos admin (Fase 6a). Requiere
// Postgres + bcryptjs instalado (login real necesario para pasar el guard).
const test = require('node:test');
const assert = require('node:assert/strict');

const bcrypt = require('bcryptjs');
const { pool } = require('../../src/db/pool');
const app = require('../../src/app');

let server;
let baseUrl;
let testAdmin;
let testCategoryId;
const createdProductIds = [];

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const email = `test-admin-prod-${Date.now()}@donnastyle.com`;
  const passwordHash = await bcrypt.hash('password-de-test-123', 12);
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING *`,
    [email, passwordHash]
  );
  testAdmin = rows[0];

  const { rows: catRows } = await pool.query(
    `INSERT INTO categories (name, slug) VALUES ('Cat test productos', $1) RETURNING id`,
    [`cat-test-productos-${Date.now()}`]
  );
  testCategoryId = catRows[0].id;
});

test.after(async () => {
  if (createdProductIds.length > 0) {
    await pool.query('DELETE FROM products WHERE id = ANY($1::bigint[])', [createdProductIds]);
  }
  await pool.query('DELETE FROM categories WHERE id = $1', [testCategoryId]);
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

test('POST /admin/productos sin CSRF es 403 y no crea nada', async () => {
  const { cookie } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/productos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `name=Sin CSRF&base_price=100&category_ids=${testCategoryId}&variants[0][stock]=1`,
  });
  assert.equal(res.status, 403);
});

test('crear producto sin variantes es rechazado (obligatorio §3.3)', async () => {
  const { cookie, csrfToken } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/productos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `name=Sin variantes&base_price=100&category_ids=${testCategoryId}&_csrf=${csrfToken}`,
  });
  assert.equal(res.status, 400);
});

test('crear producto válido (sin imágenes) se guarda como borrador is_active=false', async () => {
  const { cookie, csrfToken } = await loginSession();
  const slug = `producto-nuevo-${Date.now()}`;
  const res = await fetch(`${baseUrl}/admin/productos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body:
      `name=Producto Nuevo&slug=${slug}&base_price=1500&category_ids=${testCategoryId}` +
      `&variants[0][size]=M&variants[0][stock]=5&variants[0][size_order]=200&_csrf=${csrfToken}`,
  });
  await res.text();
  assert.equal(res.status, 303);

  const { rows } = await pool.query('SELECT * FROM products WHERE slug = $1', [slug]);
  assert.equal(rows.length, 1);
  createdProductIds.push(rows[0].id);
  assert.equal(rows[0].is_active, false, 'sin imágenes, debe quedar como borrador (D9)');

  const { rows: variantRows } = await pool.query('SELECT * FROM variants WHERE product_id = $1', [rows[0].id]);
  assert.equal(variantRows.length, 1);
  assert.equal(variantRows[0].size, 'M');
});

test('editar producto: renombrar NO cambia el slug (freeze confirmado esta sesión)', async () => {
  const { cookie, csrfToken } = await loginSession();
  const { rows: productRows } = await pool.query(
    `INSERT INTO products (name, slug, base_price) VALUES ('Original', $1, 200) RETURNING id, slug`,
    [`slug-original-${Date.now()}`]
  );
  const product = productRows[0];
  createdProductIds.push(product.id);
  await pool.query('INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2)', [
    product.id,
    testCategoryId,
  ]);
  await pool.query(
    `INSERT INTO variants (product_id, size, size_order, stock) VALUES ($1, 'M', 200, 3)`,
    [product.id]
  );

  const res = await fetch(`${baseUrl}/admin/productos/${product.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body:
      `name=Renombrado&base_price=200&category_ids=${testCategoryId}` +
      `&variants[0][size]=M&variants[0][stock]=3&variants[0][size_order]=200&_csrf=${csrfToken}`,
  });
  await res.text();
  assert.equal(res.status, 303);

  const { rows: after } = await pool.query('SELECT name, slug FROM products WHERE id = $1', [product.id]);
  assert.equal(after[0].name, 'Renombrado');
  assert.equal(after[0].slug, product.slug, 'el slug no debe cambiar al renombrar');
});

test('borrar producto referenciado por un pedido es rechazado, historial intacto', async () => {
  const { cookie, csrfToken } = await loginSession();
  const { rows: productRows } = await pool.query(
    `INSERT INTO products (name, slug, base_price) VALUES ('Con pedido', $1, 300) RETURNING id`,
    [`con-pedido-${Date.now()}`]
  );
  const productId = productRows[0].id;
  createdProductIds.push(productId);
  const { rows: variantRows } = await pool.query(
    `INSERT INTO variants (product_id, stock) VALUES ($1, 2) RETURNING id`,
    [productId]
  );
  const { rows: orderRows } = await pool.query(
    `INSERT INTO orders (public_token, subtotal, items_count) VALUES ($1, 300, 1) RETURNING id`,
    [`test-order-token-${Date.now()}`]
  );
  await pool.query(
    `INSERT INTO order_items (order_id, variant_id, product_name_snapshot, unit_price, quantity)
     VALUES ($1, $2, 'snapshot', 300, 1)`,
    [orderRows[0].id, variantRows[0].id]
  );

  try {
    const res = await fetch(`${baseUrl}/admin/productos/${productId}/eliminar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
      body: `_csrf=${csrfToken}`,
    });
    const body = await res.text();
    assert.equal(res.status, 400);
    assert.match(body, /pedidos anteriores/i);

    const stillThere = await pool.query('SELECT id FROM products WHERE id = $1', [productId]);
    assert.equal(stillThere.rows.length, 1);
  } finally {
    await pool.query('DELETE FROM orders WHERE id = $1', [orderRows[0].id]);
  }
});
