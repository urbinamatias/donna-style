// Singleton del rate limiter de `/buscar` (design.md D2, spec "Rate-limited
// search endpoint": 30 req/60s por IP, "configurable" = opciones de la
// factory, no una env var nueva). Instancia única compartida entre
// `public.js` y `test/routes/search.test.js` (que limpia `._hits` en
// `beforeEach`) — crearla inline en `public.js` haría eso imposible.
const { fixedWindowRateLimit } = require('./rate-limit');

module.exports = fixedWindowRateLimit({ max: 30, windowMs: 60 * 1000 });
