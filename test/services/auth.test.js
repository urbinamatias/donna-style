// Tests del servicio de autenticación (Fase 6a, design.md D1). `bcryptjs`
// puro-JS (sin binario nativo — CLAUDE.md §5, mismo motivo por el que sharp
// exige correr npm desde Windows; bcryptjs no tiene ese problema porque no
// compila nada). Requiere `bcryptjs` instalado — ver manual step si falla
// con MODULE_NOT_FOUND.
const test = require('node:test');
const assert = require('node:assert/strict');

const bcrypt = require('bcryptjs');
const { verifyCredentials, hashPassword } = require('../../src/services/auth');

function fakeAdminUsers(admin) {
  return {
    async findByEmail(email) {
      if (admin && email === admin.email) return admin;
      return null;
    },
  };
}

test('hashPassword: produce un hash bcrypt de costo >= 12', async () => {
  const hash = await hashPassword('un-password-seguro');
  assert.match(hash, /^\$2[aby]\$\d{2}\$/);
  const cost = Number(hash.split('$')[2]);
  assert.ok(cost >= 12, `costo del hash (${cost}) debe ser >= 12`);
});

test('verifyCredentials: contraseña correcta devuelve {id,email}', async () => {
  const hash = await bcrypt.hash('correcta123', 12);
  const admin = { id: 1, email: 'dueña@donnastyle.com', password_hash: hash };
  const result = await verifyCredentials('dueña@donnastyle.com', 'correcta123', fakeAdminUsers(admin));
  assert.deepEqual(result, { id: 1, email: 'dueña@donnastyle.com' });
});

test('verifyCredentials: contraseña incorrecta devuelve null', async () => {
  const hash = await bcrypt.hash('correcta123', 12);
  const admin = { id: 1, email: 'dueña@donnastyle.com', password_hash: hash };
  const result = await verifyCredentials('dueña@donnastyle.com', 'incorrecta', fakeAdminUsers(admin));
  assert.equal(result, null);
});

test('verifyCredentials: email desconocido devuelve null sin distinguirse del caso de contraseña incorrecta', async () => {
  const result = await verifyCredentials('nadie@nada.com', 'lo-que-sea', fakeAdminUsers(null));
  assert.equal(result, null);
});

test('verifyCredentials: email desconocido igual ejecuta un compare bcrypt (sin timing oracle)', async () => {
  let compareCalled = false;
  const originalCompare = bcrypt.compare;
  bcrypt.compare = async (...args) => {
    compareCalled = true;
    return originalCompare(...args);
  };
  try {
    await verifyCredentials('nadie@nada.com', 'lo-que-sea', fakeAdminUsers(null));
    assert.equal(compareCalled, true, 'debe correr un compare igual, contra un hash dummy, para no filtrar existencia por tiempo');
  } finally {
    bcrypt.compare = originalCompare;
  }
});
