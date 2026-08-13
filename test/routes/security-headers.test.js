// Test de integración de la CSP de helmet (prompt.md §8.1: "helmet con CSP
// sin unsafe-inline"). Mismo patrón que trust-proxy.test.js: /health a
// propósito, no requiere seed ni Postgres poblado.
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

test('GET /health: envía Content-Security-Policy sin unsafe-inline ni unsafe-eval', async () => {
  const res = await fetch(`${baseUrl}/health`);
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp, 'debe enviar el header Content-Security-Policy');
  assert.ok(!csp.includes('unsafe-inline'), 'no debe permitir unsafe-inline');
  assert.ok(!csp.includes('unsafe-eval'), 'no debe permitir unsafe-eval');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /style-src 'self'/);
  // blob: necesario para el preview de recorte de image-upload.js (§7).
  assert.match(csp, /img-src 'self' blob:/);
});
