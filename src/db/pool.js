const { Pool } = require('pg');
const { DATABASE_URL } = require('../config/env');

const pool = new Pool({ connectionString: DATABASE_URL });

// Helper de transacción (Fase 6a, design.md "File Changes" src/db/pool.js).
// `fn` recibe un cliente dedicado (no el pool) para que todas sus queries
// corran en la misma transacción; BEGIN/COMMIT/ROLLBACK quedan acá, una sola
// vez, en vez de repetirse en cada modelo con escritura multi-tabla
// (producto + categorías + variantes).
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  withTransaction,
};
