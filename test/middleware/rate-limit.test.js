// Tests del rate limiter de login (Fase 6a, design.md D5). En memoria,
// `Map<ip, {count, resetAt}>`, reloj inyectable para no depender de
// tiempo real (mismo criterio que csrf.test.js con req/res fakeados).
const test = require('node:test');
const assert = require('node:assert/strict');

const { loginRateLimit } = require('../../src/middleware/rate-limit');

function fakeReqRes(ip) {
  const req = { ip };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return { req, res };
}

test('loginRateLimit: permite hasta max intentos desde la misma IP', () => {
  let clock = 0;
  const middleware = loginRateLimit({ max: 5, windowMs: 900000, now: () => clock });
  const { req, res } = fakeReqRes('1.1.1.1');

  for (let i = 0; i < 5; i += 1) {
    let called = false;
    middleware(req, res, () => {
      called = true;
    });
    assert.equal(called, true, `intento ${i + 1} debería pasar`);
    req.rateLimit.recordFailure();
  }
});

test('loginRateLimit: bloquea el intento max+1 con 429 y no llama next', () => {
  let clock = 0;
  const middleware = loginRateLimit({ max: 5, windowMs: 900000, now: () => clock });
  const { req, res } = fakeReqRes('2.2.2.2');

  for (let i = 0; i < 5; i += 1) {
    middleware(req, res, () => {});
    req.rateLimit.recordFailure();
  }

  let called = false;
  middleware(req, res, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 429);
});

test('loginRateLimit: la ventana expira y resetea el contador (reloj inyectado)', () => {
  let clock = 0;
  const middleware = loginRateLimit({ max: 2, windowMs: 1000, now: () => clock });
  const { req, res } = fakeReqRes('3.3.3.3');

  middleware(req, res, () => {});
  req.rateLimit.recordFailure();
  middleware(req, res, () => {});
  req.rateLimit.recordFailure();

  let blocked = false;
  middleware(req, res, () => {
    blocked = true;
  });
  assert.equal(blocked, false, 'tercer intento dentro de la ventana debe bloquear');

  clock = 2000; // ventana vencida
  let called = false;
  middleware(req, res, () => {
    called = true;
  });
  assert.equal(called, true, 'tras vencer la ventana el contador debe resetear');
});

test('loginRateLimit: IPs distintas están aisladas entre sí', () => {
  let clock = 0;
  const middleware = loginRateLimit({ max: 1, windowMs: 900000, now: () => clock });
  const a = fakeReqRes('4.4.4.4');
  const b = fakeReqRes('5.5.5.5');

  middleware(a.req, a.res, () => {});
  a.req.rateLimit.recordFailure();
  middleware(a.req, a.res, () => {}); // bloqueada

  let bCalled = false;
  middleware(b.req, b.res, () => {
    bCalled = true;
  });
  assert.equal(bCalled, true, 'otra IP no debe verse afectada por el bloqueo de la primera');
});

test('loginRateLimit: reset() limpia el contador de éxito (spec "counter resets on success")', () => {
  let clock = 0;
  const middleware = loginRateLimit({ max: 2, windowMs: 900000, now: () => clock });
  const { req, res } = fakeReqRes('6.6.6.6');

  middleware(req, res, () => {});
  req.rateLimit.recordFailure();
  req.rateLimit.reset();

  middleware(req, res, () => {});
  req.rateLimit.recordFailure();
  let called = false;
  middleware(req, res, () => {
    called = true;
  });
  assert.equal(called, true, 'tras reset, el contador vuelve a permitir hasta max intentos');
});

test('loginRateLimit: nunca crece de forma ilimitada (hard cap ~10k evictando el más viejo)', () => {
  let clock = 0;
  const middleware = loginRateLimit({ max: 5, windowMs: 900000, now: () => clock });
  for (let i = 0; i < 10050; i += 1) {
    const { req, res } = fakeReqRes(`10.0.${Math.floor(i / 255)}.${i % 255}`);
    middleware(req, res, () => {});
  }
  assert.ok(middleware._attempts.size <= 10000, `tamaño del map (${middleware._attempts.size}) debe respetar el cap`);
});
