// Tests del middleware CSRF hand-rolled (design.md D3 — synchronizer token,
// sin dependencia nueva). `mintToken`/`verify` son unidades puras; el
// middleware Express se prueba con req/res/next fakeados, sin levantar el
// server completo (eso lo cubre test/routes/cart.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { mintToken, csrfProtection } = require('../../src/middleware/csrf');

test('mintToken: genera un string base64url no vacío', () => {
  const token = mintToken();
  assert.equal(typeof token, 'string');
  assert.ok(token.length > 20);
  assert.doesNotMatch(token, /[+/=]/); // base64url, no base64 estándar
});

function fakeReqRes({ method = 'POST', csrfToken = null, body = {}, headers = {} } = {}) {
  const req = {
    method,
    session: { csrfToken },
    body,
    headers,
    get(name) {
      return this.headers[name.toLowerCase()];
    },
  };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    jsonBody: null,
    json(payload) {
      this.jsonBody = payload;
      return this;
    },
  };
  return { req, res };
}

test('csrfProtection: GET pasa siempre, sin requerir token', () => {
  const { req, res } = fakeReqRes({ method: 'GET', csrfToken: null });
  let called = false;
  csrfProtection(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
});

test('csrfProtection: POST sin token en sesión (nunca minteado) es 403 y no llama next', () => {
  const { req, res } = fakeReqRes({ method: 'POST', csrfToken: null, body: {} });
  let called = false;
  csrfProtection(req, res, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('csrfProtection: POST con token de body inválido es 403 y no llama next', () => {
  const sessionToken = mintToken();
  const { req, res } = fakeReqRes({ method: 'POST', csrfToken: sessionToken, body: { _csrf: 'forjado' } });
  let called = false;
  csrfProtection(req, res, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('csrfProtection: POST con _csrf de body válido llama next', () => {
  const sessionToken = mintToken();
  const { req, res } = fakeReqRes({ method: 'POST', csrfToken: sessionToken, body: { _csrf: sessionToken } });
  let called = false;
  csrfProtection(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
});

test('csrfProtection: POST con X-CSRF-Token header válido llama next', () => {
  const sessionToken = mintToken();
  const { req, res } = fakeReqRes({
    method: 'POST',
    csrfToken: sessionToken,
    body: {},
    headers: { 'x-csrf-token': sessionToken },
  });
  let called = false;
  csrfProtection(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
});

test('csrfProtection: tokens de distinta longitud no explotan timingSafeEqual', () => {
  const sessionToken = crypto.randomBytes(32).toString('base64url');
  const { req, res } = fakeReqRes({ method: 'POST', csrfToken: sessionToken, body: { _csrf: 'x' } });
  let called = false;
  assert.doesNotThrow(() => {
    csrfProtection(req, res, () => {
      called = true;
    });
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});
