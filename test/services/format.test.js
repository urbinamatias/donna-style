// Tests del formateador es-AR (§8 de prompt.md). Puro, sin DB.
const test = require('node:test');
const assert = require('node:assert/strict');

const { formatPrice, formatDate } = require('../../src/services/format');

test('formatPrice: formato es-AR con punto de miles y coma decimal', () => {
  assert.equal(formatPrice(18700), '$18.700,00');
});

test('formatPrice: monto con decimales', () => {
  assert.equal(formatPrice(31990.5), '$31.990,50');
});

test('formatDate: formato dd/mm/aaaa', () => {
  // Mediodía UTC evita corrimiento de día por huso horario en el runner.
  assert.equal(formatDate(new Date('2026-07-28T12:00:00Z')), '28/07/2026');
});

test('formatDate: acepta string ISO además de Date', () => {
  assert.equal(formatDate('2026-01-05T12:00:00Z'), '05/01/2026');
});
