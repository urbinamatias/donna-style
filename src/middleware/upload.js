// Config de multer (design.md D3): `memoryStorage` — sharp consume un
// Buffer igual, así que escribir a disco temporal para releerlo enseguida
// (y tener que limpiarlo en cada validación fallida) sería trabajo extra
// sin beneficio. `fileFilter` es un rechazo BARATO por mimetype declarado
// (defensa en profundidad, UX rápida); el sniff REAL por bytes es
// `images.js#assertUsable` (D4) — nunca se confía en esto solo.
const multer = require('multer');

const MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024; // 12 MB (spec "Size")
const MAX_FILES = 6;

const ACCEPTED_MIMETYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function fileFilter(req, file, cb) {
  if (!ACCEPTED_MIMETYPES.has(file.mimetype)) {
    const err = new Error('Tipo de archivo no soportado. Usá JPEG, PNG, WebP o HEIC.');
    err.code = 'BAD_IMAGE';
    return cb(err);
  }
  return cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES },
  fileFilter,
});

// Mensajes es-AR para los códigos de error que multer puede lanzar (spec:
// "rechazos legibles en español en todo el flujo"). Se usa como middleware
// de manejo de errores DESPUÉS de `upload.array(...)` en la ruta.
function mapMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).render('admin/layouts/admin', {
        view: '../products/form',
        title: 'Editar producto',
        error: 'El archivo supera el límite de 12 MB por imagen.',
        status: 400,
      });
    }
    return res.status(400).send(`Error subiendo el archivo: ${err.message}`);
  }
  if (err && err.code === 'BAD_IMAGE') {
    return res.status(400).send(err.message);
  }
  return next(err);
}

module.exports = { upload, mapMulterError, MAX_FILE_SIZE_BYTES, MAX_FILES };
