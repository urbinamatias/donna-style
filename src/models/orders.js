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

function stripFullCount(row) {
  const { full_count, ...rest } = row;
  return rest;
}

// Listado admin (Fase 6c, design.md "findAllForAdmin"): newest first,
// filtrable por status. Un status inválido/desconocido se resuelve como "sin
// filtro" acá mismo — la ruta decide si eso corresponde a un 200 vacío o no.
async function findAllForAdmin({ status = null, page = 1, perPage = 50 } = {}) {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const offset = (safePage - 1) * perPage;

  const { rows } = await pool.query(
    `SELECT o.*, COUNT(*) OVER() AS full_count
     FROM orders o
     WHERE ($1::text IS NULL OR o.status = $1)
     ORDER BY o.created_at DESC
     LIMIT $2 OFFSET $3`,
    [status, perPage, offset]
  );

  const total = rows.length > 0 ? Number(rows[0].full_count) : 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return { rows: rows.map(stripFullCount), total, totalPages };
}

// Detalle admin por id (Fase 6c): misma forma de dato que findByToken (orden
// + items), pero por id — nunca expuesto públicamente por esta vía porque
// vive detrás de requireAdmin.
async function findByIdWithItems(id) {
  const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  const order = orderRows[0];
  if (!order) return null;

  const items = await findItems(order.id);
  return { ...order, items };
}

// `FOR UPDATE` (design.md D2): bloquea la fila dentro de la transacción del
// caller para que dos confirmaciones concurrentes del mismo pedido nunca
// lean el mismo `from` a la vez.
async function findStatusForUpdate(id, client = pool) {
  const { rows } = await client.query('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [id]);
  return rows[0]?.status ?? null;
}

async function findItems(orderId, client = pool) {
  const { rows } = await client.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [orderId]);
  return rows;
}

// CAS (design.md D2, más fuerte que `WHERE status <> 'confirmado'`):
// `UPDATE ... WHERE id = $1 AND status = $2`. `rowCount === 0` significa que
// otra transacción ya movió el status primero (double-submit, dos tabs) —
// el caller lo interpreta como "la transición ya no aplica", nunca como error.
async function updateStatus(id, expectedFrom, next, client = pool) {
  const { rows } = await client.query(
    'UPDATE orders SET status = $3 WHERE id = $1 AND status = $2 RETURNING *',
    [id, expectedFrom, next]
  );
  return rows[0] || null;
}

async function countByStatus(status) {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM orders WHERE status = $1', [status]);
  return rows[0].n;
}

module.exports = {
  createWithItems,
  findByToken,
  findAllForAdmin,
  findByIdWithItems,
  findStatusForUpdate,
  findItems,
  updateStatus,
  countByStatus,
};
