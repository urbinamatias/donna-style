require('dotenv').config();

const { DATABASE_URL, PORT, NODE_ENV } = process.env;

if (!DATABASE_URL) {
  // Fail fast: sin conexión a la base no tiene sentido levantar el proceso.
  console.error('Falta DATABASE_URL en las variables de entorno. Revisá .env.');
  process.exit(1);
}

const config = Object.freeze({
  DATABASE_URL,
  PORT: PORT ? Number(PORT) : 3000,
  NODE_ENV: NODE_ENV || 'development',
});

module.exports = config;
