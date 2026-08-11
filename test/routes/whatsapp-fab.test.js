// Test de integración del CTA flotante de WhatsApp (design.md D6/D7): mismo
// patrón app.listen(0) + fetch global que public.test.js/sitemap.test.js.
// Requiere Postgres de desarrollo + seed + migrate.
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const app = require('../../src/app');
const config = require('../../src/config/env');

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

test('GET /: exactamente un anchor href="https://wa.me/<digits>" del CTA flotante', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const html = await res.text();

  const expectedHref = `https://wa.me/${config.WHATSAPP_ADMIN.replace(/\D/g, '')}`;
  const matches = html.split(expectedHref).length - 1;
  assert.ok(matches >= 1, 'debe existir al menos un link al número normalizado');

  // El FAB específicamente (aria-label distintivo) aparece una sola vez.
  const fabMatches = (html.match(/aria-label="Escribinos por WhatsApp"/g) || []).length;
  assert.equal(fabMatches, 1);
});

test('GET /: el anchor del FAB no lleva ?text= ni otro query param', async () => {
  const res = await fetch(`${baseUrl}/`);
  const html = await res.text();
  const fabAnchorMatch = html.match(/<a href="https:\/\/wa\.me\/\d+"[^>]*aria-label="Escribinos por WhatsApp"[^>]*>/);
  assert.ok(fabAnchorMatch, 'debe existir el anchor del FAB');
  assert.ok(!fabAnchorMatch[0].includes('?'));
});

test('GET /checkout no renderiza el CTA flotante de WhatsApp (hideFloatingUI)', async () => {
  const res = await fetch(`${baseUrl}/checkout`);
  const html = await res.text();
  assert.ok(!html.includes('aria-label="Escribinos por WhatsApp"'));
});
