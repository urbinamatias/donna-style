// Fase 7 lightbox (design.md, tasks.md T1/T4/T8): HTTP real de la ficha de
// producto contra un harness que NO pasa por app.js (que arrastra
// adminRouter -> sharp, no disponible en este entorno WSL — ver
// test/routes/helpers/public-test-app.js y el mismo criterio ya establecido
// en test/routes/public-attach-card-data.test.js / helpers/admin-test-app.js).
// gallery.js/el overlay real en DOM (trap, WAAPI, teclado) NO son
// testeables sin jsdom (no está en el proyecto) — cubierto por QA manual
// (T9). Acá solo se afirma CONTRATO de markup server-side: qué se renderiza
// según cantidad de fotos, y el orden de <script> del layout.
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPublicTestApp, pool } = require('./helpers/public-test-app');
const productsModel = require('../../src/models/products');
const productImagesModel = require('../../src/models/product-images');

let server;
let baseUrl;
let productZero; // sin fotos
let productOne; // exactamente 1 foto
let productMany; // 3 fotos
let stamp;

test.before(async () => {
  stamp = Date.now();

  productZero = await productsModel.create({
    name: 'Fixture Lightbox Cero Fotos',
    slug: `fixture-lightbox-cero-${stamp}`,
    basePrice: 1000,
    isActive: true,
  });
  productOne = await productsModel.create({
    name: 'Fixture Lightbox Una Foto',
    slug: `fixture-lightbox-una-${stamp}`,
    basePrice: 1000,
    isActive: true,
  });
  productMany = await productsModel.create({
    name: 'Fixture Lightbox Varias Fotos',
    slug: `fixture-lightbox-varias-${stamp}`,
    basePrice: 1000,
    isActive: true,
  });

  await productImagesModel.bulkCreate(productOne.id, [
    { filename: `fx7-lb-one-${stamp}`, altText: 'Foto única', sortOrder: 0, isPrimary: true },
  ]);
  await productImagesModel.bulkCreate(productMany.id, [
    { filename: `fx7-lb-many-1-${stamp}`, altText: 'Foto 1', sortOrder: 0, isPrimary: true },
    { filename: `fx7-lb-many-2-${stamp}`, altText: 'Foto 2', sortOrder: 1, isPrimary: false },
    { filename: `fx7-lb-many-3-${stamp}`, altText: 'Foto 3', sortOrder: 2, isPrimary: false },
  ]);

  const app = buildPublicTestApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await productsModel.remove(productZero.id);
  await productsModel.remove(productOne.id);
  await productsModel.remove(productMany.id);
  await pool.end();
});

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// T1 (RED antes de public.js:149 `>= 1`) + R9 scenario 1.
test('GET /productos/:slug con exactamente 1 foto: /js/gallery.js está en los scripts del body', async () => {
  const res = await fetch(`${baseUrl}/productos/${productOne.slug}`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.ok(html.includes('<script src="/js/gallery.js" defer></script>'));
});

// R9 scenario 3: sin fotos, no hay trigger ni overlay ni script.
test('GET /productos/:slug sin fotos: no hay data-gallery-open, dialog ni /js/gallery.js', async () => {
  const res = await fetch(`${baseUrl}/productos/${productZero.slug}`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.ok(!html.includes('data-gallery-open'));
  assert.ok(!html.includes('data-lightbox-dialog'));
  assert.ok(!html.includes('/js/gallery.js'));
});

// T4: main.ejs SIEMPRE emite menu-animate.js (defer) antes que bodyScripts
// (donde vive gallery.js) — sostiene el reuso global de
// computeNextFocusIndex (design.md D1).
test('GET /productos/:slug con 1 foto: /js/menu-animate.js aparece ANTES que /js/gallery.js en el HTML', async () => {
  const res = await fetch(`${baseUrl}/productos/${productOne.slug}`);
  const html = await res.text();

  const menuAnimateIndex = html.indexOf('/js/menu-animate.js');
  const galleryIndex = html.indexOf('/js/gallery.js');

  assert.ok(menuAnimateIndex !== -1, 'menu-animate.js debe estar presente');
  assert.ok(galleryIndex !== -1, 'gallery.js debe estar presente');
  assert.ok(menuAnimateIndex < galleryIndex, 'menu-animate.js debe cargar antes que gallery.js');
});

// T8 — contrato de markup del overlay con 1 sola foto (R1, R2, R5, R6).
test('GET /productos/:slug con 1 foto: un solo trigger, dialog presente, SIN prev/next ni status (R5/R6)', async () => {
  const res = await fetch(`${baseUrl}/productos/${productOne.slug}`);
  const html = await res.text();

  assert.equal(countOccurrences(html, 'data-gallery-open'), 1, 'un solo tabstop para abrir el overlay (R1)');
  assert.ok(html.includes('data-lightbox-dialog'));
  assert.ok(html.includes('aria-modal="true"'));
  assert.ok(!html.includes('data-lightbox-prev'));
  assert.ok(!html.includes('data-lightbox-next'));
  assert.ok(!html.includes('data-lightbox-status'));
});

// T8 — con 2+ fotos, prev/next y el status sr-only SÍ existen (R5/R6), y las
// miniaturas NO se replican dentro del overlay (R10).
test('GET /productos/:slug con 3 fotos: prev/next + aria-live presentes, miniaturas no duplicadas (R5/R6/R10)', async () => {
  const res = await fetch(`${baseUrl}/productos/${productMany.slug}`);
  const html = await res.text();

  assert.equal(countOccurrences(html, 'data-gallery-open'), 1, 'un solo tabstop para abrir el overlay (R1)');
  assert.ok(html.includes('data-lightbox-prev'));
  assert.ok(html.includes('data-lightbox-next'));
  assert.ok(html.includes('data-lightbox-status'));
  assert.ok(html.includes('aria-live="polite"'));

  // R10: las miniaturas viven SOLO debajo de la foto (product.ejs), nunca
  // replicadas dentro del overlay — si el partial las repitiera, este conteo
  // duplicaría (6 en vez de 3). Regex con `(?!s)` para no contar el
  // contenedor `data-gallery-thumbs` (plural) como si fuera una miniatura.
  const thumbMatches = html.match(/data-gallery-thumb(?!s)/g) || [];
  assert.equal(thumbMatches.length, 3);
});
