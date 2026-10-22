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
  SESSION_SECRET,
} = process.env;

if (!DATABASE_URL) {
  // Fail fast: sin conexión a la base no tiene sentido levantar el proceso.
  console.error('Falta DATABASE_URL en las variables de entorno. Revisá .env.');
  process.exit(1);
}

const port = PORT ? Number(PORT) : 3000;
const nodeEnv = NODE_ENV || 'development';

// Fase 4 (design.md, "Open Questions"): SESSION_SECRET es obligatorio en
// producción — sin él, un reinicio del proceso invalida todas las sesiones
// (mala UX) y, peor, un secreto default conocido sería explotable para
// forjar cookies firmadas. En desarrollo se autogenera uno temporal (no
// persiste entre reinicios) para no bloquear a quien todavía no sincronizó
// `.env`, con un warning bien visible.
let sessionSecret = SESSION_SECRET;
if (!sessionSecret) {
  if (nodeEnv === 'production') {
    console.error('Falta SESSION_SECRET en las variables de entorno. Revisá .env.');
    process.exit(1);
  }
  sessionSecret = require('node:crypto').randomBytes(32).toString('hex');
  console.warn(
    '[dev] SESSION_SECRET no configurado — usando uno temporal generado en memoria. ' +
      'Las sesiones no sobreviven un reinicio del proceso. Agregalo a .env antes de producción.'
  );
}

// Datos del cliente (§0 de prompt.md): nunca hardcodeados en las vistas ni
// en el repo. Los datos reales viven solo en el `.env` del servidor (y en
// `site_settings` si la dueña los editó desde el panel). En producción las 4
// variables son obligatorias — mismo criterio que SESSION_SECRET: mejor no
// arrancar que mostrar en la web los valores ficticios de desarrollo de abajo.
const contactVars = { WHATSAPP_ADMIN, INSTAGRAM, EMAIL_CONTACTO, CUIT };
if (nodeEnv === 'production') {
  const missing = Object.keys(contactVars).filter((name) => !contactVars[name]);
  if (missing.length > 0) {
    console.error(`Falta ${missing.join(', ')} en las variables de entorno. Revisá .env.`);
    process.exit(1);
  }
}

const config = Object.freeze({
  DATABASE_URL,
  PORT: port,
  NODE_ENV: nodeEnv,
  NOMBRE_TIENDA: NOMBRE_TIENDA || 'Donna Style',
  WHATSAPP_ADMIN: WHATSAPP_ADMIN || '5493510000000',
  INSTAGRAM: INSTAGRAM || '@tienda_ejemplo',
  EMAIL_CONTACTO: EMAIL_CONTACTO || 'contacto@example.com',
  CUIT: CUIT || '27-00000000-6',
  SITE_URL: SITE_URL || `http://localhost:${port}`,
  SESSION_SECRET: sessionSecret,
});

module.exports = config;
