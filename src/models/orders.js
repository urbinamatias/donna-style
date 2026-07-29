// Acceso a datos de `orders`/`order_items`. SQL crudo parametrizado, sin ORM.
// Fase 2 solo deja el helper listo con el esquema; la Fase 5 conecta el flujo
// completo de checkout (§10 item 5).
const { pool } = require('../db/pool');

// items: [{ variantId, productNameSnapshot, size, color, unitPrice, quantity }]
// publicToken debe generarse con nanoid ANTES de llamar (aleatorio, nunca
// derivado del id — §3.1, requisito de seguridad). order_code lo pone el
// trigger set_order_code() sobre el id ya resuelto por BIGSERIAL.
async function createWithItems({ publicToken, customerName = null, customerNote = null, subtotal, itemsCount, items }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO orders (public_token, customer_name, customer_note, subtotal, items_count)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [publicToken, customerName, customerNote, subtotal, itemsCount]
    );
    const order = rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items
           (order_id, variant_id, product_name_snapshot, size, color, unit_price, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [order.id, item.variantId ?? null, item.productNameSnapshot, item.size ?? null, item.color ?? null, item.unitPrice, item.quantity]
      );
    }

    await client.query('COMMIT');
    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Fase 5 (design.md): lectura pública por token — nunca por id (§3.1, evita
// enumeración). Dos queries parametrizadas en vez de un JOIN: `orders` es
// 1 fila y `order_items` son N, un JOIN duplicaría los campos del pedido
// por cada item sin necesidad.
async function findByToken(publicToken) {
  const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE public_token = $1', [publicToken]);
  const order = orderRows[0];
  if (!order) return null;

  const { rows: items } = await pool.query(
    'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id',
    [order.id]
  );

  return { ...order, items };
}

module.exports = { createWithItems, findByToken };
