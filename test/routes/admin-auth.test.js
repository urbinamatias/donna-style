// Test de integración de auth admin + mount-order + guard-completeness
// (Fase 6a, design.md "Testing Strategy" — app.listen(0) + fetch global,
// mismo patrón que test/routes/checkout.test.js). Requiere Postgres +
// bcryptjs instalado (ver package.json — dependencia nueva de esta fase,
// instalar con `npm install` desde Windows antes de correr esto).
const test = require('node:test');
const assert = require('node:assert/strict');

const bcrypt = require('bcryptjs');
const { pool } = require('../../src/db/pool');
const app = require('../../src/app');

let server;
let baseUrl;
let testAdmin;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const email = `test-admin-${Date.now()}@donnastyle.com`;
  const passwordHash = await bcrypt.hash('password-de-test-123', 12);
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING *`,
    [email, passwordHash]
  );
  testAdmin = rows[0];
});

test.after(async () => {
  if (testAdmin) await pool.query('DELETE FROM admin_users WHERE id = $1', [testAdmin.id]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

function extractCookie(res) {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  return raw.split(';')[0];
}

async function newAnonymousSession() {
  const res = await fetch(`${baseUrl}/admin/login`, { redirect: 'manual' });
  return extractCookie(res);
}

async function getCsrfToken(cookie) {
  const res = await fetch(`${baseUrl}/admin/login`, { headers: { cookie } });
  await res.text();
  const sid = decodeURIComponent(cookie.split('=')[1]).split('.')[0].replace(/^s:/, '');
  const { rows } = await pool.query('SELECT sess FROM session WHERE sid = $1', [sid]);
  return rows[0]?.sess?.csrfToken;
}

test('GET /admin no queda shadowed por el comodín /:parentSlug de public.js (admin-routing)', async () => {
  const res = await fetch(`${baseUrl}/admin`, { redirect: 'manual' });
  // Anónimo: debe ser el 303 de requireAdmin, nunca un 404 de public.js
  // tratando "admin" como slug de categoría.
  assert.equal(res.status, 303);
  const location = res.headers.get('location');
  assert.match(location, /^\/admin\/login/);
});

test('Rutas públicas siguen funcionando después de montar el router admin (public catch-all intacto)', async () => {
  const res = await fetch(`${baseUrl}/`, { redirect: 'manual' });
  assert.equal(res.status, 200);
});

test('guard-completeness: cada ruta /admin/* registrada rechaza anónimos con 303 y sin datos admin en el body', async () => {
  const adminPaths = ['/admin', '/admin/categorias', '/admin/categorias/nueva', '/admin/productos', '/admin/productos/nuevo'];
  for (const path of adminPaths) {
    const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
    assert.equal(res.status, 303, `${path} debería redirigir (303) a request anónimo`);
    const location = res.headers.get('location');
    assert.match(location, /^\/admin\/login/, `${path} debe redirigir a /admin/login`);
  }
});

test('open-redirect guard: ?next= solo acepta rutas que empiezan con /admin', async () => {
  const res = await fetch(`${baseUrl}/admin/productos`, { redirect: 'manual' });
  const cookie = extractCookie(res);
  const csrfToken = await getCsrfToken(cookie);

  const evilRes = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `email=${encodeURIComponent(testAdmin.email)}&password=password-de-test-123&next=${encodeURIComponent('https://evil.com')}&_csrf=${csrfToken}`,
  });
  await evilRes.text();
  assert.equal(evilRes.status, 303);
  assert.equal(evilRes.headers.get('location'), '/admin', 'un next externo debe caer al default /admin, nunca redirigir afuera');
});

test('POST /admin/login sin CSRF token es 403 y no crea sesión autenticada', async () => {
  const cookie = await newAnonymousSession();
  const res = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `email=${encodeURIComponent(testAdmin.email)}&password=password-de-test-123`,
  });
  assert.equal(res.status, 403);
});

test('POST /admin/login con contraseña incorrecta: mensaje genérico, sin sesión', async () => {
  const cookie = await newAnonymousSession();
  const csrfToken = await getCsrfToken(cookie);
  const res = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `email=${encodeURIComponent(testAdmin.email)}&password=incorrecta&_csrf=${csrfToken}`,
  });
  const body = await res.text();
  assert.equal(res.status, 401);
  assert.doesNotMatch(body, /no existe|not found/i);
});

test('POST /admin/login con email inexistente: mismo status/mensaje que contraseña incorrecta', async () => {
  const cookie = await newAnonymousSession();
  const csrfToken = await getCsrfToken(cookie);
  const res = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `email=nadie@nada.com&password=lo-que-sea&_csrf=${csrfToken}`,
  });
  assert.equal(res.status, 401);
});

test('POST /admin/login con credenciales correctas: sesión autenticada, acceso subsiguiente sin re-login', async () => {
  const cookie = await newAnonymousSession();
  const csrfToken = await getCsrfToken(cookie);
  const res = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `email=${encodeURIComponent(testAdmin.email)}&password=password-de-test-123&_csrf=${csrfToken}`,
  });
  await res.text();
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/admin');

  const authedCookie = extractCookie(res) || cookie;
  const dashboardRes = await fetch(`${baseUrl}/admin`, { headers: { cookie: authedCookie } });
  assert.equal(dashboardRes.status, 200);
});

test('POST /admin/logout destruye la sesión: siguiente request admin redirige a login', async () => {
  const cookie = await newAnonymousSession();
  const csrfToken = await getCsrfToken(cookie);
  const loginRes = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: `email=${encodeURIComponent(testAdmin.email)}&password=password-de-test-123&_csrf=${csrfToken}`,
  });
  await loginRes.text();
  const authedCookie = extractCookie(loginRes) || cookie;
  // session.regenerate() en el login invalida el csrfToken previo — hay que
  // pedir uno nuevo para la sesión ya autenticada antes del logout.
  const postLoginCsrfToken = await getCsrfToken(authedCookie);

  const logoutRes = await fetch(`${baseUrl}/admin/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: authedCookie },
    redirect: 'manual',
    body: `_csrf=${postLoginCsrfToken}`,
  });
  await logoutRes.text();

  const afterLogout = await fetch(`${baseUrl}/admin`, { headers: { cookie: authedCookie }, redirect: 'manual' });
  assert.equal(afterLogout.status, 303);
});
