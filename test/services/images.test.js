// RED #4/#5 (tasks.md 2.1, design.md "Testing Strategy"): pipeline sharp.
// Fixtures generadas EN EL TEST vía `sharp({create:{...}})` hacia
// `os.tmpdir()` — no se commitea ningún binario a git (design.md, misma
// razón que availability.test.js no trae fixtures externas).
//
// NOTA DE EJECUCIÓN (fase de apply, TDD estricto): `sharp` todavía NO está
// instalado (`npm install` corre desde Windows, CLAUDE.md §5, no se ejecutó
// en este paso). Este archivo se escribió y quedó en estado RED por
// `MODULE_NOT_FOUND` — no se pudo llevar a GREEN localmente. Correrlo real
// después de `npm install` es un paso manual pendiente (ver tasks 2.2/2.3).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');

const sharp = require('sharp');
const images = require('../../src/services/images');

// En Windows, sharp/libvips cachea handles de archivo internamente; si un
// test lee un archivo recién escrito (`sharp(filePath).metadata()`) y el
// `t.after` intenta borrar esa carpeta enseguida, el handle todavía
// retenido por el cache hace fallar el unlink con EBUSY. Esto es un
// artefacto de ESTE archivo de test (lee-y-borra en el mismo test) — el
// pipeline real (`removeImageFiles`) nunca relee con sharp lo que acaba de
// borrar, así que nunca se ve en producción. Desactivar el cache es el fix
// documentado de sharp para este caso.
sharp.cache(false);

async function makeFixtureBuffer({ width, height, channels = 3 }) {
  return sharp({
    create: { width, height, channels, background: { r: 120, g: 90, b: 200 } },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Make: 'TestCam' } } })
    .toBuffer();
}

test('assertUsable: imagen 1200x1600 (short side 1200 >= 1000) es usable', async () => {
  const buffer = await makeFixtureBuffer({ width: 1200, height: 1600 });
  await assert.doesNotReject(() => images.assertUsable(buffer));
});

test('assertUsable: short side 900 < 1000 lanza TOO_SMALL con mensaje es-AR', async () => {
  const buffer = await makeFixtureBuffer({ width: 900, height: 1600 });
  await assert.rejects(
    () => images.assertUsable(buffer),
    (err) => err.code === 'TOO_SMALL' && /1000/.test(err.message)
  );
});

test('assertUsable: buffer que no es una imagen lanza BAD_IMAGE', async () => {
  const buffer = Buffer.from('esto no es una imagen, es texto plano');
  await assert.rejects(
    () => images.assertUsable(buffer),
    (err) => err.code === 'BAD_IMAGE'
  );
});

test('processImage: produce 3 derivados WebP con relación 3:4 y sin EXIF', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'donna-img-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const buffer = await makeFixtureBuffer({ width: 1200, height: 1600 });
  const baseKey = images.generateBaseKey();
  assert.match(baseKey, /^[a-z0-9-]+$/);

  const result = await images.processImage(buffer, { productId: 1, baseKey, outputDir: tmpDir });
  assert.equal(result.baseKey, baseKey);
  assert.deepEqual(result.widths, [400, 800, 1400]);
  assert.equal(result.files.length, 3);

  for (const width of [400, 800, 1400]) {
    const filePath = path.join(tmpDir, `${baseKey}-${width}.webp`);
    const meta = await sharp(filePath).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, width);
    assert.equal(Math.round(meta.height / meta.width * 100) / 100, 1.33, `${width}w debe ser 3:4`);
    assert.equal(meta.exif, undefined, 'EXIF debe estar stripeado');
  }
});

test('processImage: short side exactamente 1000 sigue produciendo el derivado 1400w (permite upscale, reconciliación #1)', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'donna-img-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  // short side = 1000 (ancho), alto = 1333 aprox (3:4) -> el derivado 1400w
  // necesita agrandar el ancho de 1000 a 1400 (upscale).
  const buffer = await makeFixtureBuffer({ width: 1000, height: 1333 });
  const baseKey = images.generateBaseKey();

  const result = await images.processImage(buffer, { productId: 1, baseKey, outputDir: tmpDir });
  const filePath = path.join(tmpDir, `${baseKey}-1400.webp`);
  const meta = await sharp(filePath).metadata();
  assert.equal(meta.width, 1400, 'el derivado 1400w debe existir con su ancho completo, incluso si implica upscale');
});

test('removeImageFiles: borra los 3 derivados y tolera ENOENT si ya no existen', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'donna-img-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const buffer = await makeFixtureBuffer({ width: 1200, height: 1600 });
  const baseKey = images.generateBaseKey();
  await images.processImage(buffer, { productId: 1, baseKey, outputDir: tmpDir });

  await assert.doesNotReject(() => images.removeImageFiles(1, baseKey, { outputDir: tmpDir }));
  // Segunda vez: los archivos ya no existen (ENOENT), no debe lanzar.
  await assert.doesNotReject(() => images.removeImageFiles(1, baseKey, { outputDir: tmpDir }));
});

// Fase 6d (tasks.md 1.1, design.md D-A): MIN_SHORT_SIDE global pasa a ser
// `minWidth`/`minHeight` por perfil (`product`/`carousel`). El perfil
// `product` (default cuando no se pasa `profile`) debe seguir
// comportándose byte-idéntico — todos los tests de arriba corren SIN
// modificar y deben seguir en verde.
//
// QA fase 6d, ronda 2: el perfil `carousel` NO recorta (los slides son
// banners de diseño ya armados, no fotos) — `aspectRatio: null`,
// `fit: 'inside'`, la proporción original de la imagen se preserva
// siempre. Solo exige un ancho mínimo razonable (1200px), sin relación de
// aspecto ni alto mínimo específico.

test('assertUsable: perfil carousel acepta cualquier proporción, con ancho >= 1200', async () => {
  const buffer = await makeFixtureBuffer({ width: 1200, height: 400 });
  await assert.doesNotReject(() => images.assertUsable(buffer, 'carousel'));
});

test('assertUsable: perfil carousel rechaza ancho por debajo de 1200 con mensaje que documenta el mínimo', async () => {
  const buffer = await makeFixtureBuffer({ width: 1100, height: 800 });
  await assert.rejects(
    () => images.assertUsable(buffer, 'carousel'),
    (err) => err.code === 'TOO_SMALL' && /1200/.test(err.message)
  );
});

test('assertUsable: sin profile explícito, sigue aplicando el perfil product (default) — 900x1600 TOO_SMALL con "1000" en el mensaje', async () => {
  const buffer = await makeFixtureBuffer({ width: 900, height: 1600 });
  await assert.rejects(
    () => images.assertUsable(buffer),
    (err) => err.code === 'TOO_SMALL' && /1000/.test(err.message)
  );
});

test('processImage: perfil carousel produce 3 derivados sin sufijo, preservando la proporción ORIGINAL de la imagen (sin recorte)', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'donna-img-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  // Fuente 1600x900 (16:9, ni 4:3 ni 2.5:1) — a propósito una proporción
  // "rara" para dejar en evidencia que NINGÚN derivado la fuerza a otra.
  const buffer = await makeFixtureBuffer({ width: 1600, height: 900 });
  const baseKey = images.generateBaseKey();

  const result = await images.processImage(buffer, {
    baseKey,
    outputDir: tmpDir,
    profile: 'carousel',
  });
  assert.deepEqual(result.widths, [768, 1280, 1920]);

  for (const width of [768, 1280, 1920]) {
    const filePath = path.join(tmpDir, `${baseKey}-${width}.webp`);
    const meta = await sharp(filePath).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, width);
    assert.equal(
      Math.round((meta.height / meta.width) * 1000),
      Math.round((900 / 1600) * 1000),
      `el derivado ${width}w debe conservar la proporción 16:9 original, nunca recortarla`
    );
  }
});

test('processImage: perfil carousel con una fuente vertical (retrato) también preserva su proporción, sin forzar horizontal', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'donna-img-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const buffer = await makeFixtureBuffer({ width: 1200, height: 1600 });
  const baseKey = images.generateBaseKey();

  await images.processImage(buffer, { baseKey, outputDir: tmpDir, profile: 'carousel' });

  const filePath = path.join(tmpDir, `${baseKey}-768.webp`);
  const meta = await sharp(filePath).metadata();
  assert.equal(meta.width, 768);
  assert.equal(
    Math.round((meta.height / meta.width) * 1000),
    Math.round((1600 / 1200) * 1000),
    'un banner vertical no debe recortarse a algo horizontal'
  );
});

test('processImage: perfil carousel con la fuente mínima 1200 de ancho igual produce el derivado 1920w (upscale leve permitido)', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'donna-img-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const buffer = await makeFixtureBuffer({ width: 1200, height: 500 });
  const baseKey = images.generateBaseKey();

  await images.processImage(buffer, { baseKey, outputDir: tmpDir, profile: 'carousel' });
  const filePath = path.join(tmpDir, `${baseKey}-1920.webp`);
  const meta = await sharp(filePath).metadata();
  assert.equal(meta.width, 1920, 'el derivado 1920w debe existir con su ancho completo, incluso si implica upscale');
});

test('removeImageFiles: perfil carousel borra los 3 derivados y tolera ENOENT', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'donna-img-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const buffer = await makeFixtureBuffer({ width: 1920, height: 1350 });
  const baseKey = images.generateBaseKey();
  await images.processImage(buffer, { baseKey, outputDir: tmpDir, profile: 'carousel' });

  await assert.doesNotReject(() =>
    images.removeImageFiles(null, baseKey, { outputDir: tmpDir, profile: 'carousel' })
  );
  await assert.doesNotReject(() =>
    images.removeImageFiles(null, baseKey, { outputDir: tmpDir, profile: 'carousel' })
  );
});
