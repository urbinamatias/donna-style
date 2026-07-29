// Tests de `buildDecisionTable` (Fase 4, design.md D4). Compuesta a partir
// de las funciones ya probadas en availability.test.js — nunca reimplementa
// las reglas de §3.2, solo serializa su resultado para el cliente.
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDecisionTable } = require('../../src/services/availability');

// Fixture exacto del proposal: M/Negro agotado, M/Blanco y L/Negro con stock.
const fixture = [
  { id: 1, size: 'M', size_order: 30, color: 'Negro', stock: 0, price: '10000.00' },
  { id: 2, size: 'M', size_order: 30, color: 'Blanco', stock: 5, price: '10000.00' },
  { id: 3, size: 'L', size_order: 40, color: 'Negro', stock: 3, price: '11000.00' },
];

test('buildDecisionTable: expone los ejes presentes y sus valores vivos', () => {
  const table = buildDecisionTable(fixture);
  assert.deepEqual(table.axes, ['size', 'color']);
  assert.deepEqual([...table.values.size].sort(), ['L', 'M']);
  assert.deepEqual([...table.values.color].sort(), ['Blanco', 'Negro']);
});

test('buildDecisionTable: elegir L deja solo Negro en la matriz cruzada', () => {
  const table = buildDecisionTable(fixture);
  assert.deepEqual(table.matrix.size.L.color, ['Negro']);
});

test('buildDecisionTable: elegir M deja solo Blanco en la matriz cruzada', () => {
  const table = buildDecisionTable(fixture);
  assert.deepEqual(table.matrix.size.M.color, ['Blanco']);
});

test('buildDecisionTable: M/Negro (agotado) no aparece en absoluto en variants', () => {
  const table = buildDecisionTable(fixture);
  assert.ok(!('M|Negro' in table.variants));
  assert.ok('M|Blanco' in table.variants);
  assert.ok('L|Negro' in table.variants);
});

test('buildDecisionTable: cada entrada de variants trae id, stock y price vivos', () => {
  const table = buildDecisionTable(fixture);
  assert.deepEqual(table.variants['L|Negro'], { id: 3, stock: 3, price: '11000.00' });
});

test('buildDecisionTable: default sigue la regla del talle más chico por size_order', () => {
  const table = buildDecisionTable(fixture);
  assert.deepEqual(table.default, { size: 'M', color: 'Blanco' });
});

test('buildDecisionTable: sin stock en ninguna variante da hasAnyStock false y sin matriz', () => {
  const zeroStock = [
    { id: 1, size: 'S', size_order: 20, color: 'Negro', stock: 0, price: '5000.00' },
  ];
  const table = buildDecisionTable(zeroStock);
  assert.equal(table.hasAnyStock, false);
  assert.deepEqual(table.variants, {});
});

test('buildDecisionTable: producto sin ejes expone una única variante bajo clave vacía', () => {
  const noAxes = [{ id: 1, size: null, size_order: 0, color: null, stock: 2, price: '3000.00' }];
  const table = buildDecisionTable(noAxes);
  assert.equal(table.hasAnyStock, true);
  assert.deepEqual(table.axes, []);
  assert.deepEqual(table.variants[''], { id: 1, stock: 2, price: '3000.00' });
});
