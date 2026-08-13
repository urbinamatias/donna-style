// Singleton del rate limiter de creación de pedidos (prompt.md §8.1: "Rate
// limiting en login, búsqueda y creación de pedidos"). 10 req/10min por IP,
// más estricto que `/buscar` porque cada request exitosa crea una fila real
// en `orders` (no es solo lectura). Instancia única compartida entre
// `checkout.js` y `test/routes/checkout.test.js`, mismo criterio que
// `search-rate-limit.js`.
const { fixedWindowRateLimit } = require('./rate-limit');

module.exports = fixedWindowRateLimit({ max: 10, windowMs: 10 * 60 * 1000 });
