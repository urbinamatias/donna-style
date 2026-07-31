// Resolver de 3 niveles para los datos de contacto del pie/checkout
// (design.md D-C): `site_settings` (panel, trimmed non-empty) → `.env`
// (`config/env.js`, ya trae sus propios defaults documentados) → nunca
// null/undefined. `merge` es PURA (sin DB) para poder testearla sin mocks;
// `resolve()` es el único punto que hace I/O real.
//
// Whitelist EXPLÍCITA: antes de esta fase, `res.locals.storeConfig` era el
// objeto `config` COMPLETO — eso filtraba `SESSION_SECRET`/`DATABASE_URL` a
// cualquier vista. `merge()` arma un objeto NUEVO con solo estas 6 claves,
// nunca un spread de `config`.
const siteSettingsModel = require('../models/site-settings');
const config = require('../config/env');

const KEYS = ['whatsapp_admin', 'instagram', 'email_contacto', 'cuit'];

const KEY_TO_CONFIG_FIELD = {
  whatsapp_admin: 'WHATSAPP_ADMIN',
  instagram: 'INSTAGRAM',
  email_contacto: 'EMAIL_CONTACTO',
  cuit: 'CUIT',
};

// Bug real (QA fase 6d): antes, un `site_settings` vacío ('') y una fila
// AUSENTE se trataban igual — los dos caían al fallback de `.env`. Eso
// rompía "el panel vacío oculta el link" para instagram/email_contacto: la
// dueña borraba el campo, el resolver seguía usando el valor viejo de
// `.env`, el link del footer nunca desaparecía. La distinción correcta es
// si HAY fila en `site_settings` (la dueña guardó Configuración al menos
// una vez, sea cual sea el valor) vs. si NO hay fila (nunca tocó ese
// campo): con fila, el panel gana siempre, incluso vacío — spec "Panel
// value wins". Sin fila, recién ahí entra `.env`.
function pick(settingsValue, configValue) {
  if (typeof settingsValue === 'string') return settingsValue.trim();
  return typeof configValue === 'string' ? configValue : '';
}

// `sourceConfig` es inyectable (test unitario pasa un fixture; producción
// pasa `config/env.js`) — nunca se lee `process.env` directo acá.
function merge(sourceConfig, settings = {}) {
  const result = {
    NOMBRE_TIENDA: sourceConfig.NOMBRE_TIENDA || '',
    SITE_URL: sourceConfig.SITE_URL || '',
  };
  for (const key of KEYS) {
    const configField = KEY_TO_CONFIG_FIELD[key];
    result[configField] = pick(settings[key], sourceConfig[configField]);
  }
  return result;
}

// Sin DB — usado en el 500 handler (app.js), que nunca debe consultar la
// base en el camino de error.
function fromEnv() {
  return merge(config, {});
}

async function resolve() {
  const settings = await siteSettingsModel.getAll();
  return merge(config, settings);
}

module.exports = { KEYS, merge, fromEnv, resolve };
