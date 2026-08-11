// Fase 7 (design.md D2/D3, spec R1-R3): dispatch de Cache-Control por
// prefijo, extraído a servicio puro para poder testearlo desde CUALQUIER
// plataforma sin levantar un server HTTP real. `express.static({
// setHeaders })` en app.js es el único caller de producción.
//
// Gotcha de plataforma real (D2): dev corre en Windows (CLAUDE.md §5), así
// que `filePath` que recibe `setHeaders` viene con `\` como separador. El
// separador se inyecta explícito en `normalizeRelPath` (default `path.sep`)
// para poder reproducir DETERMINÍSTICAMENTE el caso Windows desde este
// entorno WSL, donde `path.sep` real es `/` y jamás dispararía el bug por sí
// solo — sin esta inyección, el caso más importante de este módulo
// (separador `\`) sería intestable acá.
const test = require('node:test');
const assert = require('node:assert/strict');

const { ONE_YEAR, FIVE_MINUTES, normalizeRelPath, resolveCacheControl } = require('../../src/services/cache-headers');

test('normalizeRelPath: separador Windows (\\) se normaliza a "/" (D2 gotcha)', () => {
  const result = normalizeRelPath('fonts\\merriweather-400.woff2', '\\');
  assert.equal(result, 'fonts/merriweather-400.woff2');
});

test('normalizeRelPath: separador POSIX (/) queda igual', () => {
  const result = normalizeRelPath('uploads/12/abc123-800.webp', '/');
  assert.equal(result, 'uploads/12/abc123-800.webp');
});

test('resolveCacheControl: /uploads/** trae max-age de un año e immutable (R1)', () => {
  const header = resolveCacheControl('uploads/12/abc123-800.webp');
  assert.ok(header.includes(`max-age=${ONE_YEAR}`));
  assert.ok(header.includes('immutable'));
});

test('resolveCacheControl: /fonts/** trae max-age de un año e immutable (R1)', () => {
  const header = resolveCacheControl('fonts/merriweather-400.woff2');
  assert.ok(header.includes(`max-age=${ONE_YEAR}`));
  assert.ok(header.includes('immutable'));
});

test('resolveCacheControl: /css/output.css trae max-age=300 y NUNCA immutable (R1)', () => {
  const header = resolveCacheControl('css/output.css');
  assert.ok(header.includes(`max-age=${FIVE_MINUTES}`));
  assert.ok(!header.includes('immutable'));
});

test('resolveCacheControl: /js/*.js trae max-age=300 y NUNCA immutable (R1)', () => {
  const header = resolveCacheControl('js/carousel.js');
  assert.ok(header.includes(`max-age=${FIVE_MINUTES}`));
  assert.ok(!header.includes('immutable'));
});

test('resolveCacheControl: bucket default (ej. img/logo.png) usa la misma política que CSS/JS (D3)', () => {
  const header = resolveCacheControl('img/logo.png');
  assert.ok(header.includes(`max-age=${FIVE_MINUTES}`));
  assert.ok(!header.includes('immutable'));
});

test('resolveCacheControl: gotcha real de plataforma — path Windows normalizado matchea /fonts (D2 end-to-end)', () => {
  const rel = normalizeRelPath('fonts\\merriweather-400.woff2', '\\');
  const header = resolveCacheControl(rel);
  assert.ok(header.includes(`max-age=${ONE_YEAR}`));
  assert.ok(header.includes('immutable'), 'sin normalizar el separador, este prefijo NUNCA matchea en Windows');
});

test('ONE_YEAR y FIVE_MINUTES son constantes nombradas, no números mágicos repetidos (R3)', () => {
  assert.equal(ONE_YEAR, 31536000);
  assert.equal(FIVE_MINUTES, 300);
});
