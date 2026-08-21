// Fase 8 (fase8-bugs-produccion, spec "Announcement Bar Content"): la barra
// de promos pasó de `site_settings.announcement_bar_text` (resolvía vacío
// en producción y ocultaba la barra) a una constante code-owned. Este test
// fija el contrato: exactamente 3 mensajes, en este orden, congelados.
const test = require('node:test');
const assert = require('node:assert/strict');

const { ANNOUNCEMENT_ITEMS } = require('../../src/config/announcement');

test('ANNOUNCEMENT_ITEMS: expone exactamente los 3 mensajes fijos, en orden', () => {
  assert.deepEqual(ANNOUNCEMENT_ITEMS, [
    'Envíos a todo el país',
    '6 cuotas sin interés',
    '30% off abonando con efectivo/transferencia bancaria',
  ]);
});

test('ANNOUNCEMENT_ITEMS: está congelado (Object.freeze), no editable en runtime', () => {
  assert.equal(Object.isFrozen(ANNOUNCEMENT_ITEMS), true);
});
