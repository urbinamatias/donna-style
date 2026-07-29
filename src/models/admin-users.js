// Acceso a datos de `admin_users`. SQL crudo parametrizado, sin ORM.
const db = require('../db/pool');

async function create({ email, passwordHash }) {
  const { rows } = await db.query(
    `INSERT INTO admin_users (email, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING
     RETURNING *`,
    [email, passwordHash]
  );
  return rows[0] || null;
}

async function findByEmail(email) {
  const { rows } = await db.query('SELECT * FROM admin_users WHERE email = $1', [email]);
  return rows[0] || null;
}

module.exports = { create, findByEmail };
