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

// Compara el token de sesión contra el candidato de la request ya parseada
// (body._csrf o header X-CSRF-Token). Extraído de `csrfProtection` para que
// las rutas multipart (Fase 6b, D6) puedan llamarlo ELLAS MISMAS, después de
// que multer parseó el body — nunca lanza, siempre boolean.
function verifyToken(req) {
  const sessionToken = req.session && req.session.csrfToken;
  const candidate = (req.body && req.body._csrf) || req.get('X-CSRF-Token');
  return Boolean(sessionToken && candidate && safeEqual(sessionToken, candidate));
}

function isMultipart(req) {
  const contentType = req.get('Content-Type') || '';
  return contentType.toLowerCase().startsWith('multipart/form-data');
}

// Verifica en cada método mutante. Acepta el campo de body `_csrf` (forms
// sin JS) o el header `X-CSRF-Token` (fetch con JS, cart.js). Nunca muta la
// sesión antes de esta verificación — spec "Missing token" exige que el
// carrito quede intacto ante un 403.
//
// D6 (design.md, Fase 6b — bug real, no hipotético): este middleware corre
// ANTES que cualquier router (app.js), pero para `multipart/form-data`
// Express NUNCA parsea `req.body` en ese punto (ni `express.urlencoded` ni
// `express.json` lo hacen — multer es quien lo parsea, y multer vive
// adentro del router de imágenes). Sin este bypass, TODO upload sin JS
// daría 403 incondicionalmente aunque el `<input type="hidden" name="_csrf">`
// del form fuera perfectamente válido. Las rutas multipart son responsables
// de llamar `verifyToken(req)` ELLAS MISMAS después de que multer corrió —
// este middleware nunca dejó de proteger nada: solo difirió el punto de
// verificación al único lugar donde el body ya existe.
function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (isMultipart(req)) return next();

  if (!verifyToken(req)) {
    return res.status(403).json({ error: 'csrf_invalid' });
  }

  return next();
}

module.exports = { mintToken, ensureToken, csrfProtection, verifyToken };
