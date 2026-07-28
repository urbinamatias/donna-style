// Runner de migraciones minimalista: sin librerías de migración, solo `pg` +
// una tabla `schema_migrations` para trackear qué archivos ya corrieron.
// No soporta down-migrations a propósito (ver design.md Phase 1).
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function main() {
  const { DATABASE_URL } = process.env;
  if (!DATABASE_URL) {
    console.error('Falta DATABASE_URL en las variables de entorno. Revisá .env.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Bootstrap: garantiza que la tabla de tracking exista incluso si
    // 001_schema_migrations.sql todavía no corrió (DB completamente nueva).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const { rows } = await pool.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));

    let appliedCount = 0;

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        appliedCount += 1;
        console.log(`✔ Aplicada: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`✘ Error aplicando ${file}:`, err.message);
        process.exitCode = 1;
        break;
      } finally {
        client.release();
      }
    }

    if (!process.exitCode) {
      console.log(`Migraciones aplicadas: ${appliedCount}`);
    }
  } finally {
    await pool.end();
  }
}

main();
