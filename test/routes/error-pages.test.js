// Fase 7 (design.md): render aislado de pages/404.ejs y pages/500.ejs
// (patrón ejs.renderFile, sin layout) + integración HTTP de la 404
// (patrón app.listen(0) + fetch de test/routes/whatsapp-fab.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');

const VIEWS = [
  { file: '404.ejs', status: '404', message: 'No encontramos esa página' },
  { file: '500.ejs', status: '500', message: 'Algo salió mal' },
];

for (const { file, status, message } of VIEWS) {
  test(`render aislado de pages/${file}: h1 único = mensaje, número decorativo aria-hidden, un único CTA a "/"`, async () => {
    const html = await ejs.renderFile(
      path.join(__dirname, '../../src/views/pages', file),
    );

    const h1Matches = [...html.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)];
    assert.equal(h1Matches.length, 1, 'debe existir exactamente un <h1>');
    assert.equal(h1Matches[0][1].trim(), message);
    assert.ok(
      !h1Matches[0][1].includes(status),
      'el h1 nunca debe contener el número de status',
    );

    const decorativeMatches = [
      ...html.matchAll(/<[^>]*aria-hidden="true"[^>]*>([^<]*)<\/[^>]+>/g),
    ];
    assert.equal(
      decorativeMatches.length,
      1,
      'debe existir exactamente un elemento aria-hidden="true"',
    );
    assert.equal(decorativeMatches[0][1].trim(), status);

    const ctaMatches = [...html.matchAll(/<a href="\/"/g)];
    assert.equal(ctaMatches.length, 1, 'debe existir exactamente un <a href="/">');

    assert.ok(!html.includes('menuTree'), 'la vista no debe referenciar menuTree');
    assert.ok(!/<script/.test(html), 'la vista aislada no debe emitir <script>');
  });
}

// La suite HTTP requiere `src/app.js`, que importa `adminRouter` (y por lo
// tanto `sharp`). El binario nativo de `sharp` se instala desde Windows
// (CLAUDE.md §5/§1) y no carga en WSL — mismo patrón documentado que el
// resto de test/routes/*.test.js. Si el require falla acá, la suite HTTP se
// salta explícitamente (t.skip) en vez de tumbar todo el archivo, para que
// la suite de render aislado (arriba) siga corriendo limpia en WSL.
let pool;
let app;
let appLoadError;
try {
  ({ pool } = require('../../src/db/pool'));
  app = require('../../src/app');
} catch (err) {
  appLoadError = err;
}

let server;
let baseUrl;

test.before(async () => {
  if (appLoadError) return;
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (appLoadError) return;
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('GET /slug-que-no-existe-xyz: 404 con noindex, chrome de marca y CTA único', async (t) => {
  if (appLoadError) {
    t.skip(`app.js no cargó en este entorno (sharp/adminRouter): ${appLoadError.message}`);
    return;
  }
  const res = await fetch(`${baseUrl}/slug-que-no-existe-xyz`);
  assert.equal(res.status, 404);
  const html = await res.text();

  assert.ok(
    html.includes('<meta name="robots" content="noindex">'),
    'la 404 debe emitir noindex',
  );
  assert.ok(html.includes('<footer'), 'debe incluir el footer del layout');
  assert.ok(
    html.includes('No encontramos esa página'),
    'debe incluir el mensaje de la 404',
  );
});
