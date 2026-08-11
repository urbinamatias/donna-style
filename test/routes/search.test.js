// Test de integración de GET /buscar (design.md D1/D4/D5). Mismo patrón
// app.listen(0) + fetch global que public.test.js/whatsapp-fab.test.js.
// Requiere Postgres de desarrollo + seed + migrate.
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const app = require('../../src/app');
const searchLimiter = require('../../src/middleware/search-rate-limit');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.beforeEach(() => {
  // Sin esto, una suite anterior que dispare >30 requests haría que ESTA
  // arranque devolviendo 429 (design.md D2) — mismo motivo por el que el
  // limiter es un singleton exportado, no uno creado inline en la ruta.
  searchLimiter._hits.clear();
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('GET /buscar?q=canesu: 200, product-card con link a la ficha (case/accent tolerante)', async () => {
  const res = await fetch(`${baseUrl}/buscar?q=canesu`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('/productos/body-canesu'), 'debe linkear a la ficha del producto encontrado');
});

test('GET /buscar?q=zzzznoexiste: 200, estado vacío con el término escapado, cero cards', async () => {
  const res = await fetch(`${baseUrl}/buscar?q=zzzznoexiste`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('zzzznoexiste'));
  assert.ok(!html.includes('/productos/body-canesu'));
});

test('GET /buscar sin q: 200, estado vacío, nunca un dump completo del catálogo', async () => {
  const res = await fetch(`${baseUrl}/buscar`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(!html.includes('/productos/body-canesu'));
  assert.ok(!html.includes('/productos/remera-taylor'));
});

test('GET /buscar?q=<script>: el término aparece escapado, sin script ejecutable', async () => {
  const res = await fetch(`${baseUrl}/buscar?${new URLSearchParams({ q: '<script>alert(1)</script>' })}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('GET /buscar?q=zzz no es tragado por el catch-all /:parentSlug (route ordering)', async () => {
  const res = await fetch(`${baseUrl}/buscar?q=zzz`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(/<h1[^>]*>/.test(html), 'debe renderizar la página de búsqueda, no un 404 de categoría');
});

test('GET /buscar: rate limit — request 31 en la ventana devuelve 429, luego se recupera', async () => {
  for (let i = 0; i < 30; i += 1) {
    const res = await fetch(`${baseUrl}/buscar?q=x`);
    assert.equal(res.status, 200);
  }
  const blocked = await fetch(`${baseUrl}/buscar?q=x`);
  assert.equal(blocked.status, 429);

  searchLimiter._hits.clear();
  const recovered = await fetch(`${baseUrl}/buscar?q=x`);
  assert.equal(recovered.status, 200);
});

test('GET /: el magnifier del buscador está presente en el header', async () => {
  const res = await fetch(`${baseUrl}/`);
  const html = await res.text();
  assert.ok(html.includes('aria-label="Buscar productos"'));
});

test('GET /carrito: el magnifier del buscador está ausente (hideFloatingUI)', async () => {
  const res = await fetch(`${baseUrl}/carrito`);
  const html = await res.text();
  assert.ok(!html.includes('aria-label="Buscar productos"'));
});
