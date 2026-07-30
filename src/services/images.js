// Pipeline sharp: única ruta que produce bytes de imagen servibles en toda
// la app (spec "Server-side processing pipeline" — uploads Y seed pasan por
// acá, cero ramas legacy). §7 de prompt.md: recorte centrado 3:4, 3 anchos,
// WebP calidad 82, normalización de niveles, EXIF stripeado.
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const sharp = require('sharp');

const MIN_SHORT_SIDE = 1000;
const QUALITY = 82;
const WIDTHS = [400, 800, 1400];
const ASPECT_RATIO = 4 / 3; // alto = ancho * 4/3 (recorte vertical 3:4)

const DEFAULT_UPLOADS_ROOT = path.join(__dirname, '..', 'public', 'uploads');

function uploadsDirFor(productId, outputDir) {
  if (outputDir) return outputDir;
  return path.join(DEFAULT_UPLOADS_ROOT, String(productId));
}

// Matchea el CHECK de la migración 007 (`^[a-z0-9-]+$`) por construcción —
// nunca acepta un valor client-supplied (defensa contra path traversal,
// Threat Matrix de design.md).
function generateBaseKey() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// Sniff real por bytes (magic bytes vía sharp.metadata, D4 — no confía en
// extensión ni Content-Type declarado por el cliente). Acepta JPEG, PNG,
// WebP y HEIC (reconciliación #2 — iPhone dispara en HEIC por defecto).
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);

async function assertUsable(buffer) {
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw fail('BAD_IMAGE', 'El archivo no es una imagen válida.');
  }

  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
    throw fail('BAD_IMAGE', 'Formato de imagen no soportado. Usá JPEG, PNG, WebP o HEIC.');
  }

  const shortSide = Math.min(metadata.width || 0, metadata.height || 0);
  if (shortSide < MIN_SHORT_SIDE) {
    throw fail(
      'TOO_SMALL',
      `La imagen es muy chica: el lado más corto debe medir al menos ${MIN_SHORT_SIDE}px.`
    );
  }

  return metadata;
}

// `.rotate()` sin argumentos aplica la orientación EXIF ANTES de que sharp
// la descarte al codificar (por defecto sharp no copia metadata de salida
// salvo que se pida explícitamente) — así una foto de celular en vertical
// no sale rotada. Un `sharp(buffer)` fresco por ancho: una instancia
// consumida por `.toFile()` no es reutilizable (design.md, Interfaces).
// Cuando el lado corto está justo en el mínimo de 1000px, el derivado
// 1400w puede necesitar agrandar levemente esa imagen — se permite
// (confirmado esta sesión): nunca se salta el derivado ni se degrada el
// srcset por no upscalear.
async function renderWidth(buffer, width, destPath) {
  const height = Math.round(width * ASPECT_RATIO);
  await sharp(buffer)
    .rotate()
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .normalize()
    .webp({ quality: QUALITY })
    .toFile(destPath);
}

async function processImage(buffer, { productId, baseKey, outputDir } = {}) {
  const dir = uploadsDirFor(productId, outputDir);
  await fs.mkdir(dir, { recursive: true });

  const files = [];
  try {
    for (const width of WIDTHS) {
      const destPath = path.join(dir, `${baseKey}-${width}.webp`);
      await renderWidth(buffer, width, destPath);
      files.push(destPath);
    }
  } catch (err) {
    // Spec "Processing failure leaves no partial state": si un ancho falla
    // a mitad de camino, los ya escritos se borran (tolerante a ENOENT).
    await Promise.all(files.map((f) => fs.unlink(f).catch(() => {})));
    throw err;
  }

  return { baseKey, widths: WIDTHS, files };
}

async function removeImageFiles(productId, baseKey, { outputDir } = {}) {
  const dir = uploadsDirFor(productId, outputDir);
  await Promise.all(
    WIDTHS.map((width) =>
      fs.unlink(path.join(dir, `${baseKey}-${width}.webp`)).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      })
    )
  );
}

module.exports = {
  MIN_SHORT_SIDE,
  QUALITY,
  WIDTHS,
  generateBaseKey,
  assertUsable,
  processImage,
  removeImageFiles,
};
