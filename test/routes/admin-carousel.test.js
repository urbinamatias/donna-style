// RED (tasks.md 2.9, design.md D-A/D-B/D-E, Threat Matrix); QA fase 6d
// ronda 2: integración real Postgres + server real (mismo patrón que
// admin-product-images.test.js — fetch nativo, sin supertest). Cubre:
// banner de 0/1/2+ slides visibles, creación desde UN solo archivo (un
// único derivado sin recorte, perfil `carousel`), rechazo de imagen chica/
// no-imagen, CSRF multipart, edición sin re-upload, ventana de fechas
// inválida, reorder con boundary, hard-delete de los 3 archivos derivados,
// route-shadowing.
const test = require('node:test');
const assert = require('node:assert/strict');

const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('../../src/db/pool');
const app = require('../../src/app');

let server;
let baseUrl;
let testAdmin;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const email = `test-admin-carousel-${Date.now()}@donnastyle.com`;
  const passwordHash = await bcrypt.hash('password-de-test-123', 12);
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING *`,
    [email, passwordHash]
  );
  testAdmin = rows[0];
});

test.after(async () => {
  await pool.query(`DELETE FROM carousel_slides WHERE base_key LIKE 'test-%' OR alt_text LIKE 'Test%'`);
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

// 1600x1200 respeta el mínimo del perfil carousel (ancho >= 1200, sin
// recorte — design.md D-A, QA fase 6d ronda 2).
async function validSlideBuffer() {
  return sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .jpeg()
    .toBuffer();
}

async function tooSmallBuffer() {
  return sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .jpeg()
    .toBuffer();
}

test('GET /admin/carrusel: 0 slides visibles -> banner dice que el carrusel queda oculto', async () => {
  const { cookie } = await loginSession();
  await pool.query('UPDATE carousel_slides SET is_active = false');

  const res = await fetch(`${baseUrl}/admin/carrusel`, { headers: { cookie } });
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /oculto/i);
});

test('GET /admin/carrusel: exactamente 1 slide visible -> banner dice que queda fijo', async () => {
  const { cookie } = await loginSession();
  await pool.query('UPDATE carousel_slides SET is_active = false');
  await pool.query(
    `INSERT INTO carousel_slides (base_key, alt_text, sort_order, is_active) VALUES ('test-banner-1', 'Test banner 1', 500, true)`
  );

  const res = await fetch(`${baseUrl}/admin/carrusel`, { headers: { cookie } });
  const html = await res.text();
  assert.match(html, /fij[oa]/i);

  await pool.query(`DELETE FROM carousel_slides WHERE base_key = 'test-banner-1'`);
});

test('GET /admin/carrusel: 2+ slides visibles -> banner dice que rota', async () => {
  const { cookie } = await loginSession();
  await pool.query('UPDATE carousel_slides SET is_active = false');
  await pool.query(
    `INSERT INTO carousel_slides (base_key, alt_text, sort_order, is_active) VALUES
      ('test-banner-2a', 'Test banner 2a', 501, true),
      ('test-banner-2b', 'Test banner 2b', 502, true)`
  );

  const res = await fetch(`${baseUrl}/admin/carrusel`, { headers: { cookie } });
  const html = await res.text();
  assert.match(html, /rota/i);

  await pool.query(`DELETE FROM carousel_slides WHERE base_key IN ('test-banner-2a', 'test-banner-2b')`);
});

test('POST /admin/carrusel: crea slide desde UN solo archivo, un único derivado sin recorte', async () => {
  const { cookie, csrfToken } = await loginSession();
  const buffer = await validSlideBuffer();

  const form = new FormData();
  form.append('_csrf', csrfToken);
  form.append('alt_text', 'Test slide creado');
  form.append('image', new Blob([buffer], { type: 'image/jpeg' }), 'slide.jpg');

  const res = await fetch(`${baseUrl}/admin/carrusel`, {
    method: 'POST',
    headers: { cookie },
    body: form,
    redirect: 'manual',
  });
  assert.ok([302, 303].includes(res.status));

  const { rows } = await pool.query(`SELECT * FROM carousel_slides WHERE alt_text = 'Test slide creado'`);
  assert.equal(rows.length, 1);
  const slide = rows[0];
  assert.match(slide.base_key, /^[a-z0-9-]+$/);

  const uploadsRoot = path.join(__dirname, '..', '..', 'src', 'public', 'uploads', 'carousel');
  for (const width of [768, 1280, 1920]) {
    const filePath = path.join(uploadsRoot, `${slide.base_key}-${width}.webp`);
    await assert.doesNotReject(() => fs.access(filePath), `debe existir ${filePath}`);
  }

  // Cleanup manual de archivos (el modelo/test de delete se cubre aparte).
  for (const width of [768, 1280, 1920]) {
    await fs.unlink(path.join(uploadsRoot, `${slide.base_key}-${width}.webp`)).catch(() => {});
  }
});

test('POST /admin/carrusel: imagen por debajo del mínimo del perfil se rechaza, sin fila ni archivo', async () => {
  const { cookie, csrfToken } = await loginSession();
  const buffer = await tooSmallBuffer();

  const form = new FormData();
  form.append('_csrf', csrfToken);
  form.append('alt_text', 'Test slide chico');
  form.append('image', new Blob([buffer], { type: 'image/jpeg' }), 'chico.jpg');

  const res = await fetch(`${baseUrl}/admin/carrusel`, { method: 'POST', headers: { cookie }, body: form });
  assert.equal(res.status, 400);

  const { rows } = await pool.query(`SELECT * FROM carousel_slides WHERE alt_text = 'Test slide chico'`);
  assert.equal(rows.length, 0);
});

test('POST /admin/carrusel: contenido no-imagen con extensión de imagen se rechaza antes de procesar', async () => {
  const { cookie, csrfToken } = await loginSession();

  const form = new FormData();
  form.append('_csrf', csrfToken);
  form.append('alt_text', 'Test no imagen');
  form.append('image', new Blob([Buffer.from('esto no es una imagen')], { type: 'image/jpeg' }), 'fake.jpg');

  const res = await fetch(`${baseUrl}/admin/carrusel`, { method: 'POST', headers: { cookie }, body: form });
  assert.equal(res.status, 400);

  const { rows } = await pool.query(`SELECT * FROM carousel_slides WHERE alt_text = 'Test no imagen'`);
  assert.equal(rows.length, 0);
});

test('POST /admin/carrusel sin token CSRF es 403 y no persiste nada', async () => {
  const { cookie } = await loginSession();
  const buffer = await validSlideBuffer();

  const form = new FormData();
  form.append('alt_text', 'Test sin csrf');
  form.append('image', new Blob([buffer], { type: 'image/jpeg' }), 'slide.jpg');

  const res = await fetch(`${baseUrl}/admin/carrusel`, { method: 'POST', headers: { cookie }, body: form });
  assert.equal(res.status, 403);

  const { rows } = await pool.query(`SELECT * FROM carousel_slides WHERE alt_text = 'Test sin csrf'`);
  assert.equal(rows.length, 0);
});

test('POST /admin/carrusel/:id: edita metadata sin re-subir imagen', async () => {
  const { cookie, csrfToken } = await loginSession();
  const { rows } = await pool.query(
    `INSERT INTO carousel_slides (base_key, alt_text, sort_order, is_active) VALUES ('test-edit-key', 'Original', 600, true) RETURNING *`
  );
  const slide = rows[0];

  const res = await fetch(`${baseUrl}/admin/carrusel/${slide.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: new URLSearchParams({
      _csrf: csrfToken,
      alt_text: 'Editado',
      link_url: '/promo',
      is_active: 'on',
    }).toString(),
  });
  assert.ok([302, 303].includes(res.status));

  const { rows: after } = await pool.query('SELECT * FROM carousel_slides WHERE id = $1', [slide.id]);
  assert.equal(after[0].alt_text, 'Editado');
  assert.equal(after[0].base_key, 'test-edit-key', 'no debe tocar base_key sin re-upload');

  await pool.query('DELETE FROM carousel_slides WHERE id = $1', [slide.id]);
});

test('POST /admin/carrusel/:id: ends_at anterior a starts_at se rechaza', async () => {
  const { cookie, csrfToken } = await loginSession();
  const { rows } = await pool.query(
    `INSERT INTO carousel_slides (base_key, alt_text, sort_order, is_active) VALUES ('test-fechas-key', 'Fechas', 601, true) RETURNING *`
  );
  const slide = rows[0];

  const res = await fetch(`${baseUrl}/admin/carrusel/${slide.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({
      _csrf: csrfToken,
      alt_text: 'Fechas',
      starts_at: '2030-01-10',
      ends_at: '2030-01-01',
    }).toString(),
  });
  assert.equal(res.status, 400);

  await pool.query('DELETE FROM carousel_slides WHERE id = $1', [slide.id]);
});

test('POST /admin/carrusel/:id/mover: reordena con ↑/↓, no-op en el límite', async () => {
  const { cookie, csrfToken } = await loginSession();
  const { rows } = await pool.query(
    `INSERT INTO carousel_slides (base_key, alt_text, sort_order, is_active) VALUES
      ('test-mover-a', 'A', 700, true),
      ('test-mover-b', 'B', 701, true)
     RETURNING *`
  );
  const [a, b] = rows.sort((x, y) => x.sort_order - y.sort_order);

  await fetch(`${baseUrl}/admin/carrusel/${b.id}/mover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({ _csrf: csrfToken, direction: 'up' }).toString(),
  }).then((r) => r.text());

  const { rows: after } = await pool.query(
    'SELECT id, sort_order FROM carousel_slides WHERE id = ANY($1::bigint[]) ORDER BY sort_order',
    [[a.id, b.id]]
  );
  assert.equal(after[0].id, b.id, 'b debe quedar primero tras subir');

  // Boundary: subir el que ya es primero es un no-op.
  await fetch(`${baseUrl}/admin/carrusel/${b.id}/mover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({ _csrf: csrfToken, direction: 'up' }).toString(),
  }).then((r) => r.text());

  const { rows: stillAfter } = await pool.query(
    'SELECT id, sort_order FROM carousel_slides WHERE id = ANY($1::bigint[]) ORDER BY sort_order',
    [[a.id, b.id]]
  );
  assert.equal(stillAfter[0].id, b.id);

  await pool.query('DELETE FROM carousel_slides WHERE id = ANY($1::bigint[])', [[a.id, b.id]]);
});

test('POST /admin/carrusel/:id/eliminar: borra la fila y los 3 archivos derivados, tolera archivos ya ausentes', async () => {
  const { cookie, csrfToken } = await loginSession();
  const buffer = await validSlideBuffer();

  const createForm = new FormData();
  createForm.append('_csrf', csrfToken);
  createForm.append('alt_text', 'Test a borrar');
  createForm.append('image', new Blob([buffer], { type: 'image/jpeg' }), 'slide.jpg');

  await fetch(`${baseUrl}/admin/carrusel`, { method: 'POST', headers: { cookie }, body: createForm, redirect: 'manual' }).then((r) =>
    r.text()
  );

  const { rows } = await pool.query(`SELECT * FROM carousel_slides WHERE alt_text = 'Test a borrar'`);
  const slide = rows[0];
  const uploadsRoot = path.join(__dirname, '..', '..', 'src', 'public', 'uploads', 'carousel');

  const res = await fetch(`${baseUrl}/admin/carrusel/${slide.id}/eliminar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: new URLSearchParams({ _csrf: csrfToken }).toString(),
  });
  assert.ok([302, 303].includes(res.status));

  const { rows: after } = await pool.query('SELECT * FROM carousel_slides WHERE id = $1', [slide.id]);
  assert.equal(after.length, 0);

  for (const width of [768, 1280, 1920]) {
    await assert.rejects(() => fs.access(path.join(uploadsRoot, `${slide.base_key}-${width}.webp`)));
  }

  // Borrar de nuevo (fila ya no existe) no debe explotar el server.
  const secondRes = await fetch(`${baseUrl}/admin/carrusel/${slide.id}/eliminar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: new URLSearchParams({ _csrf: csrfToken }).toString(),
  });
  assert.ok([302, 303, 404].includes(secondRes.status));
});

test('route-shadowing: /admin/carrusel NUNCA se trata como slug de categoría de primer nivel', async () => {
  const { cookie } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/carrusel`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.doesNotMatch(html, /Página no encontrada/i);
});
