// Test de integración de la barra de promos (Fase 8, fase8-bugs-produccion,
// spec "Announcement Bar Content" + "Announcement Bar Visibility Gate").
// Mismo patrón app.listen(0) + fetch global que whatsapp-fab.test.js/
// search.test.js. Requiere Postgres de desarrollo + seed + migrate.
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const app = require('../../src/app');
const { ANNOUNCEMENT_ITEMS } = require('../../src/config/announcement');

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

// header.ejs repite la tanda REPEATS=6 veces por mitad, y hay 2 mitades
// (marquee continuo) => cada mensaje aparece 12 veces en el HTML.
const REPEATS_PER_HALF = 6;
const HALVES = 2;
const EXPECTED_OCCURRENCES = REPEATS_PER_HALF * HALVES;

// Cuenta ocurrencias del `<span class="px-6">mensaje</span>` exacto que
// emite el marquee (header.ejs), no cualquier substring — el footer también
// menciona "Envíos a todo el país" dentro de otra oración, y un match por
// substring plano cuenta esa coincidencia de más (13 en vez de 12).
function countMarqueeSpans(html, item) {
  const needle = `<span class="px-6">${item}</span>`;
  return html.split(needle).length - 1;
}

test('GET /: la barra de promos muestra los 3 mensajes fijos, 12 veces cada uno', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const html = await res.text();

  for (const item of ANNOUNCEMENT_ITEMS) {
    assert.equal(
      countMarqueeSpans(html, item),
      EXPECTED_OCCURRENCES,
      `"${item}" debe aparecer ${EXPECTED_OCCURRENCES} veces en el marquee (6 repeticiones x 2 mitades)`
    );
  }
});

test('GET /buscar: la barra de promos está visible (no está en el deny-list)', async () => {
  const res = await fetch(`${baseUrl}/buscar?q=canesu`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes(ANNOUNCEMENT_ITEMS[0]));
});

// El footer (footer.ejs) menciona "Envíos a todo el país" dentro de otra
// oración, en TODAS las páginas — un `!html.includes(item)` plano daría
// falso negativo ahí. La ausencia real de la barra se prueba por su
// contenedor de marquee, que solo header.ejs emite.
function hasMarqueeBar(html) {
  return html.includes('<div class="marquee flex w-max">');
}

test('GET /carrito: la barra de promos está ausente (hideFloatingUI)', async () => {
  const res = await fetch(`${baseUrl}/carrito`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(!hasMarqueeBar(html), 'el marquee de promos no debe renderizarse en /carrito');
});

test('GET /checkout: la barra de promos está ausente (hideFloatingUI)', async () => {
  const res = await fetch(`${baseUrl}/checkout`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(!hasMarqueeBar(html), 'el marquee de promos no debe renderizarse en /checkout');
});

test('GET /pedido/:token (inexistente, 404): la barra de promos está ausente (hideFloatingUI)', async () => {
  const res = await fetch(`${baseUrl}/pedido/token-que-jamas-va-a-existir`);
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.ok(!hasMarqueeBar(html), 'el marquee de promos no debe renderizarse en /pedido/:token');
});
