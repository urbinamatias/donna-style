// RED (tasks.md 1.8, design.md D-C): resolver de 3 niveles
// (site_settings → .env → default) para los 4 datos de contacto. `merge()`
// es la parte pura y testeable — `resolve()`/`fromEnv()` hacen I/O
// (getAll() de site-settings) y no se prueban acá con mocks (proyecto no
// usa mocks, test de integración real va en admin-settings/checkout).
const test = require('node:test');
const assert = require('node:assert/strict');

const { merge, KEYS } = require('../../src/services/store-config');

const baseConfig = {
  NOMBRE_TIENDA: 'Donna Style',
  SITE_URL: 'http://localhost:3000',
  WHATSAPP_ADMIN: '5493517505083',
  INSTAGRAM: '@donna_styleok',
  EMAIL_CONTACTO: 'yesi2682@hotmail.com',
  CUIT: '27-29456245-7',
  SESSION_SECRET: 'super-secreto-no-debe-salir-nunca',
  DATABASE_URL: 'postgresql://user:pass@host/db',
};

test('merge: whitelist EXPLÍCITA — nunca expone SESSION_SECRET ni DATABASE_URL aunque estén en config', () => {
  const result = merge(baseConfig, {});
  assert.equal(result.SESSION_SECRET, undefined);
  assert.equal(result.DATABASE_URL, undefined);
  assert.deepEqual(Object.keys(result).sort(), [
    'CUIT',
    'EMAIL_CONTACTO',
    'INSTAGRAM',
    'NOMBRE_TIENDA',
    'SITE_URL',
    'WHATSAPP_ADMIN',
  ]);
});

test('merge: NOMBRE_TIENDA y SITE_URL sobreviven (footer los necesita)', () => {
  const result = merge(baseConfig, {});
  assert.equal(result.NOMBRE_TIENDA, 'Donna Style');
  assert.equal(result.SITE_URL, 'http://localhost:3000');
});

test('merge: valor en site_settings (panel) gana sobre config/.env', () => {
  const result = merge(baseConfig, { whatsapp_admin: '5491111111111' });
  assert.equal(result.WHATSAPP_ADMIN, '5491111111111');
});

// Bug real de QA fase 6d: antes, una fila vacía en site_settings y una fila
// AUSENTE se trataban igual (ambas caían al fallback de .env) — eso rompía
// "vaciar Instagram/mail en el panel oculta el link" porque .env seguía
// teniendo el valor viejo. La regla correcta: si HAY fila (la dueña guardó
// Configuración, sea cual sea el valor), el panel gana, incluso vacío.
test('merge: fila vacía/blanca en site_settings GANA (panel siempre gana si hay fila, incluso vacía)', () => {
  const result = merge(baseConfig, { instagram: '   ' });
  assert.equal(result.INSTAGRAM, '', 'una fila existente, aunque vacía, oculta el fallback de .env');
});

test('merge: sin site_settings en absoluto, usa el fallback de config/.env', () => {
  const result = merge(baseConfig, {});
  assert.equal(result.INSTAGRAM, '@donna_styleok');
  assert.equal(result.CUIT, '27-29456245-7');
});

test('merge: NUNCA devuelve null/undefined en ninguna de las 4 claves, incluso sin config ni settings', () => {
  const emptyConfig = { NOMBRE_TIENDA: 'Donna Style', SITE_URL: 'http://x' };
  const result = merge(emptyConfig, {});
  for (const key of ['WHATSAPP_ADMIN', 'INSTAGRAM', 'EMAIL_CONTACTO', 'CUIT']) {
    assert.equal(typeof result[key], 'string', `${key} debe ser siempre string`);
  }
});

test('KEYS: expone las 4 claves de site_settings en snake_case', () => {
  assert.deepEqual(KEYS.sort(), ['cuit', 'email_contacto', 'instagram', 'whatsapp_admin']);
});
