// Galería + lightbox de la ficha (§5.6, Fase 7 design.md D2-D8, spec
// product-lightbox/product-gallery). Máquina de estado mínima con UN SOLO
// índice (`current`): miniaturas y overlay son dos consumidores del mismo
// `show(i)`, nunca dos fuentes de verdad. Cero innerHTML/insertAdjacentHTML
// (CLAUDE.md §3): el shell del overlay ya vino renderizado desde el server
// (partials/product-lightbox.ejs); acá solo togglea `hidden`/clases y
// asigna `src`/`srcset`/`alt`/`textContent`.
//
// Bug fix (tasks.md T7): la versión anterior cortaba TODO el script si no
// había miniaturas (`thumbs.length === 0`) — con exactamente 1 foto (sin
// grid de miniaturas) eso mataba también el lightbox, que sí debe abrir con
// una sola foto (spec R9 scenario 1). Ahora la ausencia de
// `[data-gallery-thumb]` no corta la inicialización.
(function () {
  var mainImage = document.getElementById('gallery-main-image');
  var trigger = document.querySelector('[data-gallery-open]');
  var dialogRoot = document.querySelector('[data-lightbox]');
  // Guard defensivo: si el trigger o el shell del overlay no están en el
  // DOM (0 fotos, o el script se cargó fuera de una ficha), no-opea sin
  // lanzar errores (spec R9 scenario 3).
  if (!mainImage || !trigger || !dialogRoot) return;

  var thumbs = Array.prototype.slice.call(document.querySelectorAll('[data-gallery-thumb]'));
  var backdrop = dialogRoot.querySelector('[data-lightbox-backdrop]');
  var dialog = dialogRoot.querySelector('[data-lightbox-dialog]');
  var closeBtn = dialogRoot.querySelector('[data-lightbox-close]');
  var prevBtn = dialogRoot.querySelector('[data-lightbox-prev]');
  var nextBtn = dialogRoot.querySelector('[data-lightbox-next]');
  var statusEl = dialogRoot.querySelector('[data-lightbox-status]');
  var overlayImage = dialogRoot.querySelector('[data-lightbox-image]');
  if (!dialog || !overlayImage) return;

  // D4: lista de fotos derivada del DOM ya renderizado (data-src/data-srcset
  // /data-alt de las miniaturas si hay 2+, o una entrada única leída de
  // #gallery-main-image con exactamente 1 foto) — nunca un JSON paralelo.
  var photos = thumbs.length > 0
    ? thumbs.map(function (thumb) {
        return {
          src: thumb.getAttribute('data-src'),
          srcset: thumb.getAttribute('data-srcset') || '',
          alt: thumb.getAttribute('data-alt') || '',
        };
      })
    : [{ src: mainImage.getAttribute('src'), srcset: mainImage.getAttribute('srcset') || '', alt: mainImage.getAttribute('alt') || '' }];

  // El primer thumb ya es la foto primaria (mismo orden que
  // findByProductId: is_primary DESC, sort_order) — coincide con lo que el
  // server ya pintó en #gallery-main-image, así que `current = 0` no
  // requiere resincronizar nada al cargar.
  var current = 0;
  var busy = false;
  var lastFocused = null;

  // WAAPI (D7): mismas curvas/duraciones que menu-animate.js, duplicadas a
  // propósito (viven dentro del IIFE de ese archivo, ya corregido por QA;
  // exponerlas obligaría a tocarlo de nuevo por un simple valor).
  var ENTER_MS = 280;
  var EXIT_MS = 220;
  var ENTER_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
  var EXIT_EASING = 'ease-in';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animate(el, keyframes, duration, easing) {
    if (!el || reduceMotion || typeof el.animate !== 'function') return Promise.resolve();
    return el
      .animate(keyframes, { duration: duration, easing: easing, fill: 'forwards' })
      .finished.catch(function () {});
  }

  function show(index) {
    if (photos.length === 0) return;
    current = ((index % photos.length) + photos.length) % photos.length;
    var photo = photos[current];
    if (!photo || !photo.src) return;

    mainImage.src = photo.src;
    if (photo.srcset) mainImage.srcset = photo.srcset;
    mainImage.alt = photo.alt;

    thumbs.forEach(function (thumb, idx) {
      var isActive = idx === current;
      thumb.setAttribute('aria-current', String(isActive));
      thumb.classList.toggle('border-[var(--brand-ink)]', isActive);
      thumb.classList.toggle('border-border', !isActive);
    });

    overlayImage.src = photo.src;
    if (photo.srcset) overlayImage.srcset = photo.srcset;
    overlayImage.alt = photo.alt;

    if (statusEl) {
      statusEl.textContent = 'Foto ' + (current + 1) + ' de ' + photos.length;
    }
  }

  // D1/D2: reusa computeNextFocusIndex de menu-animate.js (cargado antes por
  // el orden de <script> de main.ejs — tasks.md T4) tanto para el focus trap
  // como para el wrap-around de prev/next. Guard defensivo: si por algún
  // motivo el global no existiera (orden de scripts roto), degrada a "foco
  // en el primer focusable"/"foto 0" en vez de lanzar ReferenceError.
  function nextPhotoIndex(isPrev) {
    return typeof computeNextFocusIndex === 'function'
      ? computeNextFocusIndex(photos.length, current, isPrev)
      : 0;
  }

  var FOCUSABLE = 'a[href],area[href],button:not([disabled]),' +
    'input:not([disabled]):not([type="hidden"]),select:not([disabled]),' +
    'textarea:not([disabled]),summary,iframe,[tabindex]:not([tabindex="-1"]),' +
    '[contenteditable="true"]';

  function getFocusables() {
    return Array.prototype.filter.call(
      dialog.querySelectorAll(FOCUSABLE),
      function (el) { return el.getClientRects().length > 0; }
    );
  }

  function isDrawerLockingScroll() {
    return !!document.querySelector('details[data-menu][open] [data-menu-drawer]');
  }

  function lockScroll() {
    document.body.classList.add('overflow-hidden');
  }

  // D8: no desbloquear si el drawer de carrito/nav sigue abierto y
  // bloqueando scroll — evita el doble scroll-lock si el lightbox se abrió
  // con el drawer ya abierto.
  function unlockScroll() {
    if (!isDrawerLockingScroll()) document.body.classList.remove('overflow-hidden');
  }

  function open() {
    if (busy || !dialogRoot.hidden) return;
    busy = true;
    lastFocused = document.activeElement;
    dialogRoot.hidden = false;
    lockScroll();
    show(current);

    var focusTarget = closeBtn || dialog;
    focusTarget.focus();

    Promise.all([
      animate(backdrop, [{ opacity: 0 }, { opacity: 1 }], ENTER_MS, ENTER_EASING),
      animate(
        dialog,
        [
          { opacity: 0, transform: 'scale(0.98)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        ENTER_MS,
        ENTER_EASING
      ),
    ]).then(function () {
      busy = false;
    });
  }

  function close(options) {
    var restoreFocus = !!(options && options.restoreFocus);
    if (busy || dialogRoot.hidden) return;
    busy = true;

    Promise.all([
      animate(backdrop, [{ opacity: 1 }, { opacity: 0 }], EXIT_MS, EXIT_EASING),
      animate(
        dialog,
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0.98)' },
        ],
        EXIT_MS,
        EXIT_EASING
      ),
    ]).then(function () {
      dialogRoot.hidden = true;
      unlockScroll();
      busy = false;
      // R4: el foco vuelve al trigger SOLO si el cierre fue por Escape —
      // click en ✕/backdrop/fondo NO lo devuelve (mismo criterio del drawer).
      if (restoreFocus && lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus();
      }
    });
  }

  trigger.addEventListener('click', open);

  thumbs.forEach(function (thumb, idx) {
    thumb.addEventListener('click', function () { show(idx); });
  });

  if (closeBtn) closeBtn.addEventListener('click', function () { close({ restoreFocus: false }); });
  if (backdrop) backdrop.addEventListener('click', function () { close({ restoreFocus: false }); });
  if (prevBtn) prevBtn.addEventListener('click', function () { show(nextPhotoIndex(true)); });
  if (nextBtn) nextBtn.addEventListener('click', function () { show(nextPhotoIndex(false)); });

  // Click en el fondo del dialog (fuera de la imagen y de los botones)
  // también cierra — solo si el click cayó DIRECTO sobre `dialog` (no un
  // descendiente: imagen/✕/prev/next), así la imagen ampliada nunca cierra
  // al clickearla (R4 scenario 4) sin necesitar stopPropagation en cada
  // botón interior.
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) close({ restoreFocus: false });
  });

  dialogRoot.addEventListener('keydown', function (event) {
    if (dialogRoot.hidden) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      close({ restoreFocus: true });
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      show(nextPhotoIndex(false));
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      show(nextPhotoIndex(true));
      return;
    }

    if (event.key !== 'Tab') return;
    // R3: SIEMPRE interceptamos Tab con el overlay abierto — nunca delegamos
    // al comportamiento nativo (mismo bug ya corregido en menu-animate.js).
    event.preventDefault();
    var focusables = getFocusables();
    var activeIndex = focusables.indexOf(document.activeElement);
    var nextIndex = typeof computeNextFocusIndex === 'function'
      ? computeNextFocusIndex(focusables.length, activeIndex, event.shiftKey)
      : 0;
    if (nextIndex === -1) {
      dialog.focus();
      return;
    }
    focusables[nextIndex].focus();
  });
})();
