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

// ---------------------------------------------------------------------
// Fase 6c (design.md, tasks.md Phase 3): panel de pedidos. RED-first.
const createdOrderIds = [];

async function seedOrderWithStatus(status, { variantId = null } = {}) {
  const publicToken = randomUUID();
  let vId = variantId;
  if (vId === undefined) {
    const { rows } = await pool.query('SELECT id FROM variants ORDER BY id LIMIT 1');
    vId = rows[0]?.id ?? null;
  }
  const order = await ordersModel.createWithItems({
    publicToken,
    customerName: 'Fixture 6c',
    subtotal: 50,
    itemsCount: 1,
    items: [
      {
        variantId: vId,
        productNameSnapshot: 'Fixture item 6c',
        size: 'M',
        color: 'Negro',
        unitPrice: 50,
        quantity: 1,
      },
    ],
  });
  if (status !== 'pendiente') {
    await pool.query('UPDATE orders SET status = $2 WHERE id = $1', [order.id, status]);
  }
  createdOrderIds.push(order.id);
  return order;
}

test('orders.findAllForAdmin: filtra por status y ordena por más nuevo primero', async () => {
  const pending = await seedOrderWithStatus('pendiente');
  const confirmed = await seedOrderWithStatus('confirmado');

  const { rows, total } = await ordersModel.findAllForAdmin({ status: 'pendiente', page: 1, perPage: 100 });
  const ids = rows.map((r) => Number(r.id));
  assert.ok(ids.includes(Number(pending.id)));
  assert.ok(!ids.includes(Number(confirmed.id)));
  assert.ok(total >= 1);
});

test('orders.findAllForAdmin: sin status devuelve todos, newest first', async () => {
  const older = await seedOrderWithStatus('pendiente');
  const newer = await seedOrderWithStatus('pendiente');

  const { rows } = await ordersModel.findAllForAdmin({ page: 1, perPage: 200 });
  const idxOlder = rows.findIndex((r) => Number(r.id) === Number(older.id));
  const idxNewer = rows.findIndex((r) => Number(r.id) === Number(newer.id));
  assert.ok(idxNewer < idxOlder, 'el pedido más nuevo debe listarse antes que el más viejo');
});

test('orders.findByIdWithItems: incluye snapshot de item con variant_id NULL', async () => {
  const order = await seedOrderWithStatus('pendiente', { variantId: null });

  const found = await ordersModel.findByIdWithItems(order.id);
  assert.ok(found);
  assert.equal(found.items.length, 1);
  assert.equal(found.items[0].variant_id, null);
  assert.equal(found.items[0].product_name_snapshot, 'Fixture item 6c');
  assert.equal(found.items[0].size, 'M');
  assert.equal(Number(found.items[0].quantity), 1);
});

test('orders.findByIdWithItems: id inexistente devuelve null', async () => {
  const found = await ordersModel.findByIdWithItems(999999999);
  assert.equal(found, null);
});

test('orders.updateStatus: CAS con expectedFrom correcto aplica y devuelve la fila', async () => {
  const order = await seedOrderWithStatus('pendiente');
  const updated = await ordersModel.updateStatus(order.id, 'pendiente', 'confirmado');
  assert.ok(updated);
  assert.equal(updated.status, 'confirmado');
});

test('orders.updateStatus: CAS con expectedFrom obsoleto devuelve null y no escribe', async () => {
  const order = await seedOrderWithStatus('confirmado');
  const result = await ordersModel.updateStatus(order.id, 'pendiente', 'confirmado');
  assert.equal(result, null);

  const { rows } = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
  assert.equal(rows[0].status, 'confirmado');
});

test('orders.countByStatus: cuenta solo el status pedido', async () => {
  const before = await ordersModel.countByStatus('cancelado');
  await seedOrderWithStatus('cancelado');
  const after = await ordersModel.countByStatus('cancelado');
  assert.equal(after, before + 1);
});

test.after(async () => {
  if (createdOrderIds.length > 0) {
    await pool.query('DELETE FROM orders WHERE id = ANY($1::bigint[])', [createdOrderIds]);
  }
  await pool.end();
});
