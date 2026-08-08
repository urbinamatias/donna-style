// Test de integración de sitemap.xml / robots.txt (Fase 7, design.md D-E —
// mismo patrón app.listen(0) + fetch global que test/routes/cart.test.js).
// Requiere Postgres de desarrollo + `node db/seed.js` + `node db/migrate.js`.
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const app = require('../../src/app');
const productsModel = require('../../src/models/products');
const variantsModel = require('../../src/models/variants');
const config = require('../../src/config/env');

let server;
let baseUrl;
const createdProductIds = [];

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (createdProductIds.length > 0) {
    await pool.query('DELETE FROM products WHERE id = ANY($1::bigint[])', [createdProductIds]);
  }
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function makeProduct(overrides = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const product = await productsModel.create({
    name: `Sitemap test ${suffix}`,
    slug: `sitemap-test-${suffix}`,
    basePrice: 1000,
    ...overrides,
  });
  createdProductIds.push(product.id);
  return product;
}

// Threat Matrix (design.md): `/:parentSlug` de publicRouter NO debe capturar
// `/sitemap.xml` como si fuera un slug de categoría de primer nivel.
test('GET /sitemap.xml no queda shadowed por el comodín /:parentSlug — responde XML, no una 404 de categoría', async () => {
  const res = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /application\/xml/);
  const body = await res.text();
  assert.match(body, /<urlset/);
});

test('GET /sitemap.xml: incluye productos activos (incluso sin stock), omite inactivos y rutas privadas', async () => {
  const active = await makeProduct();
  const outOfStock = await makeProduct();
  await variantsModel.bulkCreate(outOfStock.id, [{ size: 'S', stock: 0 }]);
  const inactive = await makeProduct({ isActive: false });

  const res = await fetch(`${baseUrl}/sitemap.xml`);
  const body = await res.text();

  assert.ok(body.includes(`/productos/${active.slug}`), 'producto activo debe estar');
  assert.ok(body.includes(`/productos/${outOfStock.slug}`), 'producto sin stock sigue indexable');
  assert.ok(!body.includes(`/productos/${inactive.slug}`), 'producto inactivo no debe estar');

  assert.ok(!body.includes('/admin'), 'admin nunca en el sitemap');
  assert.ok(!/\/carrito(?!o)/.test(body) || !body.includes('<loc>' + config.SITE_URL + '/carrito'), 'carrito no en el sitemap');
  assert.ok(!body.includes(`${config.SITE_URL}/checkout`), 'checkout no en el sitemap');
});

test('GET /sitemap.xml: bien formado — un solo <urlset>, tags <url> balanceados', async () => {
  const res = await fetch(`${baseUrl}/sitemap.xml`);
  const body = await res.text();

  assert.equal((body.match(/<urlset/g) || []).length, 1);
  const opens = (body.match(/<url>/g) || []).length;
  const closes = (body.match(/<\/url>/g) || []).length;
  assert.ok(opens > 0);
  assert.equal(opens, closes);
});

// Injection en XML generado: un slug con `&` debe llegar escapado.
test('GET /sitemap.xml: escapa & en URLs derivadas de slugs (escapeXml)', async () => {
  const withAmpersand = await makeProduct({ slug: `sitemap-a-b-${Date.now()}`, name: 'A & B' });
  // El slug real siempre matchea [a-z0-9-] (regla del proyecto), así que
  // simulamos la amenaza reemplazando el slug guardado con uno con "&" en
  // la fila directamente, para probar que la ruta jamás confía en que el
  // slug ya viene limpio (defensa en profundidad, no solo por convención).
  await pool.query('UPDATE products SET slug = $1 WHERE id = $2', [`amp&test-${Date.now()}`, withAmpersand.id]);

  const res = await fetch(`${baseUrl}/sitemap.xml`);
  const body = await res.text();

  assert.ok(!/<loc>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)[^<]*<\/loc>/.test(body), '& crudo nunca debe aparecer sin escapar dentro de un <loc>');
});

test('GET /robots.txt: 200, text/plain, disallow admin/carrito/checkout/pedido y Sitemap absoluto', async () => {
  const res = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/plain/);

  const body = await res.text();
  assert.match(body, /Disallow:\s*\/admin/);
  assert.match(body, /Disallow:\s*\/carrito/);
  assert.match(body, /Disallow:\s*\/checkout/);
  assert.match(body, /Disallow:\s*\/pedido\//);
  assert.ok(!/Disallow:\s*\/\s*$/m.test(body), 'no debe deshabilitar la raíz completa');
  assert.match(body, new RegExp(`Sitemap:\\s*${config.SITE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap\\.xml`));
});
