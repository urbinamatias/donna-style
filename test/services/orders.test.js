// Tests del servicio puro de armado de mensaje de WhatsApp (Fase 5, §5.8 de
// prompt.md). Sin DB: funciones puras sobre datos ya resueltos (mismo patrón
// que cart.test.js/availability.test.js). RED-first — este archivo se
// escribe ANTES de `src/services/orders.js` (design.md D3, tasks.md 1.1).
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildWhatsappMessage, buildShortMessage, buildWaLink } = require('../../src/services/orders');

function baseOpts(overrides = {}) {
  return {
    storeName: 'Donna Style',
    orderCode: 'PED-0042',
    lines: [
      { name: 'Remera Taylor', size: 'M', color: 'Negro', quantity: 2, price: 31990, lineTotal: 63980 },
      { name: 'Jean Crop Classic', size: '38', color: 'Azul', quantity: 1, price: 70700, lineTotal: 70700 },
    ],
    subtotal: 134680,
    count: 3,
    customerName: null,
    customerNote: null,
    orderUrl: 'https://donnastyle.com.ar/pedido/abc123def456',
    ...overrides,
  };
}

test('buildWhatsappMessage: mensaje completo con nombre y nota (§5.8 formato exacto)', () => {
  const { text, truncated } = buildWhatsappMessage(
    baseOpts({ customerName: 'Juana Pérez', customerNote: 'Entrega en local' })
  );

  const expected = [
    '¡Hola Donna Style! Quiero hacer este pedido:',
    '',
    'Pedido: PED-0042',
    '',
    '• REMERA TAYLOR',
    '  Talle M / Negro',
    '  2 x $31.990,00 = $63.980,00',
    '',
    '• JEAN CROP CLASSIC',
    '  Talle 38 / Azul',
    '  1 x $70.700,00 = $70.700,00',
    '',
    'Total: $134.680,00 (3 productos)',
    '',
    'Nombre: Juana Pérez',
    'Nota: Entrega en local',
    'Ver pedido: https://donnastyle.com.ar/pedido/abc123def456',
  ].join('\n');

  assert.equal(text, expected);
  assert.equal(truncated, false);
});

test('buildWhatsappMessage: sin nombre ni nota, no hay etiqueta ni línea en blanco residual', () => {
  const { text } = buildWhatsappMessage(baseOpts());

  assert.ok(!text.includes('Nombre'));
  assert.ok(!text.includes('Nota'));
  assert.ok(text.includes('Total: $134.680,00 (3 productos)\n\nVer pedido:'));
});

test('buildWhatsappMessage: item con talle y color', () => {
  const { text } = buildWhatsappMessage(
    baseOpts({ lines: [{ name: 'Top', size: 'M', color: 'Negro', quantity: 1, price: 100, lineTotal: 100 }] })
  );
  assert.ok(text.includes('  Talle M / Negro'));
});

test('buildWhatsappMessage: item solo con talle', () => {
  const { text } = buildWhatsappMessage(
    baseOpts({ lines: [{ name: 'Top', size: 'M', color: null, quantity: 1, price: 100, lineTotal: 100 }] })
  );
  assert.ok(text.includes('  Talle M\n'));
  assert.ok(!text.includes('Talle M /'));
});

test('buildWhatsappMessage: item solo con color (sin prefijo "Talle")', () => {
  const { text } = buildWhatsappMessage(
    baseOpts({ lines: [{ name: 'Top', size: null, color: 'Negro', quantity: 1, price: 100, lineTotal: 100 }] })
  );
  assert.ok(text.includes('  Negro\n'));
  assert.ok(!text.includes('Talle Negro'));
});

test('buildWhatsappMessage: item sin talle ni color no tiene línea de atributos', () => {
  const { text } = buildWhatsappMessage(
    baseOpts({ lines: [{ name: 'Top', size: null, color: null, quantity: 1, price: 100, lineTotal: 100 }] })
  );
  const lines = text.split('\n');
  const nameIdx = lines.findIndex((l) => l === '• TOP');
  assert.equal(lines[nameIdx + 1], '  1 x $100,00 = $100,00');
});

test('buildWhatsappMessage: más de 15 items trunca a encabezado + total + link, sin bloques de item', () => {
  const lines = Array.from({ length: 16 }, (_, i) => ({
    name: `Producto ${i}`,
    size: null,
    color: null,
    quantity: 1,
    price: 100,
    lineTotal: 100,
  }));

  const { text, truncated } = buildWhatsappMessage(baseOpts({ lines, subtotal: 1600, count: 16 }));

  assert.equal(truncated, true);
  assert.ok(!text.includes('•'));
  assert.ok(text.includes('Pedido: PED-0042'));
  assert.ok(text.includes('Total: $1.600,00 (16 productos)'));
  assert.ok(text.includes('Ver pedido:'));
});

test('buildWhatsappMessage: 15 items o menos pero mensaje codificado supera 1500 caracteres trunca', () => {
  const longNote = 'x'.repeat(2000);
  const lines = Array.from({ length: 5 }, (_, i) => ({
    name: `Producto largo número ${i}`,
    size: 'M',
    color: 'Negro',
    quantity: 1,
    price: 100,
    lineTotal: 100,
  }));

  const { text, truncated } = buildWhatsappMessage(
    baseOpts({ lines, subtotal: 500, count: 5, customerNote: longNote })
  );

  assert.equal(truncated, true);
  assert.ok(!text.includes('•'));
});

test('buildWhatsappMessage: caso límite — 15 items con mensaje codificado <= 1500 no trunca', () => {
  const lines = Array.from({ length: 15 }, (_, i) => ({
    name: `P${i}`,
    size: null,
    color: null,
    quantity: 1,
    price: 100,
    lineTotal: 100,
  }));

  const { truncated, text } = buildWhatsappMessage(baseOpts({ lines, subtotal: 1500, count: 15 }));

  assert.ok(encodeURIComponent(text).length <= 1500, 'fixture debe quedar bajo el umbral para probar el caso límite');
  assert.equal(truncated, false);
  assert.ok(text.includes('•'));
});

test('buildShortMessage: encabezado + total + link, sin items ni bloques', () => {
  const text = buildShortMessage(baseOpts());
  assert.ok(text.includes('¡Hola Donna Style!'));
  assert.ok(text.includes('Pedido: PED-0042'));
  assert.ok(text.includes('Total: $134.680,00 (3 productos)'));
  assert.ok(text.includes('Ver pedido: https://donnastyle.com.ar/pedido/abc123def456'));
  assert.ok(!text.includes('•'));
});

test('buildWaLink: codifica el mensaje (saltos de línea, acentos) sobre el número de config', () => {
  const message = '¡Hola! Pedido\ncon salto de línea y acentós';
  const link = buildWaLink('5493517505083', message);
  assert.equal(link, `https://wa.me/5493517505083?text=${encodeURIComponent(message)}`);
});
