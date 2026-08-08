// Servicio puro de formato regional es-AR (§8 de prompt.md). Sin acceso a
// DB: funciones puras, mismo patrón que availability.js (§9).

// Fase 7 (design.md D-C): única fuente de verdad del código de moneda —
// formatPrice y services/seo.js (JSON-LD Product.offers.priceCurrency) la
// comparten, nunca un literal 'ARS' repetido en dos lugares. `cart.js`
// (cliente, sin módulos) queda documentado como excepción — ver comentario
// en src/public/js/cart.js.
const CURRENCY = 'ARS';

function formatPrice(amount) {
  // Intl inserta un espacio fino (U+00A0) entre el símbolo y el número en
  // es-AR ("$ 18.700,00"); §8 pide el formato compacto "$18.700,00" sin
  // espacio, así que se lo saca a mano después de formatear.
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: CURRENCY,
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

// `<script type="application/json">` es un elemento de "texto crudo": el
// parser de HTML NUNCA decodifica entidades ahí adentro, así que insertar el
// JSON con `<%= %>` (que escapa `"` a `&#34;`) deja texto que `JSON.parse`
// no puede leer — hay que usar `<%- %>` con ESTA función, que en vez de
// escapar a entidades HTML neutraliza a nivel de JSON las únicas secuencias
// peligrosas para un tag `<script>` (un `</script>` embebido en un valor
// podría cerrar el tag y ejecutar HTML arbitrario). El resultado sigue
// siendo JSON válido, entra crudo, y nunca puede romper el tag que lo
// contiene — mismo espíritu que sanitize-html para la descripción: unescaped
// solo detrás de una función que garantiza que no sobrevive nada peligroso.
function toScriptJson(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

module.exports = { formatPrice, formatDate, toScriptJson, CURRENCY };
