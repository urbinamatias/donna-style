// Pipeline sharp: única ruta que produce bytes de imagen servibles en toda
// la app (spec "Server-side processing pipeline" — uploads Y seed pasan por
// acá, cero ramas legacy). §7 de prompt.md: recorte centrado 3:4, 3 anchos,
// WebP calidad 82, normalización de niveles, EXIF stripeado.
//
// Fase 6d (design.md D-A): `MIN_SHORT_SIDE` global pasó a ser un mínimo
// POR PERFIL (`PROFILES`) — el perfil `product` (default cuando no se pasa
// `profile`) mantiene el comportamiento EXACTO de antes (byte-idéntico).
//
// QA fase 6d, ronda 2 (corrige un supuesto equivocado de la propuesta
// original): el perfil `carousel` NO recorta — los slides son piezas de
// diseño ya armadas (banners hechos en Canva/similar sobre promociones),
// nunca fotos de celular. Recortar a una relación de aspecto fija le
// cortaba texto/logos del diseño. `aspectRatio: null` es la señal para
// `renderWidth`: redimensiona por ancho preservando la proporción original
// (`fit: 'inside'`, nunca `cover`) — la imagen se ve SIEMPRE completa. Ya
// no hace falta un derivado mobile aparte (decisión confirmada esta
// sesión): sin recorte no hay nada que "adaptar" por dispositivo, un solo
// set de anchos sirve para cualquier pantalla vía `sizes`/`srcset`.
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const sharp = require('sharp');

const QUALITY = 82;

const DEFAULT_UPLOADS_ROOT = path.join(__dirname, '..', 'public', 'uploads');

// `minWidth`/`minHeight` — piso POR EJE, no un short-side check. Fase 8
// (fase8-bugs-produccion, design.md D6): el piso de `product` bajó de
// 1000x1000 a 720x960, no cuadrado a propósito. El recorte final es 3:4
// (alto = ancho * 4/3, ver `aspectRatio` abajo), así que después de
// centrar el crop el ANCHO es el eje que ata — una fuente 1000x1000
// (cuadrada) recorta a 1000x1333 sin upscale, pero una fuente vertical
// real de celular como 720x1280 tenía MÁS que sobra de alto y sin embargo
// el viejo piso cuadrado la rechazaba igual por tener 720 < 1000 de
// ancho. 720x960 es el piso real que un teléfono en vertical cumple sin
// problema, con el peor caso de upscale documentado en `renderWidth` de
// abajo (1400/720 = 1.94x en el derivado más grande). El perfil
// `carousel` solo exige un ancho mínimo razonable (1200px, un diseño de
// Canva exportado normalmente ya lo supera de sobra) — sin recorte no
// tiene sentido exigir una relación de aspecto ni un alto mínimo
// específico, cualquier proporción es válida. Este cambio NO toca
// `carousel`.
const PROFILES = {
  product: {
    aspectRatio: 4 / 3, // alto = ancho * 4/3 (recorte vertical 3:4)
    widths: [400, 800, 1400],
    minWidth: 720,
    minHeight: 960,
    suffix: '',
    dir: (ctx, outputDir) => outputDir || path.join(DEFAULT_UPLOADS_ROOT, String(ctx.productId)),
  },
  carousel: {
    aspectRatio: null, // sin recorte — preserva la proporción original
    widths: [768, 1280, 1920],
    minWidth: 1200,
    minHeight: 200,
    suffix: '',
    dir: (ctx, outputDir) => outputDir || path.join(DEFAULT_UPLOADS_ROOT, 'carousel'),
  },
};

// Back-compat: seguía exportado y usado por callers/tests de Fase 6b. Es un
// alias de `PROFILES.product.minWidth`, NUNCA renombrado (design.md D7,
// verificado: el identificador solo aparece acá, en un comentario de test
// y en ningún otro caller). Antes de Fase 8 los dos ejes eran iguales
// (1000x1000), así que "short side" describía el criterio real; ahora que
// `product` es 720x960 (no cuadrado) el nombre queda histórico — sigue
// siendo el mínimo de ANCHO, ya no un mínimo del "lado corto" genérico.
const MIN_SHORT_SIDE = PROFILES.product.minWidth;
const WIDTHS = PROFILES.product.widths;

function resolveProfile(profileName) {
  const profile = PROFILES[profileName || 'product'];
  if (!profile) {
    throw new Error(`Perfil de imagen desconocido: "${profileName}".`);
  }
  return profile;
}

// Matchea el CHECK de la migración 007/008 (`^[a-z0-9-]+$`) por
// construcción — nunca acepta un valor client-supplied (defensa contra path
// traversal, Threat Matrix de design.md).
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

async function assertUsable(buffer, profileName = 'product') {
  const profile = resolveProfile(profileName);

  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw fail('BAD_IMAGE', 'El archivo no es una imagen válida.');
  }

  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
    throw fail('BAD_IMAGE', 'Formato de imagen no soportado. Usá JPEG, PNG, WebP o HEIC.');
  }

  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (width < profile.minWidth || height < profile.minHeight) {
    // Fase 8 (design.md, Interfaces / Contracts): mensaje axis-explicit
    // para `product` (720x960, ejes distintos) — nombrar ambos ejes por
    // separado es más claro que "720x960px" ahora que ya no son
    // intercambiables como en el viejo piso cuadrado.
    throw fail(
      'TOO_SMALL',
      profile.aspectRatio === null
        ? `La imagen es muy chica: necesitamos al menos ${profile.minWidth}px de ancho (esta mide ${width}x${height}).`
        : `La imagen es muy chica: necesitamos al menos ${profile.minWidth}px de ancho y ${profile.minHeight}px de alto (esta mide ${width}x${height}).`
    );
  }

  return metadata;
}

// `.rotate()` sin argumentos aplica la orientación EXIF ANTES de que sharp
// la descarte al codificar (por defecto sharp no copia metadata de salida
// salvo que se pida explícitamente) — así una foto de celular en vertical
// no sale rotada. Un `sharp(buffer)` fresco por ancho: una instancia
// consumida por `.toFile()` no es reutilizable (design.md, Interfaces).
// Cuando la fuente está justo en el mínimo del perfil, el derivado más
// grande puede necesitar agrandar levemente esa imagen — se permite
// (confirmado esta sesión): nunca se salta el derivado ni se degrada el
// srcset por no upscalear.
//
// `aspectRatio === null` (perfil `carousel`, QA fase 6d ronda 2): sin
// recorte — `fit: 'inside'` redimensiona por ancho preservando la
// proporción ORIGINAL de la imagen, el alto sale de ahí solo. Con
// `aspectRatio` numérico (perfil `product`) se mantiene el recorte
// centrado de siempre.
async function renderWidth(buffer, width, aspectRatio, destPath) {
  const pipeline = sharp(buffer).rotate();
  if (aspectRatio === null) {
    pipeline.resize(width, null, { fit: 'inside' });
  } else {
    const height = Math.round(width * aspectRatio);
    pipeline.resize(width, height, { fit: 'cover', position: 'centre' });
  }
  await pipeline.normalize().webp({ quality: QUALITY }).toFile(destPath);
}

async function processImage(buffer, { productId, baseKey, outputDir, profile: profileName = 'product' } = {}) {
  const profile = resolveProfile(profileName);
  const dir = profile.dir({ productId }, outputDir);
  await fs.mkdir(dir, { recursive: true });

  const files = [];
  try {
    for (const width of profile.widths) {
      const destPath = path.join(dir, `${baseKey}${profile.suffix}-${width}.webp`);
      await renderWidth(buffer, width, profile.aspectRatio, destPath);
      files.push(destPath);
    }
  } catch (err) {
    // Spec "Processing failure leaves no partial state": si un ancho falla
    // a mitad de camino, los ya escritos se borran (tolerante a ENOENT).
    await Promise.all(files.map((f) => fs.unlink(f).catch(() => {})));
    throw err;
  }

  return { baseKey, widths: profile.widths, files };
}

async function removeImageFiles(productId, baseKey, { outputDir, profile: profileName = 'product' } = {}) {
  const profile = resolveProfile(profileName);
  const dir = profile.dir({ productId }, outputDir);
  await Promise.all(
    profile.widths.map((width) =>
      fs.unlink(path.join(dir, `${baseKey}${profile.suffix}-${width}.webp`)).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      })
    )
  );
}

module.exports = {
  MIN_SHORT_SIDE,
  QUALITY,
  WIDTHS,
  PROFILES,
  generateBaseKey,
  assertUsable,
  processImage,
  removeImageFiles,
};
