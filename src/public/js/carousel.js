// Carrusel de promociones (§5.3, §4.3). Vanilla, cero innerHTML: los slides
// ya están renderizados por el servidor (partials/carousel.ejs); esto solo
// alterna visibilidad/estado sobre nodos existentes. Se carga únicamente
// cuando hay 2+ slides activos (ver public.js) — con 0 o 1 nunca se pide
// este archivo.
//
// Fase 7 accesibilidad (design.md D4, spec R5): shouldStartAutoplay() vive
// FUERA del IIFE de wiring de DOM para poder testearla sin jsdom (no hay
// harness DOM en node --test) — mismo criterio pragmático que
// services/availability.js. Guard único: startAutoplay() la consulta una
// sola vez, así que cubre los 3 handlers ambientales (mouseleave/focusout/
// touchend) más los clicks de flechas/dots que también reinician el timer,
// sin repetir el guard en cada call-site.
function shouldStartAutoplay(paused, prefersReducedMotion) {
  return !paused && !prefersReducedMotion;
}

(function () {
  // Permite require() de este archivo desde node --test (sin `document`)
  // para testear shouldStartAutoplay sin ejecutar el wiring de DOM real.
  if (typeof document === 'undefined') return;

  const AUTOPLAY_MS = 6000;

  document.querySelectorAll('[data-carousel]').forEach((root) => {
    const slides = Array.from(root.querySelectorAll('[data-carousel-slide]'));
    const dots = Array.from(root.querySelectorAll('[data-carousel-dot]'));
    const prevBtn = root.querySelector('[data-carousel-prev]');
    const nextBtn = root.querySelector('[data-carousel-next]');
    const toggleBtn = root.querySelector('[data-carousel-toggle]');
    if (slides.length < 2) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let current = 0;
    let timer = null;
    let paused = prefersReducedMotion;

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
        const mark = dot.querySelector('[data-carousel-dot-mark]');
        if (mark) {
          mark.classList.toggle('bg-black', isActive);
          mark.classList.toggle('bg-white', !isActive);
        }
      });
    }

    function next() {
      show(current + 1);
    }

    function prev() {
      show(current - 1);
    }

    function startAutoplay() {
      if (!shouldStartAutoplay(paused, prefersReducedMotion)) return;
      stopAutoplay();
      timer = window.setInterval(next, AUTOPLAY_MS);
    }

    function stopAutoplay() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    function updateToggleUI() {
      if (!toggleBtn) return;
      toggleBtn.setAttribute('aria-pressed', String(paused));
      toggleBtn.setAttribute('aria-label', paused ? 'Reanudar carrusel' : 'Pausar carrusel');
      const playIcon = toggleBtn.querySelector('[data-carousel-toggle-play]');
      const pauseIcon = toggleBtn.querySelector('[data-carousel-toggle-pause]');
      if (playIcon) playIcon.classList.toggle('hidden', !paused);
      if (pauseIcon) pauseIcon.classList.toggle('hidden', paused);
    }

    if (toggleBtn) {
      updateToggleUI();
      toggleBtn.addEventListener('click', () => {
        paused = !paused;
        updateToggleUI();
        if (paused) stopAutoplay(); else startAutoplay();
      });
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { shouldStartAutoplay };
}
