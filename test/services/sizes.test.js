// Tests del servicio puro de derivación de `size_order` (Fase 6a, §6.3 de
// prompt.md, design.md D6). Sin DB: `sizes.js` es lo que PRODUCE la columna
// `size_order` que `availability.js` ya consume vía `v.size_order` — este
// archivo nunca importa availability.js ni al revés (single source of truth,
// pero cada uno en su punta del contrato).
const test = require('node:test');
const assert = require('node:assert/strict');

const { sizeOrderFor, sortSizes, buildVariantGrid } = require('../../src/services/sizes');

test('sizeOrderFor: escala canónica de letras ordena XS<S<M<L<XL<XXL<XXXL', () => {
  const orders = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map((s) => sizeOrderFor(s));
  const sorted = [...orders].sort((a, b) => a - b);
  assert.deepEqual(orders, sorted);
  assert.ok(new Set(orders).size === orders.length, 'cada talle canónico tiene un order distinto');
});

test('sizeOrderFor: es insensible a mayúsculas/espacios', () => {
  assert.equal(sizeOrderFor(' m '), sizeOrderFor('M'));
  assert.equal(sizeOrderFor('xl'), sizeOrderFor('XL'));
});

test('sizeOrderFor: talles numéricos ordenan numéricamente, no lexicográficamente', () => {
  assert.ok(sizeOrderFor('9') < sizeOrderFor('38'));
  assert.ok(sizeOrderFor('38') < sizeOrderFor('40'));
  assert.ok(sizeOrderFor('40') < sizeOrderFor('100'));
});

test('sizeOrderFor: nomenclatura desconocida recibe un order estable por posición de inserción', () => {
  const a = sizeOrderFor('Único', 0);
  const b = sizeOrderFor('Otro', 1);
  assert.notEqual(a, b);
  assert.ok(a < b);
});

test('sortSizes: escala de letras — {XL,S,XXL,M} ordena S<M<XL<XXL', () => {
  assert.deepEqual(sortSizes(['XL', 'S', 'XXL', 'M']), ['S', 'M', 'XL', 'XXL']);
});

test('sortSizes: escala numérica — {38,40,100,9} ordena 9<38<40<100, no lexicográfico', () => {
  assert.deepEqual(sortSizes(['38', '40', '100', '9']), ['9', '38', '40', '100']);
});

test('sortSizes: nomenclatura desconocida no pierde filas y mantiene orden estable', () => {
  const result = sortSizes(['Talle Único', 'Otro Talle']);
  assert.equal(result.length, 2);
  assert.deepEqual(result, ['Talle Único', 'Otro Talle']);
});

test('sortSizes: talles duplicados no se pierden', () => {
  const result = sortSizes(['M', 'M', 'S']);
  assert.equal(result.length, 3);
});

test('buildVariantGrid: matriz completa — 3 talles x 2 colores = 6 combinaciones', () => {
  const grid = buildVariantGrid({ sizes: ['S', 'M', 'L'], colors: ['Negro', 'Blanco'] });
  assert.equal(grid.length, 6);
  for (const row of grid) {
    assert.ok('size' in row);
    assert.ok('sizeOrder' in row);
    assert.ok('color' in row);
    assert.ok('sku' in row);
    assert.ok('stock' in row);
  }
});

test('buildVariantGrid: eje único de talle — color queda null en cada fila', () => {
  const grid = buildVariantGrid({ sizes: ['S', 'M'], colors: [] });
  assert.equal(grid.length, 2);
  assert.ok(grid.every((row) => row.color === null));
});

test('buildVariantGrid: eje único de color — size queda null en cada fila', () => {
  const grid = buildVariantGrid({ sizes: [], colors: ['Negro', 'Blanco'] });
  assert.equal(grid.length, 2);
  assert.ok(grid.every((row) => row.size === null));
});

test('buildVariantGrid: talles quedan ordenados por size_order dentro de la grilla', () => {
  const grid = buildVariantGrid({ sizes: ['L', 'S', 'M'], colors: [] });
  assert.deepEqual(grid.map((r) => r.size), ['S', 'M', 'L']);
});

test('buildVariantGrid: regeneración preserva stock/sku ya cargados vía defaults', () => {
  const defaults = { 'S|Negro': { sku: 'SKU-1', stock: 5 } };
  const grid = buildVariantGrid({ sizes: ['S'], colors: ['Negro', 'Blanco'], defaults });
  const row = grid.find((r) => r.size === 'S' && r.color === 'Negro');
  assert.equal(row.sku, 'SKU-1');
  assert.equal(row.stock, 5);
  const other = grid.find((r) => r.size === 'S' && r.color === 'Blanco');
  assert.equal(other.sku, null);
  assert.equal(other.stock, 0);
});
