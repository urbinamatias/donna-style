// En producción los 4 datos de contacto son obligatorios: el repo solo trae
// defaults ficticios, y la web nunca debe mostrarlos. `env.js` corre al
// cargarse (y llama a process.exit), así que se prueba en un proceso hijo.
// cwd = tmpdir para que dotenv no levante el `.env` local de quien corre
// los tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ENV_PATH = path.join(__dirname, '../../src/config/env.js');

const CONTACT = {
  WHATSAPP_ADMIN: '5493510000000',
  INSTAGRAM: '@tienda_ejemplo',
  EMAIL_CONTACTO: 'contacto@example.com',
  CUIT: '27-00000000-6',
};

function loadEnv(vars) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(ENV_PATH)})`], {
    cwd: os.tmpdir(),
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: 'postgresql://user:pass@host/db',
      SESSION_SECRET: 'secreto-de-test',
      ...vars,
    },
    encoding: 'utf8',
  });
}

test('env: en producción, si falta un dato de contacto el proceso no arranca', () => {
  const { CUIT, ...withoutCuit } = CONTACT;
  const result = loadEnv({ NODE_ENV: 'production', ...withoutCuit });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Falta CUIT/);
});

test('env: en producción arranca con los 4 datos de contacto cargados', () => {
  const result = loadEnv({ NODE_ENV: 'production', ...CONTACT });
  assert.equal(result.status, 0, result.stderr);
});

test('env: en desarrollo arranca sin los datos de contacto (usa los defaults ficticios)', () => {
  const result = loadEnv({ NODE_ENV: 'development' });
  assert.equal(result.status, 0, result.stderr);
});
