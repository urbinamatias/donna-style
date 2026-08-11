// Fase 7 (design.md D1-D3, spec R1-R3): dispatch de Cache-Control por
// prefijo de path, extraído a servicio puro (mismo criterio que
// availability.js/ordering.js — un solo punto de decisión, sin acceso a
// DB/HTTP) para poder testearlo sin depender de un servidor real ni de la
// plataforma donde corre el proceso. `express.static({ setHeaders })` en
// app.js es el único caller de producción.
const path = require('path');

const ONE_YEAR = 31536000; // /uploads y /fonts: nombre inmutable por contrato (base_key opaco, images.js:72)
const FIVE_MINUTES = 300; // nombre fijo reescrito en el mismo path (output.css, img/)

// D2 (gotcha de plataforma real): `filePath` que recibe `setHeaders` es
// SIEMPRE absoluto y con el separador NATIVO del SO donde corre el proceso
// — en Windows (CLAUDE.md §5, dev real corre ahí) viene con `\`. `sep` se
// inyecta explícito (default `path.sep`, el real del proceso en ejecución)
// para poder reproducir determinísticamente el caso Windows desde
// CUALQUIER entorno de test, incluido WSL, donde `path.sep` real es `/` y
// jamás dispararía el bug por sí solo. Sin esta normalización NINGÚN
// prefijo matchea en el entorno de dev real y todos los assets caen al
// bucket default.
function normalizeRelPath(relPath, sep = path.sep) {
  return relPath.split(sep).join('/');
}

// R2: como /fonts/** es immutable, reemplazar una fuente exige RENOMBRAR el
// archivo, nunca sobrescribirlo — sobrescribir deja caché stale hasta
// ONE_YEAR sin error visible.
function resolveCacheControl(relPath) {
  if (relPath.startsWith('uploads/') || relPath.startsWith('fonts/')) {
    return `public, max-age=${ONE_YEAR}, immutable`;
  }
  // output.css (build:css) e img/ (D3) se reescriben en el mismo path:
  // nunca immutable, mismo TTL corto que CSS/JS.
  return `public, max-age=${FIVE_MINUTES}`;
}

module.exports = {
  ONE_YEAR,
  FIVE_MINUTES,
  normalizeRelPath,
  resolveCacheControl,
};
