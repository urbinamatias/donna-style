// Servicio puro de semántica de estado de pedidos (Fase 6c, design.md D1).
// Sin DB: transición, efecto de stock y badge en un único módulo, mismo
// patrón que availability.js/format.js.
const test = require('node:test');
const assert = require('node:assert/strict');

const ordersStatus = require('../../src/services/orders-status');

test('canTransition: matriz completa de transiciones válidas', () => {
  assert.equal(ordersStatus.canTransition('pendiente', 'confirmado'), true);
  assert.equal(ordersStatus.canTransition('pendiente', 'cancelado'), true);
  assert.equal(ordersStatus.canTransition('confirmado', 'entregado'), true);
  assert.equal(ordersStatus.canTransition('confirmado', 'cancelado'), true);
  assert.equal(ordersStatus.canTransition('cancelado', 'pendiente'), true);
});

test('canTransition: pendiente->entregado directo esta bloqueado', () => {
  assert.equal(ordersStatus.canTransition('pendiente', 'entregado'), false);
});

test('canTransition: entregado es terminal, sin transiciones salientes', () => {
  assert.equal(ordersStatus.canTransition('entregado', 'pendiente'), false);
  assert.equal(ordersStatus.canTransition('entregado', 'confirmado'), false);
  assert.equal(ordersStatus.canTransition('entregado', 'cancelado'), false);
  assert.equal(ordersStatus.canTransition('entregado', 'entregado'), false);
});

test('canTransition: self-transitions siempre rechazadas', () => {
  assert.equal(ordersStatus.canTransition('pendiente', 'pendiente'), false);
  assert.equal(ordersStatus.canTransition('confirmado', 'confirmado'), false);
  assert.equal(ordersStatus.canTransition('cancelado', 'cancelado'), false);
});

test('canTransition: status desconocido siempre false', () => {
  assert.equal(ordersStatus.canTransition('fantasma', 'confirmado'), false);
  assert.equal(ordersStatus.canTransition('pendiente', 'fantasma'), false);
  assert.equal(ordersStatus.canTransition(undefined, 'confirmado'), false);
  assert.equal(ordersStatus.canTransition('pendiente', undefined), false);
});

test('stockEffect: pendiente->confirmado es decrement', () => {
  assert.equal(ordersStatus.stockEffect('pendiente', 'confirmado'), 'decrement');
});

test('stockEffect: confirmado->cancelado es restore', () => {
  assert.equal(ordersStatus.stockEffect('confirmado', 'cancelado'), 'restore');
});

test('stockEffect: el resto de los pares es none', () => {
  assert.equal(ordersStatus.stockEffect('pendiente', 'cancelado'), 'none');
  assert.equal(ordersStatus.stockEffect('cancelado', 'pendiente'), 'none');
  assert.equal(ordersStatus.stockEffect('confirmado', 'entregado'), 'none');
  assert.equal(ordersStatus.stockEffect('entregado', 'entregado'), 'none');
  assert.equal(ordersStatus.stockEffect('pendiente', 'entregado'), 'none');
  assert.equal(ordersStatus.stockEffect('pendiente', 'pendiente'), 'none');
});

test('statusBadge: cubre los 4 estados con label + className, sin HTML crudo', () => {
  for (const status of ['pendiente', 'confirmado', 'entregado', 'cancelado']) {
    const badge = ordersStatus.statusBadge(status);
    assert.equal(typeof badge.label, 'string');
    assert.equal(typeof badge.className, 'string');
    assert.doesNotMatch(badge.label, /[<>]/);
    assert.doesNotMatch(badge.className, /[<>]/);
  }
});

test('statusBadge: status desconocido devuelve un badge neutro, nunca lanza', () => {
  const badge = ordersStatus.statusBadge('fantasma');
  assert.equal(typeof badge.label, 'string');
  assert.equal(typeof badge.className, 'string');
});

test('LOW_STOCK_THRESHOLD: fijo en 2', () => {
  assert.equal(ordersStatus.LOW_STOCK_THRESHOLD, 2);
});
