// RED (tasks.md 1.4, design.md D-F): `reorderIds` extraída de
// `product-images.js` a un servicio puro compartido (carousel-slides
// también reordena con ↑/↓, mismo patrón). Sin DB — la persistencia real la
// hace `reorder()` de cada modelo.
const test = require('node:test');
const assert = require('node:assert/strict');

const { reorderIds } = require('../../src/services/ordering');

test('reorderIds: sube un elemento del medio (swap con el anterior)', () => {
  assert.deepEqual(reorderIds(['a', 'b', 'c'], 'b', 'up'), ['b', 'a', 'c']);
});

test('reorderIds: baja un elemento del medio (swap con el siguiente)', () => {
  assert.deepEqual(reorderIds(['a', 'b', 'c'], 'b', 'down'), ['a', 'c', 'b']);
});

test('reorderIds: subir el primero es un no-op (boundary)', () => {
  assert.deepEqual(reorderIds(['a', 'b', 'c'], 'a', 'up'), ['a', 'b', 'c']);
});

test('reorderIds: bajar el último es un no-op (boundary)', () => {
  assert.deepEqual(reorderIds(['a', 'b', 'c'], 'c', 'down'), ['a', 'b', 'c']);
});

test('reorderIds: array de un solo elemento nunca se mueve, en ninguna dirección', () => {
  assert.deepEqual(reorderIds(['a'], 'a', 'up'), ['a']);
  assert.deepEqual(reorderIds(['a'], 'a', 'down'), ['a']);
});

test('reorderIds: id inexistente devuelve el array sin tocar', () => {
  assert.deepEqual(reorderIds(['a', 'b', 'c'], 'z', 'up'), ['a', 'b', 'c']);
});
