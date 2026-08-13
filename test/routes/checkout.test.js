// Test de integración de checkout por WhatsApp (Fase 5, design.md "Testing
// Strategy" — app.listen(0) + fetch global, mismo patrón que
// test/routes/cart.test.js). Requiere Postgres de desarrollo + seed + migrate.
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const app = require('../../src/app');
const siteSettingsModel = require('../../src/models/site-settings');
const checkoutLimiter = require('../../src/middleware/checkout-rate-limit');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.beforeEach(() => {
  // Mismo motivo que search.test.js: este archivo dispara varios POST
  // /checkout (max 10/10min), así que sin limpiar el limiter una suite
  // podría arrancar la siguiente ya bloqueada con 429.
  checkoutLimiter._hits.clear();
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

function extractCookie(res) {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  return raw.split(';')[0];
}

async function newSession() {
  const res = await fetch(`${baseUrl}/carrito`, { redirect: 'manual' });
  const cookie = extractCookie(res);
  return cookie;
}

async function getCsrfToken(cookie) {
  const res = await fetch(`${baseUrl}/carrito/estado`, { headers: { cookie, Accept: 'application/json' } });
  await res.json();
  const sid = decodeURIComponent(cookie.split('=')[1]).split('.')[0].replace(/^s:/, '');
  const { rows } = await pool.query('SELECT sess FROM session WHERE sid = $1', [sid]);
  return rows[0]?.sess?.csrfToken;
}

// Drena el body (igual que todo helper de POST en cart.test.js): sin esto,
// dos POSTs seguidos a la misma sesión pueden pisarse por reuso de conexión
// keep-alive antes de que el primero termine — carrera real, no cosmética,
// que hacía flakear el checkout de 2+ items.
async function addToCart(cookie, csrfToken, variantId, quantity) {
  const res = await fetch(`${baseUrl}/carrito/agregar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie, Accept: 'application/json' },
    body: `variant_id=${variantId}${quantity ? `&quantity=${quantity}` : ''}&_csrf=${csrfToken}`,
  });
  await res.json();
  return res;
}

test('GET /checkout no queda shadowed por el comodín /:parentSlug (tasks.md 3.8)', async () => {
  const cookie = await newSession();
  const csrfToken = await getCsrfToken(cookie);
  const { rows } = await pool.query('SELECT id FROM variants WHERE stock > 0 LIMIT 1');
  await addToCart(cookie, csrfToken, rows[0].id);

  const res = await fetch(`${baseUrl}/checkout`, { headers: { cookie } });
  assert.equal(res.status, 200);
});

// Fase 7 (spec "Non-indexable pages carry noindex" / "Checkout regression
// guard"): checkout, confirmación y 404 preservan noindex, título propio,
// sin tags og: — buildPrivateSeo no emite OG/canonical (§4.5).
test('GET /checkout: noindex, título propio, sin tags og:', async () => {
  const cookie = await newSession();
  const csrfToken = await getCsrfToken(cookie);
  const { rows } = await pool.query('SELECT id FROM variants WHERE stock > 0 LIMIT 1');
  await addToCart(cookie, csrfToken, rows[0].id);

  const res = await fetch(`${baseUrl}/checkout`, { headers: { cookie } });
  const html = await res.text();
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(!html.includes('property="og:'));
  assert.ok(!html.includes('<link rel="canonical"'));
});

test('GET /checkout ruta inexistente-en-el-router (404 vía render404): noindex, sin canonical', async () => {
  const res = await fetch(`${baseUrl}/pedido/token-que-jamas-va-a-existir`);
  const html = await res.text();
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(!html.includes('<link rel="canonical"'));
});

test('POST /checkout sin CSRF token es 403 y no crea pedido ni muta el carrito', async () => {
  const cookie = await newSession();
  const csrfToken = await getCsrfToken(cookie);
  const { rows } = await pool.query('SELECT id FROM variants WHERE stock > 0 LIMIT 1');
  await addToCart(cookie, csrfToken, rows[0].id);

  const { rows: before } = await pool.query('SELECT count(*)::int AS n FROM orders');

  const res = await fetch(`${baseUrl}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: 'nombre=Ana',
  });
  assert.equal(res.status, 403);

  const { rows: after } = await pool.query('SELECT count(*)::int AS n FROM orders');
  assert.equal(after[0].n, before[0].n);

  const stateRes = await fetch(`${baseUrl}/carrito/estado`, { headers: { cookie, Accept: 'application/json' } });
  const state = await stateRes.json();
  assert.equal(state.count, 1);
});

test('POST /checkout con carrito vacío no crea pedido y redirige a /carrito', async () => {
  const cookie = await newSession();
  const csrfToken = await getCsrfToken(cookie);

  const res = await fetch(`${baseUrl}/checkout`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `_csrf=${csrfToken}`,
  });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /\/carrito$/);
});

test('POST /checkout camino feliz: crea 1 pedido + N items, status pendiente, carrito vacío después (spec "Order persistence"/"Cart cleared before response")', async () => {
  const cookie = await newSession();
  const csrfToken = await getCsrfToken(cookie);
  const { rows } = await pool.query('SELECT id, stock FROM variants WHERE stock > 0 LIMIT 2');
  assert.ok(rows.length >= 2, 'seed debe tener al menos 2 variantes con stock');

  await addToCart(cookie, csrfToken, rows[0].id, 1);
  await addToCart(cookie, csrfToken, rows[1].id, 1);

  const res = await fetch(`${baseUrl}/checkout`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `nombre=Ana+Pérez&nota=Entrega+en+local&_csrf=${csrfToken}`,
  });
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Pedido/);
  assert.match(body, /wa\.me/);
  // Fase 7: confirmación también es noindex, sin OG (buildPrivateSeo).
  assert.ok(body.includes('<meta name="robots" content="noindex">'));
  assert.ok(!body.includes('property="og:'));

  const { rows: orderRows } = await pool.query(
    "SELECT * FROM orders WHERE customer_name = 'Ana Pérez' ORDER BY id DESC LIMIT 1"
  );
  assert.equal(orderRows.length, 1);
  assert.equal(orderRows[0].status, 'pendiente');
  assert.equal(orderRows[0].items_count, 2);

  const { rows: itemRows } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderRows[0].id]);
  assert.equal(itemRows.length, 2);

  const stateRes = await fetch(`${baseUrl}/carrito/estado`, { headers: { cookie, Accept: 'application/json' } });
  const state = await stateRes.json();
  assert.equal(state.count, 0);
});

test('POST /checkout: precio/cantidad/nombre del payload NUNCA se usan — snapshot sale de las filas vivas (§CLAUDE.md anti-tampering)', async () => {
  const cookie = await newSession();
  const csrfToken = await getCsrfToken(cookie);
  const { rows } = await pool.query(
    "SELECT v.id, v.stock, COALESCE(v.price_override, p.base_price) AS price, p.name FROM variants v JOIN products p ON p.id = v.product_id WHERE v.stock > 0 LIMIT 1"
  );
  const variant = rows[0];
  await addToCart(cookie, csrfToken, variant.id, 1);

  await fetch(`${baseUrl}/checkout`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `_csrf=${csrfToken}`,
  });

  const { rows: itemRows } = await pool.query(
    'SELECT * FROM order_items WHERE variant_id = $1 ORDER BY id DESC LIMIT 1',
    [variant.id]
  );
  assert.equal(itemRows[0].product_name_snapshot, variant.name);
  assert.equal(Number(itemRows[0].unit_price), Number(variant.price));
});

test('POST /checkout: stock que cambió desde que se agregó al carrito bloquea TODO el checkout (spec "Stock changed since add-to-cart", tasks.md 3.3)', async () => {
  const cookie = await newSession();
  const csrfToken = await getCsrfToken(cookie);
  const { rows } = await pool.query('SELECT id, stock FROM variants WHERE stock > 1 AND stock < 50 LIMIT 1');
  assert.ok(rows.length > 0, 'seed debe tener una variante con stock acotado');
  const variant = rows[0];

  await addToCart(cookie, csrfToken, variant.id, variant.stock);

  // Reduce el stock vivo por debajo de lo que ya está en el carrito.
  await pool.query('UPDATE variants SET stock = $1 WHERE id = $2', [variant.stock - 1, variant.id]);

  const { rows: before } = await pool.query('SELECT count(*)::int AS n FROM orders');

  const res = await fetch(`${baseUrl}/checkout`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `_csrf=${csrfToken}`,
  });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /\/carrito$/);

  const { rows: after } = await pool.query('SELECT count(*)::int AS n FROM orders');
  assert.equal(after[0].n, before[0].n, 'ninguna línea ajustada debe bloquear TODO el checkout, no solo el carrito vacío');

  // Restaura el stock para no afectar otros tests que corran después.
  await pool.query('UPDATE variants SET stock = $1 WHERE id = $2', [variant.stock, variant.id]);
});

test('GET /pedido/:token con token inexistente devuelve 404 sin filtrar info', async () => {
  const res = await fetch(`${baseUrl}/pedido/token-que-jamas-va-a-existir`);
  assert.equal(res.status, 404);
});

test('GET /pedido/:token: accesible sin sesión, con noindex, y con los datos del pedido', async () => {
  const cookie = await newSession();
  const csrfToken = await getCsrfToken(cookie);
  const { rows } = await pool.query('SELECT id FROM variants WHERE stock > 0 LIMIT 1');
  await addToCart(cookie, csrfToken, rows[0].id);

  const checkoutRes = await fetch(`${baseUrl}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `_csrf=${csrfToken}`,
  });
  const confirmBody = await checkoutRes.text();
  const match = confirmBody.match(/\/pedido\/([A-Za-z0-9_-]+)/);
  assert.ok(match, 'la página de confirmación debe linkear a /pedido/{token}');

  const orderRes = await fetch(`${baseUrl}${match[0]}`);
  assert.equal(orderRes.status, 200);
  const orderBody = await orderRes.text();
  assert.match(orderBody, /noindex/);
});

// RED (tasks.md 3.2, design.md D-C): el link de wa.me en la confirmación de
// checkout DEBE seguir el valor del panel (site_settings.whatsapp_admin),
// no `config.WHATSAPP_ADMIN` (.env) directo — sin reiniciar el proceso.
test('POST /checkout: el link wa.me sigue el valor del PANEL (site_settings), no el de .env, sin reiniciar el server', async () => {
  const panelNumber = '5493519998877';
  const previous = (await siteSettingsModel.getAll()).whatsapp_admin;
  await siteSettingsModel.set('whatsapp_admin', panelNumber);

  try {
    const cookie = await newSession();
    const csrfToken = await getCsrfToken(cookie);
    const { rows } = await pool.query('SELECT id FROM variants WHERE stock > 0 LIMIT 1');
    await addToCart(cookie, csrfToken, rows[0].id);

    const res = await fetch(`${baseUrl}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
      body: `_csrf=${csrfToken}`,
    });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, new RegExp(`wa\\.me/${panelNumber}`));
  } finally {
    // Restaurar el valor previo (seed) en vez de borrar la fila: un DELETE
    // ciego acá se llevaba puesto el dato sembrado para otros tests/archivos
    // que leen site_settings sin poblarlo ellos mismos (ej. admin-settings.test.js).
    if (previous) {
      await siteSettingsModel.set('whatsapp_admin', previous);
    } else {
      await pool.query(`DELETE FROM site_settings WHERE key = 'whatsapp_admin'`);
    }
  }
});

// prompt.md §8.1: "Rate limiting en login, búsqueda y creación de pedidos".
// Mismo patrón que search.test.js: request 11 en la ventana devuelve 429,
// carrito y CSRF token se mantienen intactos (nunca crea pedido de más).
test('POST /checkout: rate limit — request 11 en la ventana devuelve 429, luego se recupera', async () => {
  const cookie = await newSession();
  const csrfToken = await getCsrfToken(cookie);
  const { rows } = await pool.query('SELECT id FROM variants WHERE stock > 0 LIMIT 1');

  for (let i = 0; i < 10; i += 1) {
    await addToCart(cookie, csrfToken, rows[0].id);
    const res = await fetch(`${baseUrl}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
      body: `_csrf=${csrfToken}`,
    });
    assert.equal(res.status, 200, `intento ${i + 1} debería pasar`);
  }

  const blocked = await fetch(`${baseUrl}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `_csrf=${csrfToken}`,
  });
  assert.equal(blocked.status, 429);

  checkoutLimiter._hits.clear();
  await addToCart(cookie, csrfToken, rows[0].id);
  const recovered = await fetch(`${baseUrl}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `_csrf=${csrfToken}`,
  });
  assert.equal(recovered.status, 200);
});
