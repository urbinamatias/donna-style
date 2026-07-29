// Tests del servicio puro de carrito (Fase 4, §5.7 de prompt.md). Sin DB:
// opera sobre `lines` (forma de sesión) y sobre filas "vivas" ya resueltas
// (fixtures que imitan lo que trae variantsModel.findByIds), igual que
// availability.test.js hace con variants.
const test = require('node:test');
const assert = require('node:assert/strict');

const { addLine, setQuantity, removeLine, revalidate, summarize } = require('../../src/services/cart');

test('addLine: crea una línea nueva con cantidad 1 por defecto', () => {
  const lines = addLine([], 7, undefined, 10);
  assert.deepEqual(lines, [{ variantId: 7, quantity: 1 }]);
});

test('addLine: re-agregar el mismo variant_id incrementa en vez de duplicar (D5)', () => {
  const lines = addLine([{ variantId: 7, quantity: 1 }], 7, 2, 10);
  assert.deepEqual(lines, [{ variantId: 7, quantity: 3 }]);
});

test('addLine: la cantidad resultante se limita al stock vivo', () => {
  const lines = addLine([{ variantId: 7, quantity: 2 }], 7, 5, 3);
  assert.deepEqual(lines, [{ variantId: 7, quantity: 3 }]);
});

test('addLine: variantes distintas generan líneas separadas', () => {
  const lines = addLine([{ variantId: 7, quantity: 1 }], 9, 1, 5);
  assert.deepEqual(lines, [
    { variantId: 7, quantity: 1 },
    { variantId: 9, quantity: 1 },
  ]);
});

test('setQuantity: fija la cantidad de una línea existente, limitada a stock', () => {
  const lines = setQuantity([{ variantId: 7, quantity: 1 }], 7, 9, 4);
  assert.deepEqual(lines, [{ variantId: 7, quantity: 4 }]);
});

test('setQuantity: cantidad 0 o menor remueve la línea', () => {
  const lines = setQuantity([{ variantId: 7, quantity: 1 }], 7, 0, 4);
  assert.deepEqual(lines, []);
});

test('setQuantity: variant_id ausente del carrito no crea línea', () => {
  const lines = setQuantity([{ variantId: 7, quantity: 1 }], 99, 2, 4);
  assert.deepEqual(lines, [{ variantId: 7, quantity: 1 }]);
});

test('removeLine: elimina la línea del variant_id dado', () => {
  const lines = removeLine([{ variantId: 7, quantity: 1 }, { variantId: 9, quantity: 2 }], 7);
  assert.deepEqual(lines, [{ variantId: 9, quantity: 2 }]);
});

test('removeLine: remover una línea ausente es idempotente', () => {
  const lines = removeLine([{ variantId: 7, quantity: 1 }], 999);
  assert.deepEqual(lines, [{ variantId: 7, quantity: 1 }]);
});

// Fixture de filas "vivas" — misma forma que variantsModel.findByIds.
const liveRows = [
  {
    id: 7,
    stock: 1,
    price: '12000.00',
    product_name: 'Remera Taylor',
    size: 'M',
    color: 'Negro',
    image_filename: 'placeholders/remera-taylor-1.jpg',
  },
  { id: 9, stock: 0, price: '8000.00', product_name: 'Top Básico', size: null, color: 'Blanco', image_filename: null },
];

test('revalidate: sin cambios no genera notices', () => {
  const { lines, notices } = revalidate([{ variantId: 7, quantity: 1 }], liveRows);
  assert.deepEqual(lines, [{ variantId: 7, quantity: 1 }]);
  assert.deepEqual(notices, []);
});

test('revalidate: cantidad por encima del stock vivo se cappea y notifica', () => {
  const { lines, notices } = revalidate([{ variantId: 7, quantity: 3 }], liveRows);
  assert.deepEqual(lines, [{ variantId: 7, quantity: 1 }]);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, 'capped');
  assert.equal(notices[0].variantId, 7);
  assert.equal(notices[0].from, 3);
  assert.equal(notices[0].to, 1);
});

test('revalidate: variante agotada se remueve y notifica', () => {
  const { lines, notices } = revalidate([{ variantId: 9, quantity: 2 }], liveRows);
  assert.deepEqual(lines, []);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, 'removed');
  assert.equal(notices[0].variantId, 9);
});

test('revalidate: variante que ya no existe en las filas vivas se remueve y notifica', () => {
  const { lines, notices } = revalidate([{ variantId: 999, quantity: 1 }], liveRows);
  assert.deepEqual(lines, []);
  assert.equal(notices[0].kind, 'removed');
});

test('summarize: calcula subtotal y count sobre precios vivos, nunca del cliente', () => {
  const result = summarize([{ variantId: 7, quantity: 2 }], liveRows);
  assert.equal(result.subtotal, 24000);
  assert.equal(result.count, 2);
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].variantId, 7);
  assert.equal(result.lines[0].name, 'Remera Taylor');
  assert.equal(result.lines[0].lineTotal, 24000);
  assert.equal(result.lines[0].image, '/img/placeholders/remera-taylor-1.jpg');
});

test('summarize: sin imagen (principio de ausencia) el campo image es null', () => {
  const result = summarize([{ variantId: 9, quantity: 1 }], [
    { ...liveRows[1], stock: 4 },
  ]);
  assert.equal(result.lines[0].image, null);
});

test('summarize: carrito vacío da subtotal 0 y count 0', () => {
  const result = summarize([], liveRows);
  assert.deepEqual(result, { lines: [], subtotal: 0, count: 0 });
});
