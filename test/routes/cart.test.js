// Test de integración de rutas de carrito (design.md "Testing Strategy" —
// app.listen(0) + fetch global de Node 20, sin dependencia nueva de test).
// Requiere Postgres de desarrollo + `node db/seed.js` + `node db/migrate.js`
// (crea `session` via 006_session.sql) + `npm install` (express-session,
// connect-pg-simple) ya corridos.
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
  const res = await fetch(`${baseUrl}/carrito/estado`, {
    headers: { cookie, Accept: 'application/json' },
  });
  await res.json();
  // El token vive en la sesión, no en el body; lo leemos directo de la DB
  // de sesión para no acoplar el test a exponerlo en cada respuesta JSON.
  const sid = decodeURIComponent(cookie.split('=')[1]).split('.')[0].replace(/^s:/, '');
  const { rows } = await pool.query('SELECT sess FROM session WHERE sid = $1', [sid]);
  return rows[0]?.sess?.csrfToken;
}

test('GET /carrito no queda shadowed por el comodín /:parentSlug (design.md D7)', async () => {
  const res = await fetch(`${baseUrl}/carrito`);
  assert.equal(res.status, 200);
});

// Fase 7 (spec "Non-indexable pages carry noindex" / "Cart"): /carrito debe
// llevar noindex y título propio, sin ningún tag og: (buildPrivateSeo no
// emite OG — invariante noindex === true ⇒ sin OG/canonical).
test('GET /carrito: noindex, título propio, sin tags og:', async () => {
  const res = await fetch(`${baseUrl}/carrito`);
  const html = await res.text();
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(/<title>Carrito[^<]*<\/title>/.test(html));
  assert.ok(!html.includes('property="og:'));
  assert.ok(!html.includes('<link rel="canonical"'));
});

test('POST /carrito/agregar sin CSRF token es 403 y no muta el carrito', async () => {
  const cookie = await newSession();
  const { rows } = await pool.query('SELECT id FROM variants WHERE stock > 0 LIMIT 1');
  assert.ok(rows.length > 0, 'seed debe tener al menos una variante con stock');

  const res = await fetch(`${baseUrl}/carrito/agregar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `variant_id=${rows[0].id}`,
  });
  assert.equal(res.status, 403);
});

test('POST /carrito/agregar con variant_id inexistente/agotado es 400, sin mutar el carrito', async () => {
  const cookie = await newSession();
  const csrfToken = await getCsrfToken(cookie);

  const res = await fetch(`${baseUrl}/carrito/agregar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie, Accept: 'application/json' },
    body: `variant_id=999999999&_csrf=${csrfToken}`,
  });
  assert.equal(res.status, 400);

  const stateRes = await fetch(`${baseUrl}/carrito/estado`, { headers: { cookie, Accept: 'application/json' } });
  const state = await stateRes.json();
  assert.equal(state.count, 0);
});

test('POST /carrito/agregar con variant_id válido crea la línea y persiste entre requests', async () => {
  const cookie = await newSession();
  const csrfToken = await getCsrfToken(cookie);
  const { rows } = await pool.query('SELECT id, stock FROM variants WHERE stock > 0 LIMIT 1');
  const variant = rows[0];

  const res = await fetch(`${baseUrl}/carrito/agregar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie, Accept: 'application/json' },
    body: `variant_id=${variant.id}&_csrf=${csrfToken}`,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.count, 1);

  const stateRes = await fetch(`${baseUrl}/carrito/estado`, { headers: { cookie, Accept: 'application/json' } });
  const state = await stateRes.json();
  assert.equal(state.count, 1);
  assert.equal(state.lines[0].variantId, Number(variant.id));
});

// Bug QA (revierte la decisión original de Fase 4): pedir más cantidad que
// el stock disponible ya NO se cappea en silencio — se rechaza con un
// mensaje claro y el carrito queda sin mutar. La clienta se enteraba recién
// en el carrito de que su pedido real no se había cumplido.
test('POST /carrito/agregar cantidad pedida por encima del stock vivo se rechaza (400), no se cappea', async () => {
  const cookie = await newSession();
  const csrfToken = await getCsrfToken(cookie);
  const { rows } = await pool.query('SELECT id, stock FROM variants WHERE stock > 0 AND stock < 50 ORDER BY stock ASC LIMIT 1');
  const variant = rows[0];

  const res = await fetch(`${baseUrl}/carrito/agregar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie, Accept: 'application/json' },
    body: `variant_id=${variant.id}&quantity=${variant.stock + 50}&_csrf=${csrfToken}`,
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, new RegExp(String(variant.stock)));

  const stateRes = await fetch(`${baseUrl}/carrito/estado`, { headers: { cookie, Accept: 'application/json' } });
  const state = await stateRes.json();
  assert.equal(state.count, 0, 'el rechazo no debe mutar el carrito');
});

test('POST /carrito/agregar: pedir de a poco hasta superar el stock también se rechaza (suma lo ya agregado)', async () => {
  const cookie = await newSession();
  const csrfToken = await getCsrfToken(cookie);
  const { rows } = await pool.query('SELECT id, stock FROM variants WHERE stock >= 2 AND stock < 50 ORDER BY stock ASC LIMIT 1');
  const variant = rows[0];

  await fetch(`${baseUrl}/carrito/agregar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie, Accept: 'application/json' },
    body: `variant_id=${variant.id}&quantity=${variant.stock}&_csrf=${csrfToken}`,
  }).then((r) => r.json());

  const res = await fetch(`${baseUrl}/carrito/agregar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie, Accept: 'application/json' },
    body: `variant_id=${variant.id}&quantity=1&_csrf=${csrfToken}`,
  });
  assert.equal(res.status, 400, 'ya está el máximo en el carrito, sumar 1 más debe rechazarse');

  const stateRes = await fetch(`${baseUrl}/carrito/estado`, { headers: { cookie, Accept: 'application/json' } });
  const state = await stateRes.json();
  assert.equal(state.count, variant.stock, 'la línea existente no debe alterarse por el intento rechazado');
});

test('POST /carrito/actualizar: cantidad por encima del stock vivo se rechaza (400), no se cappea', async () => {
  const cookie = await newSession();
  const csrfToken = await getCsrfToken(cookie);
  const { rows } = await pool.query('SELECT id, stock FROM variants WHERE stock > 0 AND stock < 50 ORDER BY stock ASC LIMIT 1');
  const variant = rows[0];

  await fetch(`${baseUrl}/carrito/agregar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie, Accept: 'application/json' },
    body: `variant_id=${variant.id}&quantity=1&_csrf=${csrfToken}`,
  }).then((r) => r.json());

  const res = await fetch(`${baseUrl}/carrito/actualizar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie, Accept: 'application/json' },
    body: `variant_id=${variant.id}&quantity=${variant.stock + 50}&_csrf=${csrfToken}`,
  });
  assert.equal(res.status, 400);

  const stateRes = await fetch(`${baseUrl}/carrito/estado`, { headers: { cookie, Accept: 'application/json' } });
  const state = await stateRes.json();
  assert.equal(state.count, 1, 'el rechazo no debe alterar la cantidad ya guardada');
});
