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
