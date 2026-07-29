// Carrusel de promociones (§5.3, §4.3). Vanilla, cero innerHTML: los slides
// ya están renderizados por el servidor (partials/carousel.ejs); esto solo
// alterna visibilidad/estado sobre nodos existentes. Se carga únicamente
// cuando hay 2+ slides activos (ver public.js) — con 0 o 1 nunca se pide
// este archivo.
(function () {
  const AUTOPLAY_MS = 6000;

  document.querySelectorAll('[data-carousel]').forEach((root) => {
    const slides = Array.from(root.querySelectorAll('[data-carousel-slide]'));
    const dots = Array.from(root.querySelectorAll('[data-carousel-dot]'));
    const prevBtn = root.querySelector('[data-carousel-prev]');
    const nextBtn = root.querySelector('[data-carousel-next]');
    if (slides.length < 2) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let current = 0;
    let timer = null;

    function show(index) {
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        const isActive = i === current;
        slide.classList.toggle('opacity-0', !isActive);
        slide.classList.toggle('pointer-events-none', !isActive);
        slide.setAttribute('aria-hidden', String(!isActive));
      });
      dots.forEach((dot, i) => {
        const isActive = i === current;
        dot.setAttribute('aria-current', String(isActive));
        dot.classList.toggle('bg-brand', isActive);
        dot.classList.toggle('bg-surface/80', !isActive);
      });
    }

    function next() {
      show(current + 1);
    }

    function prev() {
      show(current - 1);
    }

    function startAutoplay() {
      if (prefersReducedMotion) return;
      stopAutoplay();
      timer = window.setInterval(next, AUTOPLAY_MS);
    }

    function stopAutoplay() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    if (prevBtn) prevBtn.addEventListener('click', () => { prev(); startAutoplay(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { next(); startAutoplay(); });
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => { show(i); startAutoplay(); });
    });

    root.addEventListener('mouseenter', stopAutoplay);
    root.addEventListener('mouseleave', startAutoplay);
    root.addEventListener('focusin', stopAutoplay);
    root.addEventListener('focusout', startAutoplay);

    // Swipe táctil: solo eje horizontal, umbral chico para no competir con
    // scroll vertical de la página.
    let touchStartX = null;
    root.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].clientX;
      stopAutoplay();
    }, { passive: true });
    root.addEventListener('touchend', (e) => {
      if (touchStartX === null) return;
      const delta = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(delta) > 40) {
        if (delta < 0) next(); else prev();
      }
      touchStartX = null;
      startAutoplay();
    }, { passive: true });

    show(0);
    startAutoplay();
  });
})();
