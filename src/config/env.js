require('dotenv').config();

const {
  DATABASE_URL,
  PORT,
  NODE_ENV,
  NOMBRE_TIENDA,
  WHATSAPP_ADMIN,
  INSTAGRAM,
  EMAIL_CONTACTO,
  CUIT,
  SITE_URL,
} = process.env;

if (!DATABASE_URL) {
  // Fail fast: sin conexión a la base no tiene sentido levantar el proceso.
  console.error('Falta DATABASE_URL en las variables de entorno. Revisá .env.');
  process.exit(1);
}

const port = PORT ? Number(PORT) : 3000;

// Datos del cliente (§0 de prompt.md): nunca hardcodeados en las vistas.
// Los defaults acá abajo son los valores reales del cliente documentados en
// prompt.md, para que el sitio no quede roto si todavía no se agregaron a
// `.env` — pero la fuente de verdad sigue siendo la variable de entorno.
const config = Object.freeze({
  DATABASE_URL,
  PORT: port,
  NODE_ENV: NODE_ENV || 'development',
  NOMBRE_TIENDA: NOMBRE_TIENDA || 'Donna Style',
  WHATSAPP_ADMIN: WHATSAPP_ADMIN || '5493517505083',
  INSTAGRAM: INSTAGRAM || '@donna_styleok',
  EMAIL_CONTACTO: EMAIL_CONTACTO || 'yesi2682@hotmail.com',
  CUIT: CUIT || '27-29456245-7',
  SITE_URL: SITE_URL || `http://localhost:${port}`,
});

module.exports = config;
