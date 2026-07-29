// Galería de la ficha (§5.6): click en miniatura cambia la foto principal.
// Sin lightbox/zoom (deferido a Fase 7, ver design.md). Cero innerHTML: solo
// asigna la propiedad `src`/`alt` del <img> ya existente en el DOM.
(function () {
  const mainImage = document.getElementById('gallery-main-image');
  const thumbs = document.querySelectorAll('[data-gallery-thumb]');
  if (!mainImage || thumbs.length === 0) return;

  thumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const src = thumb.getAttribute('data-src');
      const alt = thumb.getAttribute('data-alt');
      if (!src) return;
      mainImage.src = src;
      mainImage.alt = alt || '';

      thumbs.forEach((t) => {
        const isActive = t === thumb;
        t.setAttribute('aria-current', String(isActive));
        t.classList.toggle('border-[var(--brand)]', isActive);
        t.classList.toggle('border-border', !isActive);
      });
    });
  });
})();
