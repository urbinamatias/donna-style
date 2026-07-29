// CSRF hand-rolled: patrón synchronizer token (design.md D3). Sin dependencia
// nueva — ya tenemos sesión server-side (express-session) desde esta misma
// fase, lo que hace este patrón gratis y estrictamente más fuerte que
// double-submit-cookie. Verificación con `timingSafeEqual` para no filtrar
// el token por tiempo de comparación.
const crypto = require('node:crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function mintToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// Compara en tiempo constante. Requiere igual longitud para `timingSafeEqual`
// — por eso primero se comparan longitudes (fuga de longitud aceptable, es
// pública igual: el token siempre mide lo mismo).
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Mintea el token una vez por sesión (en `req.session.csrfToken`) y lo
// expone en `res.locals.csrfToken` para los formularios (§8.1). Se aplica
// ANTES de `csrfProtection` en la cadena de middleware de app.js.
function ensureToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = mintToken();
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

// Verifica en cada método mutante. Acepta el campo de body `_csrf` (forms
// sin JS) o el header `X-CSRF-Token` (fetch con JS, cart.js). Nunca muta la
// sesión antes de esta verificación — spec "Missing token" exige que el
// carrito quede intacto ante un 403.
function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const sessionToken = req.session && req.session.csrfToken;
  const candidate = (req.body && req.body._csrf) || req.get('X-CSRF-Token');

  if (!sessionToken || !candidate || !safeEqual(sessionToken, candidate)) {
    return res.status(403).json({ error: 'csrf_invalid' });
  }

  return next();
}

module.exports = { mintToken, ensureToken, csrfProtection };
