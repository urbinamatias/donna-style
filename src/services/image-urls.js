// Único punto de la app que conoce el esquema de URLs de imágenes
// (design.md D1, spec "Derived URL scheme with a single source of truth").
// Puro, sin I/O ni DB — igual que availability.js/sizes.js. `product-card.ejs`,
// `product.ejs` y `services/cart.js` SIEMPRE pasan por acá; ninguno concatena
// ancho ni `.webp` a mano (regla explícita del spec, auditable con
// `grep -R "/uploads/"`).
const BASE_KEY_PATTERN = /^[a-z0-9-]+$/;

const IMAGE_WIDTHS = Object.freeze([400, 800, 1400]);

function assertBaseKey(baseKey) {
  if (typeof baseKey !== 'string' || !BASE_KEY_PATTERN.test(baseKey)) {
    throw new Error(`base_key inválido: "${baseKey}". Debe matchear ${BASE_KEY_PATTERN}.`);
  }
}

function imageSrc(productId, baseKey, width = 800) {
  assertBaseKey(baseKey);
  return `/uploads/${productId}/${baseKey}-${width}.webp`;
}

function imageSrcset(productId, baseKey, widths = IMAGE_WIDTHS) {
  assertBaseKey(baseKey);
  return widths.map((w) => `${imageSrc(productId, baseKey, w)} ${w}w`).join(', ');
}

// `sizes` queda ausente del objeto si no se pide (§4.5 principio de
// ausencia): la vista decide si lo necesita, nunca un default silencioso.
function imageAttrs(productId, baseKey, { widths = IMAGE_WIDTHS, sizes } = {}) {
  const attrs = {
    src: imageSrc(productId, baseKey, widths[widths.length - 1]),
    srcset: imageSrcset(productId, baseKey, widths),
  };
  if (sizes !== undefined) attrs.sizes = sizes;
  return attrs;
}

// Fase 6d (design.md, "File Changes"; QA ronda 2: un solo derivado, sin
// recorte — ver `services/images.js#PROFILES.carousel`). Mismo esquema que
// product-images, sin sufijo de variante: un slide es UNA sola imagen,
// nunca dos crops distintos por dispositivo. `assertBaseKey` se reusa tal
// cual (path traversal defense).
const CAROUSEL_WIDTHS = Object.freeze([768, 1280, 1920]);

function slideImageSrc(baseKey, width) {
  assertBaseKey(baseKey);
  return `/uploads/carousel/${baseKey}-${width}.webp`;
}

function slideImageSrcset(baseKey) {
  return CAROUSEL_WIDTHS.map((w) => `${slideImageSrc(baseKey, w)} ${w}w`).join(', ');
}

// `{src, srcset}` listos para `<img>` — `src` usa el ancho más grande del
// perfil como default, igual criterio que `imageAttrs`.
function slideImageAttrs(baseKey) {
  return {
    src: slideImageSrc(baseKey, CAROUSEL_WIDTHS[CAROUSEL_WIDTHS.length - 1]),
    srcset: slideImageSrcset(baseKey),
  };
}

module.exports = {
  IMAGE_WIDTHS,
  imageSrc,
  imageSrcset,
  imageAttrs,
  slideImageAttrs,
  slideImageSrc,
  slideImageSrcset,
};
