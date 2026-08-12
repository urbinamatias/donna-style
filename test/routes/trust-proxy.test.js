// Test de integración del fix `trust proxy` (Fase 7, design.md D1-D4, spec
// "Session cookie survives a TLS-terminating proxy"). Se fuerza
// NODE_ENV=production y SESSION_SECRET ANTES de cualquier require de
// src/app — node --test corre cada archivo en su propio proceso, así que
// este override queda aislado y no contamina otros archivos de test.
process.env.NODE_ENV = 'production';
process.env.SESSION_SECRET = 'test-' + '0'.repeat(32);

const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const app = require('../../src/app');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

// /health a propósito: no requiere sembrar (el guard de db/seed.js bloquea
// NODE_ENV=production) y pasa por ensureToken, que escribe
// req.session.csrfToken — hay cookie aunque saveUninitialized:false.
test('GET /health CON X-Forwarded-Proto: https detrás de proxy confiable emite Set-Cookie con Secure', async () => {
  const res = await fetch(`${baseUrl}/health`, {
    headers: { 'X-Forwarded-Proto': 'https' },
  });
  assert.equal(res.status, 200);
  const setCookie = res.headers.get('set-cookie') || '';
  assert.ok(setCookie.length > 0, 'debe emitir Set-Cookie');
  assert.match(setCookie, /Secure/);
});

test('GET /health SIN X-Forwarded-Proto NO emite Secure en la cookie (control negativo)', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const setCookie = res.headers.get('set-cookie') || '';
  if (setCookie.length > 0) {
    assert.doesNotMatch(setCookie, /Secure/);
  }
});
