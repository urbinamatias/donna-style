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
