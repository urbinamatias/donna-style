// Tests de `shouldHideFloatingUI` (design.md D7): deny-list de prefijos de
// path que ocultan el buscador del header y el CTA flotante de WhatsApp
// (páginas de compra en curso). Puro, sin req/res reales — igual que
// availability.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldHideFloatingUI, floatingUi } = require('../../src/middleware/floating-ui');

test('shouldHideFloatingUI: oculta en /carrito', () => {
  assert.equal(shouldHideFloatingUI('/carrito'), true);
});

test('shouldHideFloatingUI: oculta en subrutas de /carrito (ej. /carrito/estado)', () => {
  assert.equal(shouldHideFloatingUI('/carrito/estado'), true);
});

test('shouldHideFloatingUI: oculta en /checkout', () => {
  assert.equal(shouldHideFloatingUI('/checkout'), true);
});

test('shouldHideFloatingUI: oculta en /pedido/:token', () => {
  assert.equal(shouldHideFloatingUI('/pedido/abc123'), true);
});

test('shouldHideFloatingUI: oculta en /admin y subrutas', () => {
  assert.equal(shouldHideFloatingUI('/admin'), true);
  assert.equal(shouldHideFloatingUI('/admin/productos'), true);
});

test('shouldHideFloatingUI: visible en home', () => {
  assert.equal(shouldHideFloatingUI('/'), false);
});

test('shouldHideFloatingUI: visible en /buscar (resultado de búsqueda no se oculta a sí mismo)', () => {
  assert.equal(shouldHideFloatingUI('/buscar'), false);
});

test('shouldHideFloatingUI: visible en un slug de categoría de primer nivel', () => {
  assert.equal(shouldHideFloatingUI('/vestidos'), false);
});

test('shouldHideFloatingUI: no matchea por substring — un slug que empieza igual no es prefijo real', () => {
  assert.equal(shouldHideFloatingUI('/carritos-de-compras'), false);
});

test('floatingUi middleware: setea res.locals.hideFloatingUI según el path y llama next', () => {
  const res = { locals: {} };
  let called = false;
  floatingUi({ path: '/carrito' }, res, () => {
    called = true;
  });
  assert.equal(res.locals.hideFloatingUI, true);
  assert.equal(called, true);
});

test('floatingUi middleware: false en rutas normales', () => {
  const res = { locals: {} };
  floatingUi({ path: '/' }, res, () => {});
  assert.equal(res.locals.hideFloatingUI, false);
});
