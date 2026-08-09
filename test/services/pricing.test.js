// Tests del servicio de pricing (precio transferencia/efectivo y cuotas,
// obs #406/#407: base_price ya es el precio de venta actual). Puro, sin DB.
const test = require('node:test');
const assert = require('node:assert/strict');

const { computeTransferPrice, computeInstallmentValue, TRANSFER_DISCOUNT, INSTALLMENTS } = require('../../src/services/pricing');

test('computeTransferPrice: aplica 30% de descuento y redondea', () => {
  assert.equal(computeTransferPrice('18700'), 13090);
});

test('computeInstallmentValue: divide en 6 cuotas y redondea', () => {
  assert.equal(computeInstallmentValue('18700'), 3117);
});

test('computeTransferPrice: coerciona string numérico de pg con decimales', () => {
  assert.equal(computeTransferPrice('18700.00'), 13090);
});

test('computeInstallmentValue: coerciona string numérico de pg con decimales', () => {
  assert.equal(computeInstallmentValue('18700.00'), 3117);
});

test('computeTransferPrice: null en input null/undefined/NaN/no numérico', () => {
  assert.equal(computeTransferPrice(null), null);
  assert.equal(computeTransferPrice(undefined), null);
  assert.equal(computeTransferPrice(NaN), null);
  assert.equal(computeTransferPrice('no-es-numero'), null);
});

test('computeInstallmentValue: null en input null/undefined/NaN/no numérico', () => {
  assert.equal(computeInstallmentValue(null), null);
  assert.equal(computeInstallmentValue(undefined), null);
  assert.equal(computeInstallmentValue(NaN), null);
  assert.equal(computeInstallmentValue('no-es-numero'), null);
});

test('computeTransferPrice: null si basePrice es negativo', () => {
  assert.equal(computeTransferPrice('-100'), null);
});

test('computeInstallmentValue: null si basePrice es negativo', () => {
  assert.equal(computeInstallmentValue('-100'), null);
});

test('computeInstallmentValue: null si installments es 0', () => {
  assert.equal(computeInstallmentValue('18700', 0), null);
});

test('computeInstallmentValue: null si installments es negativo', () => {
  assert.equal(computeInstallmentValue('18700', -6), null);
});

test('exporta las constantes de negocio TRANSFER_DISCOUNT e INSTALLMENTS', () => {
  assert.equal(TRANSFER_DISCOUNT, 0.30);
  assert.equal(INSTALLMENTS, 6);
});
