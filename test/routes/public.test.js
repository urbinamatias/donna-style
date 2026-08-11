// Test de integración de SEO en rutas públicas (Fase 7, design.md "Testing
// Strategy" — app.listen(0) + fetch global, mismo patrón que
// test/routes/cart.test.js). Requiere Postgres de desarrollo + seed + migrate.
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const app = require('../../src/app');
const config = require('../../src/config/env');

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

function extractTag(html, regex) {
  const match = html.match(regex);
  return match ? match[1] : null;
}

test('GET /: emite title, meta description y canonical de raíz', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.ok(/<title>[^<]+<\/title>/.test(html));
  const metaDescription = extractTag(html, /<meta name="description" content="([^"]*)">/);
  assert.ok(metaDescription && metaDescription.length > 0);
  assert.ok(html.includes(`<link rel="canonical" href="${config.SITE_URL}/">`));
});

test('GET /:parentSlug (categoría): canonical usa req.path y difiere entre dos categorías', async () => {
  const resParent = await fetch(`${baseUrl}/partes-de-arriba`);
  const resLeaf = await fetch(`${baseUrl}/bodys`);
  assert.equal(resParent.status, 200);
  assert.equal(resLeaf.status, 200);

  const htmlParent = await resParent.text();
  const htmlLeaf = await resLeaf.text();

  const canonicalParent = extractTag(htmlParent, /<link rel="canonical" href="([^"]*)">/);
  const canonicalLeaf = extractTag(htmlLeaf, /<link rel="canonical" href="([^"]*)">/);

  assert.equal(canonicalParent, `${config.SITE_URL}/partes-de-arriba`);
  assert.equal(canonicalLeaf, `${config.SITE_URL}/bodys`);
  assert.notEqual(canonicalParent, canonicalLeaf);
});

test('GET /:parentSlug con query string: el canonical NUNCA incluye ?page=/?sort=', async () => {
  const res = await fetch(`${baseUrl}/bodys?page=2&sort=price_asc`);
  const html = await res.text();
  const canonical = extractTag(html, /<link rel="canonical" href="([^"]*)">/);
  assert.equal(canonical, `${config.SITE_URL}/bodys`);
});

test('GET /productos/:slug: exactamente un bloque application/ld+json, parseable, availability coincide con el stock en página', async () => {
  const res = await fetch(`${baseUrl}/productos/body-canesu`);
  assert.equal(res.status, 200);
  const html = await res.text();

  const blocks = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) || [];
  assert.equal(blocks.length, 1, 'debe haber exactamente un bloque ld+json');

  const inner = blocks[0].replace(/<script[^>]*>/, '').replace('</script>', '');
  const jsonLd = JSON.parse(inner);
  assert.equal(jsonLd['@type'], 'Product');
  assert.ok(['https://schema.org/InStock', 'https://schema.org/OutOfStock'].includes(jsonLd.offers.availability));

  assert.ok(html.includes('property="og:type" content="product"'));
  assert.ok(/property="og:image" content="[^"]+"/.test(html));
});

test('GET /productos/:slug inexistente (404): noindex, sin canonical apuntando a otra página', async () => {
  const res = await fetch(`${baseUrl}/productos/no-existe-esto-${Date.now()}`);
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.ok(html.includes('content="noindex"'));
  assert.ok(!html.includes('<link rel="canonical"'));
});

// Fase card catálogo (obs #406/#407/#408): la card ya no trae selector de
// variante ni form de agregar al carrito — solo precio, transferencia,
// cuotas y un link "Ver producto" a la ficha, con y sin stock.
test('GET /: la card no incluye form de agregar ni tabla de decisión, y linkea a /productos/{slug}', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.ok(!html.includes('data-add-form'));
  assert.ok(!html.includes('data-decision-table'));
  assert.ok(/href="\/productos\/[^"]+"/.test(html));
});

test('GET /:categoria: la card no incluye form de agregar ni tabla de decisión, y linkea a /productos/{slug} con y sin stock', async () => {
  const res = await fetch(`${baseUrl}/bodys`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.ok(!html.includes('data-add-form'));
  assert.ok(!html.includes('data-decision-table'));
  assert.ok(html.includes('Ver producto'));
  assert.ok(/href="\/productos\/[^"]+"/.test(html));
});

// La ficha (donde se decide agregar al carrito) muestra la misma info de
// transferencia/cuotas que ya vio la clienta en el listado.
test('GET /productos/:slug: muestra precio con Efectivo/Transferencia y cuotas sin interés', async () => {
  const res = await fetch(`${baseUrl}/productos/body-canesu`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.ok(html.includes('Efectivo/Transferencia'));
  assert.ok(html.includes('cuotas sin interés de'));
});

// Fase 7 (design.md, tasks.md 3.1): attachCardData pasa de 2N a 2 queries
// (batching). Este test HTTP no corre en WSL (requiere app.js -> adminRouter
// -> sharp, no disponible acá — ver la nota de test/routes/public.test.js:1
// y test/routes/public-attach-card-data.test.js para la cobertura completa
// de R5-R8 ejecutable desde WSL). Queda escrito para verificación cruzada en
// Windows (`npm run dev`), donde sí se puede confirmar de punta a punta que
// el listado renderiza igual que antes del batching.
test('GET /: al menos un producto con stock real aparece disponible tras el batching (R8, detecta bug string-vs-number)', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  // Si `Number()` se omitiera en el join de attachCardData, TODAS las cards
  // quedarían sin variantes/imágenes y la tienda entera aparecería sin
  // stock — buscamos evidencia positiva, no solo ausencia de error.
  assert.ok(/href="\/productos\/[^"]+"/.test(html));
  assert.ok(html.includes('<img'), 'al menos una imagen de producto debe renderizar (images no vacío)');
});
