// Fixtures de `carousel_slides` (§5.3). 3 slides activos por defecto para
// demostrar el comportamiento de rotación (2+ slides); vaciar/desactivar la
// tabla en dev alcanza para probar el caso de 0 slides sin tocar este archivo.
// Las imágenes son placeholders generados (§0.2) — ver
// src/public/img/placeholders/carousel-*.jpg.
module.exports = [
  {
    imageDesktop: 'placeholders/carousel-1.jpg',
    imageMobile: null,
    altText: 'Nueva colección Donna Style',
    linkUrl: '/noche',
    sortOrder: 1,
    isActive: true,
    startsAt: null,
    endsAt: null,
  },
  {
    imageDesktop: 'placeholders/carousel-2.jpg',
    imageMobile: null,
    altText: 'Promo 2x1 en remeras y musculosas',
    linkUrl: '/2x1',
    sortOrder: 2,
    isActive: true,
    startsAt: null,
    endsAt: null,
  },
  {
    imageDesktop: 'placeholders/carousel-3.jpg',
    imageMobile: null,
    altText: 'Envío gratis en compras seleccionadas',
    linkUrl: null,
    sortOrder: 3,
    isActive: true,
    startsAt: null,
    endsAt: null,
  },
];
