// RED (tasks.md 2.4, design.md D-C/D-D): integración real Postgres + server
// real (mismo patrón que admin-categories.test.js). Cubre GET/POST
// /admin/configuracion: render de los 4 campos + preview wa.me + nota D6,
// guardado válido vía setMany, requeridos vacíos rechazados sin perder el
// valor anterior, CUIT con check digit inválido guarda + warning (nunca
// bloquea, decisión de negocio cerrada), CUIT de longitud incorrecta sí
// bloquea (error de formato, no de check digit).
const test = require('node:test');
const assert = require('node:assert/strict');

const bcrypt = require('bcryptjs');
const { pool } = require('../../src/db/pool');
const app = require('../../src/app');
const siteSettingsModel = require('../../src/models/site-settings');

let server;
let baseUrl;
let testAdmin;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const email = `test-admin-settings-${Date.now()}@donnastyle.com`;
  const passwordHash = await bcrypt.hash('password-de-test-123', 12);
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING *`,
    [email, passwordHash]
  );
  testAdmin = rows[0];

  // Semilla propia en vez de depender de `node db/seed.js` ya corrido: este
  // archivo no debe asumir estado externo. Sin esto, el GET inicial (preview
  // wa.me) fallaba si otro test/corrida previa había vaciado site_settings
  // sin resembrar — test.after ya limpia estas 4 claves al final, así que
  // sembrarlas acá es seguro y deja el archivo autocontenido.
  await siteSettingsModel.set('whatsapp_admin', '5493517505083');
});

test.after(async () => {
  if (testAdmin) await pool.query('DELETE FROM admin_users WHERE id = $1', [testAdmin.id]);
  await pool.query(
    `DELETE FROM site_settings WHERE key IN ('whatsapp_admin', 'instagram', 'email_contacto', 'cuit')`
  );
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

test('GET /admin/configuracion: renderiza los 4 campos, preview wa.me y la nota de deuda D6', async () => {
  const { cookie } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/configuracion`, { headers: { cookie } });
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /name="whatsapp_admin"/);
  assert.match(html, /name="instagram"/);
  assert.match(html, /name="email_contacto"/);
  assert.match(html, /name="cuit"/);
  assert.match(html, /wa\.me/);
  assert.match(html, /page_/i, 'debe mencionar que los textos institucionales page_* no se editan acá');
});

test('POST /admin/configuracion: guarda los 4 valores válidos vía setMany, el panel lee el nuevo valor', async () => {
  const { cookie, csrfToken } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/configuracion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: new URLSearchParams({
      _csrf: csrfToken,
      whatsapp_admin: '+54 9 351 111-2222',
      instagram: 'donna_test',
      email_contacto: 'test@donnastyle.com',
      cuit: '27-29456245-7',
    }).toString(),
  });
  assert.ok([302, 303].includes(res.status));

  const saved = await siteSettingsModel.getAll();
  assert.equal(saved.whatsapp_admin, '5493511112222');
  assert.equal(saved.instagram, '@donna_test');
  assert.equal(saved.email_contacto, 'test@donnastyle.com');
  assert.equal(saved.cuit, '27-29456245-7');
});

test('POST /admin/configuracion: whatsapp_admin vacío se rechaza y NO pisa el valor anterior', async () => {
  const { cookie, csrfToken } = await loginSession();
  await siteSettingsModel.set('whatsapp_admin', '5493519999999');

  const res = await fetch(`${baseUrl}/admin/configuracion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({
      _csrf: csrfToken,
      whatsapp_admin: '',
      instagram: '',
      email_contacto: '',
      cuit: '27-29456245-7',
    }).toString(),
  });
  assert.equal(res.status, 400);
  const html = await res.text();
  assert.match(html, /obligatorio/i);

  const saved = await siteSettingsModel.getAll();
  assert.equal(saved.whatsapp_admin, '5493519999999', 'el valor previo debe seguir intacto');
});

test('POST /admin/configuracion: cuit vacío se rechaza (campo requerido)', async () => {
  const { cookie, csrfToken } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/configuracion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({
      _csrf: csrfToken,
      whatsapp_admin: '5493511112222',
      instagram: '',
      email_contacto: '',
      cuit: '',
    }).toString(),
  });
  assert.equal(res.status, 400);
});

test('POST /admin/configuracion: CUIT con dígito verificador que no cierra mod-11 SE GUARDA con warning (nunca bloquea)', async () => {
  const { cookie, csrfToken } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/configuracion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: new URLSearchParams({
      _csrf: csrfToken,
      whatsapp_admin: '5493511112222',
      instagram: '',
      email_contacto: '',
      cuit: '27-29456245-9',
    }).toString(),
  });
  assert.ok([302, 303].includes(res.status), 'un CUIT con check digit inválido nunca bloquea el guardado');

  const saved = await siteSettingsModel.getAll();
  assert.equal(saved.cuit, '27-29456245-9');
});

test('POST /admin/configuracion: CUIT con cantidad de dígitos incorrecta SÍ bloquea (error de formato, no de check digit)', async () => {
  const { cookie, csrfToken } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/configuracion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({
      _csrf: csrfToken,
      whatsapp_admin: '5493511112222',
      instagram: '',
      email_contacto: '',
      cuit: '27-2945-7',
    }).toString(),
  });
  assert.equal(res.status, 400);
});

test('POST /admin/configuracion: instagram y email vacíos son válidos (campos opcionales)', async () => {
  const { cookie, csrfToken } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/configuracion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: new URLSearchParams({
      _csrf: csrfToken,
      whatsapp_admin: '5493511112222',
      instagram: '',
      email_contacto: '',
      cuit: '27-29456245-7',
    }).toString(),
  });
  assert.ok([302, 303].includes(res.status));

  const saved = await siteSettingsModel.getAll();
  assert.equal(saved.instagram, '');
  assert.equal(saved.email_contacto, '');
});

test('POST /admin/configuracion sin CSRF token es 403 y no guarda nada', async () => {
  const { cookie } = await loginSession();
  await siteSettingsModel.set('whatsapp_admin', '5493518888888');

  const res = await fetch(`${baseUrl}/admin/configuracion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({
      whatsapp_admin: '5493511112222',
      instagram: '',
      email_contacto: '',
      cuit: '27-29456245-7',
    }).toString(),
  });
  assert.equal(res.status, 403);

  const saved = await siteSettingsModel.getAll();
  assert.equal(saved.whatsapp_admin, '5493518888888');
});
