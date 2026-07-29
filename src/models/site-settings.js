// Acceso a datos de `site_settings` (KV plano — §3, §5.10). SQL crudo
// parametrizado, sin ORM.
const db = require('../db/pool');

async function set(key, value) {
  await db.query(
    `INSERT INTO site_settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

async function get(key) {
  const { rows } = await db.query('SELECT value FROM site_settings WHERE key = $1', [key]);
  return rows[0] ? rows[0].value : null;
}

async function getAll() {
  const { rows } = await db.query('SELECT key, value FROM site_settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

module.exports = { set, get, getAll };
