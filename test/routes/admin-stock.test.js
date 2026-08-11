// Test de integración del router de stock admin (Fase 6c, spec admin-stock).
// RED-first — este archivo se escribe ANTES de crear src/routes/admin/stock.js.
const test = require('node:test');
const assert = require('node:assert/strict');

const bcrypt = require('bcryptjs');
const { pool } = require('../../src/db/pool');
const { buildAdminTestApp } = require('./helpers/admin-test-app');
const stockRouter = require('../../src/routes/admin/stock');
const productsModel = require('../../src/models/products');
const variantsModel = require('../../src/models/variants');

const app = buildAdminTestApp([stockRouter]);

let server;
let baseUrl;
let testAdmin;
const createdProductIds = [];

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const email = `test-admin-stock-${Date.now()}@donnastyle.com`;
  const passwordHash = await bcrypt.hash('password-de-test-123', 12);
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING *`,
    [email, passwordHash]
  );
  testAdmin = rows[0];
});

test.after(async () => {
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

async function makeFixtureProduct(stocks) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const product = await productsModel.create({
    name: `Fixture Stock Route ${stamp}`,
    slug: `fixture-stock-route-${stamp}`,
    basePrice: 1000,
  });
  createdProductIds.push(product.id);
  const variants = await variantsModel.bulkCreate(
    product.id,
    stocks.map((stock, i) => ({ size: `T${i}`, sizeOrder: i, stock, sku: `fx-route-${stamp}-${i}` }))
  );
  return { product, variants };
}

test('GET /admin/stock sin sesión redirige a login', async () => {
  const res = await fetch(`${baseUrl}/admin/stock`, { redirect: 'manual' });
  await res.text();
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /\/admin\/login/);
});

test('GET /admin/stock: filtro por nombre de producto + bajo combinado trae exactamente las filas esperadas', async () => {
  const { cookie } = await loginSession();
  const { product: productA } = await makeFixtureProduct([0, 2, 7]);
  await makeFixtureProduct([1]);

  const res = await fetch(
    `${baseUrl}/admin/stock?q=${encodeURIComponent(productA.name)}&bajo=1`,
    { headers: { cookie } }
  );
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(body, /<td class="p-3">T0<\/td>/);
  assert.match(body, /<td class="p-3">T1<\/td>/);
  // `/T2/` a secas es frágil: el token CSRF es aleatorio por sesión y puede
  // contener esa substring por pura coincidencia entre sus caracteres
  // base64url (pasó en QA). Acotado a la celda real de la tabla, nunca
  // matchea contra el token.
  assert.doesNotMatch(body, /<td class="p-3">T2<\/td>/, 'la fila con stock 7 no debe listarse con bajo=1');
});

test('GET /admin/stock: nombre de producto parcial/case-insensitive/con acentos matchea (mismo criterio que el buscador público)', async () => {
  const { cookie } = await loginSession();
  const { product } = await makeFixtureProduct([3]);
  // El fixture arma el nombre como "Fixture Stock Route <timestamp>-<rand>":
  // buscar por un fragmento en minúsculas del medio del nombre real.
  const fragment = product.name.slice(0, 15).toLowerCase();

  const res = await fetch(`${baseUrl}/admin/stock?q=${encodeURIComponent(fragment)}`, { headers: { cookie } });
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(body, new RegExp(`<td class="p-3">${product.name}</td>`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('GET /admin/stock: término sin resultados responde 200 con la lista vacía, nunca 500', async () => {
  const { cookie } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/stock?q=${encodeURIComponent('zzz-no-existe-zzz')}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /No hay variantes para mostrar con este filtro\./);
});

test('GET /admin/stock: término con % _ \\ se trata como texto literal, nunca como wildcard ni rompe la query', async () => {
  const { cookie } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/stock?q=${encodeURIComponent('%_\\')}`, { headers: { cookie } });
  assert.equal(res.status, 200);
});

test('GET /admin/stock: término de más de 100 caracteres no rompe (se recorta, spec normalizeTerm)', async () => {
  const { cookie } = await loginSession();
  const longTerm = 'a'.repeat(500);
  const res = await fetch(`${baseUrl}/admin/stock?q=${encodeURIComponent(longTerm)}`, { headers: { cookie } });
  assert.equal(res.status, 200);
});

test('GET /admin/stock: q vacío o solo espacios no filtra, lista todo igual que sin query', async () => {
  const { cookie } = await loginSession();
  await makeFixtureProduct([4]);

  const withoutQuery = await fetch(`${baseUrl}/admin/stock`, { headers: { cookie } });
  const blankQuery = await fetch(`${baseUrl}/admin/stock?q=${encodeURIComponent('   ')}`, { headers: { cookie } });
  assert.equal(withoutQuery.status, 200);
  assert.equal(blankQuery.status, 200);
});

test('POST /admin/stock sin CSRF es 403 y no cambia nada', async () => {
  const { cookie } = await loginSession();
  const { variants } = await makeFixtureProduct([5]);
  const res = await fetch(`${baseUrl}/admin/stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `stock[v_${variants[0].id}]=9&original[v_${variants[0].id}]=5`,
  });
  await res.text();
  assert.equal(res.status, 403);

  const { rows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [variants[0].id]);
  assert.equal(rows[0].stock, 5);
});

test('POST /admin/stock: edición parcial persiste solo las filas cambiadas, en una transacción, con aviso', async () => {
  const { cookie, csrfToken } = await loginSession();
  const { variants } = await makeFixtureProduct([1, 2, 3]);

  const body = new URLSearchParams();
  body.set(`original[v_${variants[0].id}]`, '1');
  body.set(`stock[v_${variants[0].id}]`, '10'); // changed
  body.set(`original[v_${variants[1].id}]`, '2');
  body.set(`stock[v_${variants[1].id}]`, '2'); // unchanged
  body.set(`original[v_${variants[2].id}]`, '3');
  body.set(`stock[v_${variants[2].id}]`, '3'); // unchanged
  body.set('_csrf', csrfToken);

  const res = await fetch(`${baseUrl}/admin/stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: body.toString(),
  });
  await res.text();
  assert.equal(res.status, 303);

  const { rows } = await pool.query('SELECT id, stock FROM variants WHERE id = ANY($1::bigint[])', [
    variants.map((v) => v.id),
  ]);
  const byId = Object.fromEntries(rows.map((r) => [Number(r.id), r.stock]));
  assert.equal(byId[Number(variants[0].id)], 10);
  assert.equal(byId[Number(variants[1].id)], 2);
  assert.equal(byId[Number(variants[2].id)], 3);
});

test('POST /admin/stock: sin cambios no escribe nada', async () => {
  const { cookie, csrfToken } = await loginSession();
  const { variants } = await makeFixtureProduct([4]);

  const body = new URLSearchParams();
  body.set(`original[v_${variants[0].id}]`, '4');
  body.set(`stock[v_${variants[0].id}]`, '4');
  body.set('_csrf', csrfToken);

  const res = await fetch(`${baseUrl}/admin/stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: body.toString(),
  });
  await res.text();
  assert.equal(res.status, 303);

  const { rows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [variants[0].id]);
  assert.equal(rows[0].stock, 4);
});

test('POST /admin/stock: valor inválido (negativo/decimal/no numérico) rechaza TODO el submit', async () => {
  const { cookie, csrfToken } = await loginSession();
  const { product, variants } = await makeFixtureProduct([1, 2]);

  const body = new URLSearchParams();
  body.set(`original[v_${variants[0].id}]`, '1');
  body.set(`stock[v_${variants[0].id}]`, '-3'); // invalid
  body.set(`original[v_${variants[1].id}]`, '2');
  body.set(`stock[v_${variants[1].id}]`, '9'); // otherwise valid change
  body.set('_csrf', csrfToken);

  const res = await fetch(`${baseUrl}/admin/stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: body.toString(),
  });
  await res.text();

  const { rows } = await pool.query('SELECT id, stock FROM variants WHERE id = ANY($1::bigint[])', [
    variants.map((v) => v.id),
  ]);
  const byId = Object.fromEntries(rows.map((r) => [Number(r.id), r.stock]));
  assert.equal(byId[Number(variants[0].id)], 1, 'ninguna fila debe escribirse, ni siquiera la válida');
  assert.equal(byId[Number(variants[1].id)], 2);

  // Bug QA fase 6c: el aviso de error nombraba el id interno de la variante
  // ("variante 3"), inservible para la dueña con varias filas editadas a la
  // vez. Debe identificarla por producto + talle/color, algo que puede ver
  // en la propia tabla.
  const location = res.headers.get('location');
  const followRes = await fetch(`${baseUrl}${location}`, { headers: { cookie } });
  const followBody = await followRes.text();
  assert.match(followBody, new RegExp(product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(followBody, /T0/);
});

test('POST /admin/stock: id de variante inexistente se ignora sin abortar las filas válidas', async () => {
  const { cookie, csrfToken } = await loginSession();
  const { variants } = await makeFixtureProduct([1]);
  const bogusId = 999999999;

  const body = new URLSearchParams();
  body.set(`original[v_${variants[0].id}]`, '1');
  body.set(`stock[v_${variants[0].id}]`, '8');
  body.set(`original[v_${bogusId}]`, '0');
  body.set(`stock[v_${bogusId}]`, '5');
  body.set('_csrf', csrfToken);

  const res = await fetch(`${baseUrl}/admin/stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: body.toString(),
  });
  await res.text();
  assert.equal(res.status, 303);

  const { rows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [variants[0].id]);
  assert.equal(rows[0].stock, 8);
});
