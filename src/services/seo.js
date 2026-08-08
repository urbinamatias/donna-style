// Servicio puro de SEO (Fase 7, design.md D-A/D-B). Sin DB, sin I/O: un
// builder por tipo de página que arma el bloque completo de <head> — cada
// ruta hace `res.render(..., seo)`, nunca compone estos campos a mano
// (misma disciplina que availability.js/image-urls.js, §9 de prompt.md).
//
// Contrato de retorno común: { title, metaDescription, canonicalUrl,
// ogTitle, ogDescription, ogImage, ogUrl, ogType }. `buildPrivateSeo`
// devuelve solo { title, noindex: true } — páginas no indexables no emiten
// OG/canonical (§4.5, "invariante: noindex === true ⇒ sin OG/canonical").
const { computeAvailability } = require('./availability');
const { imageSrc } = require('./image-urls');
const { CURRENCY } = require('./format');

const MAX_META = 160;
// Owner-confirmed: mismo asset ya usado en el favicon del layout.
const DEFAULT_OG_IMAGE = '/img/logo-cuadrado.png';
// Copia autoral de la dueña — se usa TAL CUAL, nunca reescrita (§4.5,
// excepción explícita: meta description SIEMPRE se emite, aunque no haya
// texto propio de la página).
const STORE_DESCRIPTION =
  'Donna Style — moda femenina online. Encontrá tu talle, elegí tu color y comprá fácil: coordinamos todo por WhatsApp.';

const HTML_ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

// Quita tags HTML (reemplazados por un espacio para no pegar palabras de
// bloques distintos, ej. `</li><li>`), decodifica el puñado de entidades
// que puede dejar `sanitize-html`/el editor de la dueña, y colapsa
// espacios múltiples a uno solo.
function toPlainText(html) {
  if (!html) return '';
  const noTags = String(html).replace(/<[^>]*>/g, ' ');
  const decoded = noTags.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (match) => HTML_ENTITIES[match]);
  return decoded.replace(/\s+/g, ' ').trim();
}

// Corta en el último límite de palabra dentro de `max` caracteres — nunca a
// mitad de palabra ni de entidad ya decodificada — y agrega "…".
function truncate(text, max = MAX_META) {
  if (!text || text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

// Única función que arma URLs absolutas: SIEMPRE desde `cfg.SITE_URL`
// (env-only), NUNCA desde `req.host`/`X-Forwarded-Host` (Threat Matrix
// design.md — "Open redirect / SSRF via SITE_URL"). Idempotente: si
// `pathname` ya es una URL absoluta, `new URL` la respeta tal cual.
function absoluteUrl(pathname, cfg) {
  return new URL(pathname, cfg.SITE_URL).toString();
}

function defaultOgImage(cfg) {
  return absoluteUrl(DEFAULT_OG_IMAGE, cfg);
}

function buildHomeSeo(cfg) {
  const canonicalUrl = absoluteUrl('/', cfg);
  return {
    title: cfg.NOMBRE_TIENDA,
    metaDescription: STORE_DESCRIPTION,
    canonicalUrl,
    ogTitle: cfg.NOMBRE_TIENDA,
    ogDescription: STORE_DESCRIPTION,
    ogImage: defaultOgImage(cfg),
    ogUrl: canonicalUrl,
    ogType: 'website',
  };
}

// `path` viene de `req.path` (NUNCA `req.originalUrl`/query string) — dos
// requests a la misma categoría con distinto `?page=`/`?sort=` deben seguir
// compartiendo el mismo canonical (spec "Route: canonical uses req.path").
function buildCategorySeo(category, { path, cfg }) {
  const title = `${category.name} — ${cfg.NOMBRE_TIENDA}`;
  const canonicalUrl = absoluteUrl(path, cfg);
  return {
    title,
    metaDescription: STORE_DESCRIPTION,
    canonicalUrl,
    ogTitle: title,
    ogDescription: STORE_DESCRIPTION,
    ogImage: defaultOgImage(cfg),
    ogUrl: canonicalUrl,
    ogType: 'website',
  };
}

function productDescription(product) {
  const plain = toPlainText(product.description || '');
  return plain.length > 0 ? truncate(plain) : STORE_DESCRIPTION;
}

function productOgImage(product, cfg) {
  const [firstImage] = product.images || [];
  if (firstImage) return absoluteUrl(imageSrc(product.id, firstImage.base_key, 1400), cfg);
  return defaultOgImage(cfg);
}

function buildProductSeo(product, cfg) {
  const title = `${product.name} — ${cfg.NOMBRE_TIENDA}`;
  const canonicalUrl = absoluteUrl(`/productos/${product.slug}`, cfg);
  const metaDescription = productDescription(product);
  return {
    title,
    metaDescription,
    canonicalUrl,
    ogTitle: title,
    ogDescription: metaDescription,
    ogImage: productOgImage(product, cfg),
    ogUrl: canonicalUrl,
    ogType: 'product',
  };
}

// Páginas no indexables (carrito/checkout/pedido/404): solo título +
// noindex, nunca OG ni canonical apuntando a otra página (§4.5).
function buildPrivateSeo({ title }) {
  return { title, noindex: true };
}

// JSON-LD Product embebido en la ficha. Disponibilidad SIEMPRE derivada de
// `services/availability.js` — nunca una segunda regla de stock acá (D-B,
// CLAUDE.md §2). Si `product.availability` ya viene calculado por la ruta
// (caso real: public.js ya lo computó para la UI), se reusa tal cual en vez
// de recalcularlo, para que ficha y JSON-LD JAMÁS puedan discrepar.
function buildProductJsonLd(product, cfg) {
  const availabilityResult = product.availability ?? computeAvailability(product.variants || []);
  const availability = availabilityResult.hasAnyStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';

  const canonicalUrl = absoluteUrl(`/productos/${product.slug}`, cfg);
  const images = (product.images || []).map((img) => absoluteUrl(imageSrc(product.id, img.base_key, 1400), cfg));

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: productDescription(product),
    image: images.length > 0 ? images : [defaultOgImage(cfg)],
    url: canonicalUrl,
    offers: {
      '@type': 'Offer',
      price: String(product.base_price),
      priceCurrency: CURRENCY,
      availability,
      url: canonicalUrl,
      itemCondition: 'https://schema.org/NewCondition',
    },
  };
}

module.exports = {
  MAX_META,
  DEFAULT_OG_IMAGE,
  STORE_DESCRIPTION,
  toPlainText,
  truncate,
  absoluteUrl,
  buildHomeSeo,
  buildCategorySeo,
  buildProductSeo,
  buildPrivateSeo,
  buildProductJsonLd,
};
