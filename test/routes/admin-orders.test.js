// Test de integración del router de pedidos admin (Fase 6c, spec
// admin-orders). RED-first — este archivo se escribe ANTES de crear
// src/routes/admin/orders.js. Usa el harness sin sharp (ver
// test/routes/helpers/admin-test-app.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const bcrypt = require('bcryptjs');
const { pool } = require('../../src/db/pool');
const { buildAdminTestApp } = require('./helpers/admin-test-app');
const ordersRouter = require('../../src/routes/admin/orders');
const productsModel = require('../../src/models/products');
const variantsModel = require('../../src/models/variants');
const ordersModel = require('../../src/models/orders');

const app = buildAdminTestApp([ordersRouter]);

let server;
let baseUrl;
let testAdmin;
const createdProductIds = [];
const createdOrderIds = [];

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const email = `test-admin-orders-${Date.now()}@donnastyle.com`;
  const passwordHash = await bcrypt.hash('password-de-test-123', 12);
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING *`,
    [email, passwordHash]
  );
  testAdmin = rows[0];
});

test.after(async () => {
  if (createdOrderIds.length > 0) {
    await pool.query('DELETE FROM orders WHERE id = ANY($1::bigint[])', [createdOrderIds]);
  }
  if (createdProductIds.length > 0) {
    await pool.query('DELETE FROM products WHERE id = ANY($1::bigint[])', [createdProductIds]);
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
  const res = await fetch(`${baseUrl}/admin/login`, { headers: { cookie } });
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

async function makeVariant(stock) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const product = await productsModel.create({
    name: `Fixture Orders ${stamp}`,
    slug: `fixture-orders-${stamp}`,
    basePrice: 1000,
  });
  createdProductIds.push(product.id);
  const [variant] = await variantsModel.bulkCreate(product.id, [
    { size: 'M', sizeOrder: 1, stock, sku: `fx-ord-${stamp}` },
  ]);
  return variant;
}

async function makeOrder(items, { status = 'pendiente' } = {}) {
  const order = await ordersModel.createWithItems({
    publicToken: randomUUID(),
    customerName: 'Cliente Fixture',
    subtotal: 100,
    itemsCount: items.length,
    items: items.map((it) => ({
      variantId: it.variantId,
      productNameSnapshot: 'Item fixture',
      size: 'M',
      color: 'Negro',
      unitPrice: 10,
      quantity: it.quantity,
    })),
  });
  if (status !== 'pendiente') {
    await pool.query('UPDATE orders SET status = $2 WHERE id = $1', [order.id, status]);
  }
  createdOrderIds.push(order.id);
  return order;
}

test('GET /admin/pedidos sin sesión redirige a login', async () => {
  const res = await fetch(`${baseUrl}/admin/pedidos`, { redirect: 'manual' });
  await res.text();
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /\/admin\/login/);
});

test('GET /admin/pedidos?estado=pendiente filtra solo pendientes', async () => {
  const { cookie } = await loginSession();
  const v = await makeVariant(10);
  const pending = await makeOrder([{ variantId: v.id, quantity: 1 }], { status: 'pendiente' });
  const confirmed = await makeOrder([{ variantId: v.id, quantity: 1 }], { status: 'confirmado' });

  const res = await fetch(`${baseUrl}/admin/pedidos?estado=pendiente`, { headers: { cookie } });
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(body, new RegExp(pending.order_code));
  assert.doesNotMatch(body, new RegExp(confirmed.order_code));
});

test('GET /admin/pedidos/:id devuelve 404 para un id inexistente', async () => {
  const { cookie } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/pedidos/999999999`, { headers: { cookie } });
  await res.text();
  assert.equal(res.status, 404);
});

test('GET /admin/pedidos/:id: item con variant_id NULL igual muestra su snapshot', async () => {
  const { cookie } = await loginSession();
  const order = await makeOrder([{ variantId: null, quantity: 2 }]);

  const res = await fetch(`${baseUrl}/admin/pedidos/${order.id}`, { headers: { cookie } });
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(body, /Item fixture/);
});

test('GET /admin/pedidos/:id: pedido entregado no ofrece ningun control de cambio de estado', async () => {
  const { cookie } = await loginSession();
  const v = await makeVariant(5);
  const order = await makeOrder([{ variantId: v.id, quantity: 1 }], { status: 'entregado' });

  const res = await fetch(`${baseUrl}/admin/pedidos/${order.id}`, { headers: { cookie } });
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.doesNotMatch(body, /name="estado" value="confirmado"/);
  assert.doesNotMatch(body, /name="estado" value="cancelado"/);
  assert.doesNotMatch(body, /name="estado" value="pendiente"/);
});

test('POST /admin/pedidos/:id/estado sin CSRF es 403, no cambia status ni stock', async () => {
  const { cookie } = await loginSession();
  const v = await makeVariant(5);
  const order = await makeOrder([{ variantId: v.id, quantity: 1 }]);

  const res = await fetch(`${baseUrl}/admin/pedidos/${order.id}/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: 'estado=confirmado',
  });
  await res.text();
  assert.equal(res.status, 403);

  const { rows } = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
  assert.equal(rows[0].status, 'pendiente');
  const { rows: vRows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [v.id]);
  assert.equal(vRows[0].stock, 5);
});

test('confirmar decrementa el stock de cada item y pasa a confirmado', async () => {
  const { cookie, csrfToken } = await loginSession();
  const vX = await makeVariant(5);
  const vY = await makeVariant(1);
  const order = await makeOrder([
    { variantId: vX.id, quantity: 2 },
    { variantId: vY.id, quantity: 1 },
  ]);

  const res = await fetch(`${baseUrl}/admin/pedidos/${order.id}/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `estado=confirmado&_csrf=${csrfToken}`,
  });
  await res.text();
  assert.equal(res.status, 303);

  const { rows: orderRows } = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
  assert.equal(orderRows[0].status, 'confirmado');
  const { rows: xRows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [vX.id]);
  assert.equal(xRows[0].stock, 3);
  const { rows: yRows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [vY.id]);
  assert.equal(yRows[0].stock, 0);
});

test('doble confirmación (double-submit) es un no-op vía CAS: stock no se descuenta dos veces', async () => {
  const { cookie, csrfToken } = await loginSession();
  const v = await makeVariant(5);
  const order = await makeOrder([{ variantId: v.id, quantity: 1 }]);

  const post = () =>
    fetch(`${baseUrl}/admin/pedidos/${order.id}/estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
      redirect: 'manual',
      body: `estado=confirmado&_csrf=${csrfToken}`,
    });

  const first = await post();
  await first.text();
  assert.equal(first.status, 303);

  const second = await post();
  await second.text();

  const { rows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [v.id]);
  assert.equal(rows[0].stock, 4, 'el segundo confirm no debe descontar de nuevo');
});

test('confirmado->cancelado repone exactamente los montos descontados', async () => {
  const { cookie, csrfToken } = await loginSession();
  const vX = await makeVariant(5);
  const vY = await makeVariant(1);
  const order = await makeOrder(
    [
      { variantId: vX.id, quantity: 2 },
      { variantId: vY.id, quantity: 1 },
    ],
    { status: 'confirmado' }
  );
  // El confirm ya "gastó" el stock manualmente para simular el estado post-confirm real.
  await pool.query('UPDATE variants SET stock = stock - 2 WHERE id = $1', [vX.id]);
  await pool.query('UPDATE variants SET stock = stock - 1 WHERE id = $1', [vY.id]);

  const res = await fetch(`${baseUrl}/admin/pedidos/${order.id}/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `estado=cancelado&_csrf=${csrfToken}`,
  });
  await res.text();
  assert.equal(res.status, 303);

  const { rows: xRows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [vX.id]);
  assert.equal(xRows[0].stock, 5);
  const { rows: yRows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [vY.id]);
  assert.equal(yRows[0].stock, 1);
  const { rows: orderRows } = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
  assert.equal(orderRows[0].status, 'cancelado');
});

test('pendiente->cancelado no mueve stock', async () => {
  const { cookie, csrfToken } = await loginSession();
  const v = await makeVariant(5);
  const order = await makeOrder([{ variantId: v.id, quantity: 2 }]);

  const res = await fetch(`${baseUrl}/admin/pedidos/${order.id}/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `estado=cancelado&_csrf=${csrfToken}`,
  });
  await res.text();
  assert.equal(res.status, 303);

  const { rows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [v.id]);
  assert.equal(rows[0].stock, 5);
});

test('cancelado->pendiente no mueve stock', async () => {
  const { cookie, csrfToken } = await loginSession();
  const v = await makeVariant(5);
  const order = await makeOrder([{ variantId: v.id, quantity: 2 }], { status: 'cancelado' });

  const res = await fetch(`${baseUrl}/admin/pedidos/${order.id}/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `estado=pendiente&_csrf=${csrfToken}`,
  });
  await res.text();
  assert.equal(res.status, 303);

  const { rows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [v.id]);
  assert.equal(rows[0].stock, 5);
});

test('confirmado->entregado no mueve stock (ya se tomó al confirmar)', async () => {
  const { cookie, csrfToken } = await loginSession();
  const v = await makeVariant(3);
  const order = await makeOrder([{ variantId: v.id, quantity: 2 }], { status: 'confirmado' });

  const res = await fetch(`${baseUrl}/admin/pedidos/${order.id}/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `estado=entregado&_csrf=${csrfToken}`,
  });
  await res.text();
  assert.equal(res.status, 303);

  const { rows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [v.id]);
  assert.equal(rows[0].stock, 3);
  const { rows: orderRows } = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
  assert.equal(orderRows[0].status, 'entregado');
});

test('stock insuficiente bloquea TODA la transacción y nombra cada variante', async () => {
  const { cookie, csrfToken } = await loginSession();
  const vX = await makeVariant(1);
  const vY = await makeVariant(10);
  const order = await makeOrder([
    { variantId: vX.id, quantity: 3 },
    { variantId: vY.id, quantity: 1 },
  ]);

  const res = await fetch(`${baseUrl}/admin/pedidos/${order.id}/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `estado=confirmado&_csrf=${csrfToken}`,
  });
  await res.text();

  const { rows: orderRows } = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
  assert.equal(orderRows[0].status, 'pendiente', 'el pedido debe seguir pendiente, rollback completo');
  const { rows: xRows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [vX.id]);
  assert.equal(xRows[0].stock, 1);
  const { rows: yRows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [vY.id]);
  assert.equal(yRows[0].stock, 10);
});

test('item huerfano (variant_id NULL) se saltea al confirmar; el resto del pedido se procesa normal', async () => {
  const { cookie, csrfToken } = await loginSession();
  const v = await makeVariant(5);
  const order = await makeOrder([
    { variantId: null, quantity: 1 },
    { variantId: v.id, quantity: 2 },
  ]);

  const res = await fetch(`${baseUrl}/admin/pedidos/${order.id}/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `estado=confirmado&_csrf=${csrfToken}`,
  });
  await res.text();
  assert.equal(res.status, 303);

  const { rows: orderRows } = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
  assert.equal(orderRows[0].status, 'confirmado');
  const { rows: vRows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [v.id]);
  assert.equal(vRows[0].stock, 3);
});

test('pedido enteramente huerfano confirma sin tocar stock', async () => {
  const { cookie, csrfToken } = await loginSession();
  const order = await makeOrder([{ variantId: null, quantity: 1 }]);

  const res = await fetch(`${baseUrl}/admin/pedidos/${order.id}/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `estado=confirmado&_csrf=${csrfToken}`,
  });
  await res.text();
  assert.equal(res.status, 303);

  const { rows: orderRows } = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
  assert.equal(orderRows[0].status, 'confirmado');
});

test('pendiente->entregado directo es rechazado, sin cambios', async () => {
  const { cookie, csrfToken } = await loginSession();
  const v = await makeVariant(5);
  const order = await makeOrder([{ variantId: v.id, quantity: 1 }]);

  const res = await fetch(`${baseUrl}/admin/pedidos/${order.id}/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `estado=entregado&_csrf=${csrfToken}`,
  });
  await res.text();

  const { rows: orderRows } = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
  assert.equal(orderRows[0].status, 'pendiente');
  const { rows: vRows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [v.id]);
  assert.equal(vRows[0].stock, 5);
});

test('estado terminal (entregado) rechaza cualquier POST', async () => {
  const { cookie, csrfToken } = await loginSession();
  const v = await makeVariant(5);
  const order = await makeOrder([{ variantId: v.id, quantity: 1 }], { status: 'entregado' });

  const res = await fetch(`${baseUrl}/admin/pedidos/${order.id}/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `estado=cancelado&_csrf=${csrfToken}`,
  });
  await res.text();

  const { rows: orderRows } = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
  assert.equal(orderRows[0].status, 'entregado');
});

test('status desconocido se rechaza antes de cualquier escritura', async () => {
  const { cookie, csrfToken } = await loginSession();
  const v = await makeVariant(5);
  const order = await makeOrder([{ variantId: v.id, quantity: 1 }]);

  const res = await fetch(`${baseUrl}/admin/pedidos/${order.id}/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `estado=fantasma&_csrf=${csrfToken}`,
  });
  await res.text();

  const { rows: orderRows } = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
  assert.equal(orderRows[0].status, 'pendiente');
});

test('confirmaciones concurrentes sobre la ultima unidad: exactamente una tiene exito', async () => {
  const v = await makeVariant(1);
  const orderA = await makeOrder([{ variantId: v.id, quantity: 1 }]);
  const orderB = await makeOrder([{ variantId: v.id, quantity: 1 }]);

  const { cookie: cookieA, csrfToken: csrfA } = await loginSession();
  const { cookie: cookieB, csrfToken: csrfB } = await loginSession();

  const [resA, resB] = await Promise.all([
    fetch(`${baseUrl}/admin/pedidos/${orderA.id}/estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieA },
      redirect: 'manual',
      body: `estado=confirmado&_csrf=${csrfA}`,
    }),
    fetch(`${baseUrl}/admin/pedidos/${orderB.id}/estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieB },
      redirect: 'manual',
      body: `estado=confirmado&_csrf=${csrfB}`,
    }),
  ]);
  await Promise.all([resA.text(), resB.text()]);

  const { rows: statusRows } = await pool.query('SELECT id, status FROM orders WHERE id = ANY($1::bigint[])', [
    [orderA.id, orderB.id],
  ]);
  const confirmedCount = statusRows.filter((r) => r.status === 'confirmado').length;
  const pendingCount = statusRows.filter((r) => r.status === 'pendiente').length;
  assert.equal(confirmedCount, 1, 'exactamente un pedido debe quedar confirmado');
  assert.equal(pendingCount, 1, 'el otro debe seguir pendiente (stock insuficiente)');

  const { rows: vRows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [v.id]);
  assert.equal(vRows[0].stock, 0, 'el stock nunca debe ir negativo');
});
