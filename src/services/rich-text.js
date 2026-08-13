// Allowlist DEDICADO a la descripción de páginas informativas (spec
// constrained-rich-text "Inline-only formatting allowlist", design.md D6).
// Deliberadamente un módulo aparte de `public.js#sanitizeDescription` (el
// allowlist de producto): esa lista permite p/ul/ol/li/a, esta NO permite
// nada estructural ni enlaces — solo estilo inline de texto corrido.
// Server-side es el único límite de seguridad real; el editor de cliente
// (rich-text-editor.js) es pura conveniencia (D6/D5).
const sanitizeHtml = require('sanitize-html');

const ALLOWED_TAGS = ['strong', 'em', 'u', 's', 'br'];

// Absorbe la variación de navegador de `document.execCommand` (`<b>`,
// `<i>`, `<strike>`) y el sinónimo semántico `<del>`, así el output del
// editor SIEMPRE cae dentro del allowlist de arriba, nunca queda un tag
// fuera de la lista por una variante de motor.
const TRANSFORM_TAGS = {
  b: 'strong',
  i: 'em',
  strike: 's',
  del: 's',
};

function sanitizeInline(html) {
  const clean = sanitizeHtml(html || '', {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    transformTags: TRANSFORM_TAGS,
  });
  // "Vacío" para la validación de alta/edición (spec "Empty description")
  // significa sin NINGÚN texto, aunque queden tags de puro formato (ej.
  // `<p>   </p>` sanitizado a nada, o solo espacios) — se detecta sacando
  // TODO tag remanente y viendo si sobrevive texto no-blanco.
  const textOnly = clean.replace(/<[^>]*>/g, '').trim();
  return textOnly.length === 0 ? '' : clean;
}

module.exports = { sanitizeInline };
