// Test de integración contra el Postgres real de desarrollo (mismo patrón
// que variants.test.js). RED-first — este archivo se escribe ANTES de
// agregar `findByToken` a `src/models/orders.js` (design.md, tasks.md 1.2).
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const ordersModel = require('../../src/models/orders');

async function seedOrder() {
  const publicToken = randomUUID();
  const { rows: variantRows } = await pool.query('SELECT id FROM variants ORDER BY id LIMIT 1');
  const variantId = variantRows[0]?.id ?? null;

  const order = await ordersModel.createWithItems({
    publicToken,
    customerName: 'Test Cliente',
    customerNote: null,
    subtotal: 199.99,
    itemsCount: 2,
    items: [
      {
        variantId,
        productNameSnapshot: 'Producto de prueba',
        size: 'M',
        color: 'Negro',
        unitPrice: 99.995,
        quantity: 2,
      },
    ],
  });

  return { order, publicToken };
}

test('orders.findByToken: trae el pedido con sus items para un token existente', async () => {
  const { order, publicToken } = await seedOrder();

  const found = await ordersModel.findByToken(publicToken);

  assert.ok(found);
  assert.equal(found.id, order.id);
  assert.equal(found.public_token, publicToken);
  assert.equal(found.order_code, order.order_code);
  assert.ok(Array.isArray(found.items));
  assert.equal(found.items.length, 1);
  assert.equal(found.items[0].product_name_snapshot, 'Producto de prueba');
  assert.equal(found.items[0].size, 'M');
  assert.equal(found.items[0].quantity, 2);
});

test('orders.findByToken: token inexistente devuelve null', async () => {
  const found = await ordersModel.findByToken('token-que-no-existe-jamas');
  assert.equal(found, null);
});

test.after(async () => {
  await pool.end();
});
