// Rutas de primer nivel ya ocupadas por handlers específicos (registrados
// ANTES del comodín `/:parentSlug` de public.js) o por otros mounts de
// app.js — una página nueva jamás puede reclamar ninguno de estos slugs
// (spec informational-pages "Collision with a category or a reserved
// route", design.md D3). Lista de app: la validación vive acá, no en la DB
// (D3 — un mensaje amigable por caso, no un trigger).
const RESERVED_SLUGS = new Set([
  'buscar',
  'carrito',
  'checkout',
  'pedido',
  'admin',
  'sitemap.xml',
  'robots.txt',
  'health',
]);

function isReserved(slug) {
  return RESERVED_SLUGS.has(String(slug));
}

module.exports = { isReserved, RESERVED_SLUGS };
