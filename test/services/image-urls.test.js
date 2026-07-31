// RED #1 (tasks.md 1.2, design.md D1/spec "single source of truth"): helper
// PURO, sin I/O ni DB — solo deriva strings de URL a partir de un base_key
// opaco. Ningún consumer (card/ficha/carrito) debe reconstruir este patrón
// a mano; este test fija el contrato exacto que consumen todos.
const test = require('node:test');
const assert = require('node:assert/strict');

const { imageSrc, imageSrcset, imageAttrs, IMAGE_WIDTHS } = require('../../src/services/image-urls');

test('IMAGE_WIDTHS: expone los tres anchos del pipeline en orden ascendente', () => {
  assert.deepEqual(IMAGE_WIDTHS, [400, 800, 1400]);
});

test('imageSrc: ancho por defecto es 800', () => {
  assert.equal(imageSrc(12, 'k3x9'), '/uploads/12/k3x9-800.webp');
});

test('imageSrc: acepta un ancho explícito', () => {
  assert.equal(imageSrc(12, 'k3x9', 400), '/uploads/12/k3x9-400.webp');
});

test('imageSrcset: arma el string srcset completo con los 3 anchos por defecto', () => {
  assert.equal(
    imageSrcset(12, 'k3x9'),
    '/uploads/12/k3x9-400.webp 400w, /uploads/12/k3x9-800.webp 800w, /uploads/12/k3x9-1400.webp 1400w'
  );
});

test('imageSrcset: acepta un subconjunto de anchos (ej. card: 400/800)', () => {
  assert.equal(
    imageSrcset(12, 'k3x9', [400, 800]),
    '/uploads/12/k3x9-400.webp 400w, /uploads/12/k3x9-800.webp 800w'
  );
});

test('imageAttrs: devuelve {src, srcset, sizes} listos para <img>', () => {
  const attrs = imageAttrs(12, 'k3x9', { widths: [400, 800], sizes: '(min-width: 768px) 50vw, 100vw' });
  assert.equal(attrs.src, '/uploads/12/k3x9-800.webp');
  assert.equal(attrs.srcset, '/uploads/12/k3x9-400.webp 400w, /uploads/12/k3x9-800.webp 800w');
  assert.equal(attrs.sizes, '(min-width: 768px) 50vw, 100vw');
});

test('imageAttrs: sin sizes explícito, el campo queda ausente (principio de ausencia §4.5)', () => {
  const attrs = imageAttrs(12, 'k3x9', { widths: [400] });
  assert.equal(attrs.sizes, undefined);
  assert.equal(attrs.src, '/uploads/12/k3x9-400.webp');
});

test('imageSrc/imageSrcset: nunca aceptan un base_key con path traversal (defensa en profundidad de D1)', () => {
  assert.throws(() => imageSrc(12, '../etc/passwd'), /base_key/);
  assert.throws(() => imageSrcset(12, 'a/b'), /base_key/);
});

// Fase 6d (tasks.md 3.1, design.md "File Changes"); QA ronda 2:
// `slideImageAttrs` deriva las URLs del carrusel — un solo derivado por
// slide, sin sufijo de variante (los slides son banners de diseño, se
// muestran completos, sin recorte, no hay "versión mobile" aparte).
const { slideImageAttrs } = require('../../src/services/image-urls');

test('slideImageAttrs: arma src/srcset con los 3 anchos, sin sufijo de variante', () => {
  const attrs = slideImageAttrs('k3x9');
  assert.equal(attrs.src, '/uploads/carousel/k3x9-1920.webp');
  assert.equal(
    attrs.srcset,
    '/uploads/carousel/k3x9-768.webp 768w, /uploads/carousel/k3x9-1280.webp 1280w, /uploads/carousel/k3x9-1920.webp 1920w'
  );
});

test('slideImageAttrs: nunca acepta un base_key con path traversal', () => {
  assert.throws(() => slideImageAttrs('../etc/passwd'), /base_key/);
});
