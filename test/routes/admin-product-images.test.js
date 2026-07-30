// RED #7/#8 (tasks.md 2.5/3.8, design.md "Testing Strategy"): integración
// real contra Postgres + servidor real (mismo patrón que
// test/routes/admin-products.test.js — fetch nativo, sin supertest).
// Prueba el fix D6 end-to-end: multipart SIN token 403, CON token 200/303,
// y que activar un producto con imagen ya no choca con NO_IMAGES (criterio
// de éxito #1 del proposal).
//
// NOTA DE EJECUCIÓN (fase de apply, TDD estricto): requiere `sharp` y
// `multer` instalados (`npm install` pendiente, corre desde Windows,
// CLAUDE.md §5). Este archivo quedó en estado RED por `MODULE_NOT_FOUND`
// al cargar `src/app.js` (que ahora resuelve el router de imágenes) — no se
// pudo llevar a GREEN localmente en este paso.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const { pool } = require('../../src/db/pool');
const app = require('../../src/app');
const productsModel = require('../../src/models/products');
const categoriesModel = require('../../src/models/categories');
const variantsModel = require('../../src/models/variants');

let server;
let baseUrl;
let testAdmin;
let testCategoryId;
let testProductId;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const email = `test-admin-img-${Date.now()}@donnastyle.com`;
  const passwordHash = await bcrypt.hash('password-de-test-123', 12);
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING *`,
    [email, passwordHash]
  );
  testAdmin = rows[0];

  const category = await categoriesModel.create({ name: 'Cat test imágenes', slug: `cat-test-img-${Date.now()}` });
  testCategoryId = category.id;

  const product = await productsModel.create({
    name: 'Producto Test Imágenes',
    slug: `producto-test-imagenes-${Date.now()}`,
    basePrice: 1000,
    isActive: false,
  });
  testProductId = product.id;
  await productsModel.setCategories(testProductId, [testCategoryId]);
  await variantsModel.replaceForProduct(testProductId, [{ size: 'M', color: 'Negro', stock: 5 }]);
});

test.after(async () => {
  await pool.query('DELETE FROM products WHERE id = $1', [testProductId]);
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

async function validImageBuffer() {
  return sharp({ create: { width: 1200, height: 1600, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .jpeg()
    .toBuffer();
}

test('POST .../imagenes multipart SIN token CSRF es 403 y no crea fila (D6 fix, RED#7)', async () => {
  const { cookie } = await loginSession();
  const buffer = await validImageBuffer();

  const form = new FormData();
  form.append('images', new Blob([buffer], { type: 'image/jpeg' }), 'foto.jpg');

  const res = await fetch(`${baseUrl}/admin/productos/${testProductId}/imagenes`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  assert.equal(res.status, 403);

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM product_images WHERE product_id = $1', [testProductId]);
  assert.equal(rows[0].n, 0);
});

test('POST .../imagenes multipart CON token CSRF válido sube la imagen y activa el producto sin NO_IMAGES (RED#7 + criterio de éxito #1)', async () => {
  const { cookie, csrfToken } = await loginSession();
  const buffer = await validImageBuffer();

  const form = new FormData();
  form.append('_csrf', csrfToken);
  form.append('images', new Blob([buffer], { type: 'image/jpeg' }), 'foto.jpg');

  const res = await fetch(`${baseUrl}/admin/productos/${testProductId}/imagenes`, {
    method: 'POST',
    headers: { cookie },
    body: form,
    redirect: 'manual',
  });
  assert.ok([302, 303].includes(res.status));

  const created = await productsModel.findByIdWithDetails(testProductId);
  assert.equal(created.images.length, 1);
  assert.equal(created.images[0].is_primary, true);
  assert.equal(created.images[0].alt_text, 'Producto Test Imágenes', 'alt_text default = nombre del producto');

  // Antes de 6b, esto tiraba NO_IMAGES incondicionalmente.
  const activated = await productsModel.update(testProductId, { isActive: true });
  assert.equal(activated.is_active, true);
});

// Regresión explícita: rutas urlencoded EXISTENTES bajo /admin/productos
// (no multipart) siguen exigiendo CSRF sin cambios de comportamiento.
test('REGRESIÓN: POST /admin/productos (urlencoded, no multipart) sigue exigiendo CSRF tras montar el router de imágenes', async () => {
  const { cookie } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/productos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: `name=Sin CSRF&base_price=100&category_ids=${testCategoryId}&variants[0][stock]=1`,
  });
  assert.equal(res.status, 403);
});

// Bug real de QA: la sección "Imágenes" vivía DENTRO de #product-form.
// <form> anidado es HTML inválido — el navegador cierra #product-form apenas
// encuentra el primer </form> interno (spec del parser: un segundo <form>
// mientras el "form element pointer" no es null se IGNORA, y el primer
// </form> que aparece después cierra el form ABIERTO, no el que el usuario
// esperaba). Todo lo que quedaba después — Categorías, Visibilidad,
// Variantes, el botón Guardar de abajo — terminaba fuera de cualquier form y
// dejaba de funcionar; el botón "Guardar" del texto alternativo (que ya no
// existe — QA pidió un único Guardar general, ver parseImageAlt en
// products.js) terminaba mandando MÚLTIPLES campos _csrf duplicados en la
// MISMA request, lo que rompía la comparación de token (candidate llegaba
// como array, no string).
test('GET /admin/productos/:id/editar: la sección de imágenes nunca anida <form> (regresión del bug de QA)', async () => {
  const { cookie, csrfToken } = await loginSession();

  // Segunda imagen para que la página tenga MÁS de un form de imágenes
  // (primaria, mover×2, borrar) además del form de subida — el escenario
  // exacto donde apareció el bug.
  const buffer = await validImageBuffer();
  const form = new FormData();
  form.append('_csrf', csrfToken);
  form.append('images', new Blob([buffer], { type: 'image/jpeg' }), 'foto2.jpg');
  await fetch(`${baseUrl}/admin/productos/${testProductId}/imagenes`, {
    method: 'POST',
    headers: { cookie },
    body: form,
    redirect: 'manual',
  }).then((r) => r.text());

  const res = await fetch(`${baseUrl}/admin/productos/${testProductId}/editar`, { headers: { cookie } });
  const html = await res.text();
  assert.equal(res.status, 200);

  // Scan genérico: ningún <form abre mientras otro ya está abierto en
  // ningún punto del documento (nesting real, no solo dentro de
  // #product-form) — es la propiedad que garantiza que este bug de clase
  // "forms anidados" no puede reaparecer en ningún lugar de esta vista.
  const tags = html.match(/<\/?form\b[^>]*>/g) || [];
  let depth = 0;
  for (const tag of tags) {
    if (tag.startsWith('</')) {
      depth -= 1;
    } else {
      assert.equal(depth, 0, `<form> anidado encontrado: "${tag}" con otro form ya abierto`);
      depth += 1;
    }
  }
  assert.equal(depth, 0, 'quedó al menos un <form> sin cerrar');

  // Confirma además que el form principal y su botón Guardar real siguen
  // presentes y en un solo bloque (no partido por el bug). La sección de
  // Imágenes vive ANTES de #product-form en el DOM — hay que buscar el
  // Guardar principal DESPUÉS de que #product-form abre, no el primero que
  // aparezca en toda la página.
  assert.match(html, /id="product-form"/);
  assert.match(html, /name="category_ids"/);
  const productFormOpenIdx = html.indexOf('id="product-form"');
  const productFormCloseIdx = html.indexOf('</form>', productFormOpenIdx);
  const guardarIdx = html.indexOf('>Guardar<', productFormOpenIdx);
  assert.ok(guardarIdx > productFormOpenIdx, 'el botón Guardar principal debe estar dentro de #product-form');
  assert.ok(guardarIdx < productFormCloseIdx, 'el botón Guardar principal debe cerrar dentro del mismo #product-form, no después');
});

// QA: la dueña pidió poder subir fotos AL CREAR el producto, en la misma
// página — antes "Nuevo" no tenía sección de imágenes y forzaba un paso
// extra por "Editar". POST /admin/productos ahora acepta multipart y
// procesa las fotos en la MISMA transacción que crea el producto.
test('POST /admin/productos (multipart, con foto): crea el producto YA con la imagen, se puede activar en el mismo request', async () => {
  const { cookie, csrfToken } = await loginSession();
  const buffer = await validImageBuffer();
  const slug = `producto-con-foto-al-crear-${Date.now()}`;

  const form = new FormData();
  form.append('_csrf', csrfToken);
  form.append('name', 'Creado con foto');
  form.append('slug', slug);
  form.append('base_price', '1200');
  form.append('category_ids', String(testCategoryId));
  form.append('variants[0][size]', 'M');
  form.append('variants[0][stock]', '5');
  form.append('variants[0][size_order]', '200');
  form.append('is_active', 'on');
  form.append('images', new Blob([buffer], { type: 'image/jpeg' }), 'foto.jpg');

  const res = await fetch(`${baseUrl}/admin/productos`, {
    method: 'POST',
    headers: { cookie },
    body: form,
    redirect: 'manual',
  });
  await res.text();
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /\/admin\/productos$/, 'debe volver al listado, no a /editar');

  const { rows } = await pool.query('SELECT * FROM products WHERE slug = $1', [slug]);
  assert.equal(rows.length, 1);
  const productId = rows[0].id;
  assert.equal(rows[0].is_active, true, 'con imagen adjunta en el mismo request, is_active=on sí debe aplicarse');

  const { rows: imageRows } = await pool.query('SELECT * FROM product_images WHERE product_id = $1', [productId]);
  assert.equal(imageRows.length, 1);
  assert.equal(imageRows[0].is_primary, true);
  assert.equal(imageRows[0].alt_text, 'Creado con foto', 'alt_text default = nombre del producto');

  await pool.query('DELETE FROM products WHERE id = $1', [productId]);
});

test('POST /admin/productos (multipart) sin token CSRF es 403 y no crea nada', async () => {
  const { cookie } = await loginSession();
  const buffer = await validImageBuffer();
  const slug = `producto-sin-csrf-multipart-${Date.now()}`;

  const form = new FormData();
  form.append('name', 'Sin CSRF multipart');
  form.append('slug', slug);
  form.append('base_price', '500');
  form.append('category_ids', String(testCategoryId));
  form.append('variants[0][size]', 'M');
  form.append('variants[0][stock]', '1');
  form.append('images', new Blob([buffer], { type: 'image/jpeg' }), 'foto.jpg');

  const res = await fetch(`${baseUrl}/admin/productos`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  assert.equal(res.status, 403);

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM products WHERE slug = $1', [slug]);
  assert.equal(rows[0].n, 0);
});
