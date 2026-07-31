// Fixtures de `carousel_slides` (§5.3, Fase 6d). 3 slides activos por
// defecto para demostrar el comportamiento de rotación (2+ slides); vaciar/
// desactivar la tabla en dev alcanza para probar el caso de 0 slides sin
// tocar este archivo. Cada fixture apunta a un JPEG fuente real bajo
// `src/public/img/placeholders/` (mismo criterio que `db/seeds/products.js`
// desde Fase 6b) — `db/seed.js` lo procesa por el pipeline real
// (`images.processImage`, perfil `carousel`, sin recorte), nunca guarda un
// path público literal.
const path = require('node:path');

const PLACEHOLDERS_DIR = path.join(__dirname, '..', '..', 'src', 'public', 'img', 'placeholders');

module.exports = [
  {
    sourcePath: path.join(PLACEHOLDERS_DIR, 'carousel-1-source.jpg'),
    altText: 'Nueva colección Donna Style',
    linkUrl: '/noche',
    sortOrder: 1,
    isActive: true,
    startsAt: null,
    endsAt: null,
  },
  {
    sourcePath: path.join(PLACEHOLDERS_DIR, 'carousel-2-source.jpg'),
    altText: 'Promo 2x1 en remeras y musculosas',
    linkUrl: '/2x1',
    sortOrder: 2,
    isActive: true,
    startsAt: null,
    endsAt: null,
  },
  {
    sourcePath: path.join(PLACEHOLDERS_DIR, 'carousel-3-source.jpg'),
    altText: 'Envío gratis en compras seleccionadas',
    linkUrl: null,
    sortOrder: 3,
    isActive: true,
    startsAt: null,
    endsAt: null,
  },
];
