// Servicio puro de formato regional es-AR (§8 de prompt.md). Sin acceso a
// DB: funciones puras, mismo patrón que availability.js (§9).

function formatPrice(amount) {
  // Intl inserta un espacio fino (U+00A0) entre el símbolo y el número en
  // es-AR ("$ 18.700,00"); §8 pide el formato compacto "$18.700,00" sin
  // espacio, así que se lo saca a mano después de formatear.
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  })
    .format(amount)
    .replace(/ /, '');
}

function formatDate(date) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date instanceof Date ? date : new Date(date));
}

module.exports = { formatPrice, formatDate };
