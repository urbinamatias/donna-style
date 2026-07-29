// Tests del servicio puro de disponibilidad de variantes (§3.2 de prompt.md).
// Sin DB: fixtures en memoria, node:test + node:assert únicamente.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeAvailability,
  getAvailableAxisValues,
  getDefaultSelection,
  findVariant,
  isVariantAvailable,
} = require('../../src/services/availability');

// Fixture exacto de §11: M/Negro sin stock, M/Blanco y L/Negro con stock.
const fixtureTwoAxes = [
  { id: 1, size: 'M', size_order: 30, color: 'Negro', stock: 0 },
  { id: 2, size: 'M', size_order: 30, color: 'Blanco', stock: 5 },
  { id: 3, size: 'L', size_order: 40, color: 'Negro', stock: 3 },
];

test('computeAvailability: M/Negro agotado deja M vivo via Blanco y Negro vivo via L', () => {
  const result = computeAvailability(fixtureTwoAxes);
  assert.equal(result.hasAnyStock, true);
  assert.deepEqual([...result.axes.size].sort(), ['L', 'M']);
  assert.deepEqual([...result.axes.color].sort(), ['Blanco', 'Negro']);
});

test('getAvailableAxisValues: elegir L deja visible solo Negro', () => {
  const colors = getAvailableAxisValues(fixtureTwoAxes, 'color', { size: 'L' });
  assert.deepEqual(colors, ['Negro']);
});

test('getAvailableAxisValues: elegir M deja visible solo Blanco', () => {
  const colors = getAvailableAxisValues(fixtureTwoAxes, 'color', { size: 'M' });
  assert.deepEqual(colors, ['Blanco']);
});

test('getDefaultSelection: talle más chico disponible por size_order (S<M<L)', () => {
  const selection = getDefaultSelection(fixtureTwoAxes);
  assert.deepEqual(selection, { size: 'M', color: 'Blanco' });
});

test('getDefaultSelection: talles numéricos usan orden numérico, no alfabético', () => {
  const numericFixture = [
    { id: 1, size: '36', size_order: 36, color: null, stock: 4 },
    { id: 2, size: '38', size_order: 38, color: null, stock: 2 },
    { id: 3, size: '40', size_order: 40, color: null, stock: 1 },
  ];
  const selection = getDefaultSelection(numericFixture);
  assert.equal(selection.size, '36');
});

test('computeAvailability: variante única sin ejes no expone axes ni requiere selección', () => {
  const singleNoAxes = [{ id: 1, size: null, size_order: 0, color: null, stock: 2 }];
  const result = computeAvailability(singleNoAxes);
  assert.equal(result.hasAnyStock, true);
  assert.deepEqual(result.axes, {});
  assert.deepEqual(result.defaultSelection, {});
});

test('computeAvailability: sin stock en ninguna variante => hasAnyStock false', () => {
  const zeroStock = [
    { id: 1, size: 'S', size_order: 20, color: 'Negro', stock: 0 },
    { id: 2, size: 'M', size_order: 30, color: 'Negro', stock: 0 },
  ];
  const result = computeAvailability(zeroStock);
  assert.equal(result.hasAnyStock, false);
});

test('computeAvailability: un único valor restante en un eje igual se muestra', () => {
  const onlyLNegro = [
    { id: 1, size: 'M', size_order: 30, color: 'Negro', stock: 0 },
    { id: 2, size: 'L', size_order: 40, color: 'Negro', stock: 3 },
  ];
  const result = computeAvailability(onlyLNegro);
  assert.deepEqual(result.axes.size, ['L']);
});

test('isVariantAvailable: true para combinación con stock', () => {
  assert.equal(isVariantAvailable(fixtureTwoAxes, { size: 'L', color: 'Negro' }), true);
});

test('isVariantAvailable: false para combinación existente pero sin stock', () => {
  assert.equal(isVariantAvailable(fixtureTwoAxes, { size: 'M', color: 'Negro' }), false);
});

test('isVariantAvailable: false para combinación inexistente', () => {
  assert.equal(isVariantAvailable(fixtureTwoAxes, { size: 'XL', color: 'Rojo' }), false);
});

test('findVariant: retorna null para selección inexistente', () => {
  assert.equal(findVariant(fixtureTwoAxes, { size: 'XL', color: 'Rojo' }), null);
});

test('findVariant: retorna la variante exacta cuando existe', () => {
  const variant = findVariant(fixtureTwoAxes, { size: 'L', color: 'Negro' });
  assert.equal(variant.id, 3);
});
