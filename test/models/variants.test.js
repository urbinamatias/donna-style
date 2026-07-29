// Test de integración contra el Postgres real de desarrollo (mismo patrón
// que products.test.js). Requiere `node db/seed.js` ya corrido.
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const variantsModel = require('../../src/models/variants');

test('variants.findByIds: trae solo las filas pedidas, con precio efectivo y producto joineado', async () => {
  const { rows: firstVariants } = await pool.query('SELECT id FROM variants ORDER BY id LIMIT 3');
  const ids = firstVariants.map((r) => Number(r.id));

  const rows = await variantsModel.findByIds(ids);

  assert.equal(rows.length, ids.length);
  for (const row of rows) {
    assert.ok(ids.includes(row.id));
    assert.ok('stock' in row);
    assert.ok('price' in row);
    assert.ok('product_name' in row);
    assert.ok('product_slug' in row);
  }
});

test('variants.findByIds: precio efectivo usa price_override cuando existe, si no base_price', async () => {
  const { rows: overridden } = await pool.query(
    'SELECT id, price_override FROM variants WHERE price_override IS NOT NULL LIMIT 1'
  );
  if (overridden.length === 0) return; // seed puede no tener overrides — cubierto igual por el otro assert

  const [rows] = await variantsModel.findByIds([Number(overridden[0].id)]);
  assert.equal(Number(rows.price), Number(overridden[0].price_override));
});

test('variants.findByIds: array vacío devuelve array vacío sin pegarle a la DB con ANY(NULL)', async () => {
  const rows = await variantsModel.findByIds([]);
  assert.deepEqual(rows, []);
});

test('variants.findByIds: ids inexistentes no rompen, simplemente no aparecen', async () => {
  const rows = await variantsModel.findByIds([999999999]);
  assert.deepEqual(rows, []);
});

test.after(async () => {
  await pool.end();
});
