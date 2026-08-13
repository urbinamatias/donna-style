// RED (tasks.md T2, spec informational-pages "Collision with a category or a
// reserved route"): lista de slugs de primer nivel ya usados por rutas
// específicas registradas ANTES del comodín `/:parentSlug` en public.js
// (§/buscar, /carrito, /checkout, /pedido) o por otros montajes de app.js
// (/admin, /sitemap.xml, /robots.txt, /health) — una página nueva NUNCA
// puede reclamar ninguno de esos slugs.
const test = require('node:test');
const assert = require('node:assert/strict');

const { isReserved } = require('../../src/services/reserved-slugs');

test('isReserved: rutas específicas registradas antes del comodín de categoría', () => {
  assert.equal(isReserved('buscar'), true);
  assert.equal(isReserved('carrito'), true);
  assert.equal(isReserved('checkout'), true);
  assert.equal(isReserved('pedido'), true);
  assert.equal(isReserved('admin'), true);
});

test('isReserved: rutas de infraestructura no-catálogo', () => {
  assert.equal(isReserved('sitemap.xml'), true);
  assert.equal(isReserved('robots.txt'), true);
  assert.equal(isReserved('health'), true);
});

test('isReserved: un slug de página válido no está reservado', () => {
  assert.equal(isReserved('envios'), false);
});
