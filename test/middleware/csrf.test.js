// Tests del middleware CSRF hand-rolled (design.md D3 — synchronizer token,
// sin dependencia nueva). `mintToken`/`verify` son unidades puras; el
// middleware Express se prueba con req/res/next fakeados, sin levantar el
// server completo (eso lo cubre test/routes/cart.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { mintToken, csrfProtection, verifyToken } = require('../../src/middleware/csrf');

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

// D6 (design.md): `csrfProtection` corre ANTES que cualquier router en
// app.js, así que para requests multipart `req.body` está sin parsear en
// ese punto — multer recién lo llena adentro del router de imágenes. El
// bug real (no hipotético, confirmado por una corrida RED de este mismo
// test contra el código pre-fix) era que una request multipart con un
// token perfectamente válido en el body igual daba 403, porque
// `req.body._csrf` valía `undefined` en el momento en que `csrfProtection`
// corría. Este test ahora prueba el estado POST-fix: el middleware global
// difiere (no se salta) la verificación, dejándola para `verifyToken(req)`
// llamado por la ruta después de multer.
test('csrfProtection: multipart/form-data defiere la verificación (D6 fix) — deja pasar SIN validar, la ruta valida después con verifyToken', () => {
  const sessionToken = mintToken();
  const { req, res } = fakeReqRes({
    method: 'POST',
    csrfToken: sessionToken,
    body: undefined,
    headers: { 'content-type': 'multipart/form-data; boundary=----abc123' },
  });
  let called = false;
  csrfProtection(req, res, () => {
    called = true;
  });
  assert.equal(called, true, 'multipart pasa el middleware global — la ruta debe llamar verifyToken(req) después de multer');
  assert.equal(res.statusCode, 200);
});

test('verifyToken: expuesto para que las rutas de upload lo llamen post-multer — token válido en body parseado por multer', () => {
  const sessionToken = mintToken();
  const req = { session: { csrfToken: sessionToken }, body: { _csrf: sessionToken }, headers: {}, get() { return undefined; } };
  assert.equal(verifyToken(req), true);
});

test('verifyToken: token inválido o ausente devuelve false, nunca lanza', () => {
  const sessionToken = mintToken();
  const req = { session: { csrfToken: sessionToken }, body: { _csrf: 'forjado' }, headers: {}, get() { return undefined; } };
  assert.equal(verifyToken(req), false);

  const reqNoBody = { session: { csrfToken: sessionToken }, body: {}, headers: {}, get() { return undefined; } };
  assert.equal(verifyToken(reqNoBody), false);
});

// Regresión explícita (obligatoria por el prompt de esta fase): el fix D6
// NO puede debilitar la protección de las rutas urlencoded/JSON existentes
// (carrito, checkout, admin productos/categorías) — todas siguen pasando
// por `csrfProtection` con Content-Type urlencoded/JSON, nunca multipart.
test('REGRESIÓN: csrfProtection urlencoded sin token sigue en 403 tras el fix D6', () => {
  const { req, res } = fakeReqRes({
    method: 'POST',
    csrfToken: mintToken(),
    body: {},
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  let called = false;
  csrfProtection(req, res, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('REGRESIÓN: csrfProtection urlencoded con token válido sigue en 200 tras el fix D6', () => {
  const sessionToken = mintToken();
  const { req, res } = fakeReqRes({
    method: 'POST',
    csrfToken: sessionToken,
    body: { _csrf: sessionToken },
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  let called = false;
  csrfProtection(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
});

test('REGRESIÓN: csrfProtection JSON (fetch de cart.js) sin header X-CSRF-Token sigue en 403 tras el fix D6', () => {
  const { req, res } = fakeReqRes({
    method: 'POST',
    csrfToken: mintToken(),
    body: {},
    headers: { 'content-type': 'application/json' },
  });
  let called = false;
  csrfProtection(req, res, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('REGRESIÓN: csrfProtection JSON con header X-CSRF-Token válido sigue en 200 tras el fix D6', () => {
  const sessionToken = mintToken();
  const { req, res } = fakeReqRes({
    method: 'POST',
    csrfToken: sessionToken,
    body: {},
    headers: { 'content-type': 'application/json', 'x-csrf-token': sessionToken },
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
