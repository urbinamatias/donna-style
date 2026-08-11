// Anima menús/drawer basados en <details> (§4.3: nunca instantáneo, entrada
// más lenta que salida, solo transform/opacity, curva de entrada
// cubic-bezier(0.16,1,0.3,1), salida ease-in). <details> es la base (toggle
// instantáneo sin JS); esto mejora progresivamente con Web Animations API.
// Nunca innerHTML: solo togglea `open`/clases y anima con WAAPI.
//
// Fase 7 accesibilidad (design.md D1/D2/D3, spec R1/R2): computeNextFocusIndex()
// vive FUERA del IIFE de wiring de DOM para poder testearla sin jsdom (no
// hay harness DOM en node --test) — mismo criterio que
// carousel.js/shouldStartAutoplay. Solo decide el índice de wrap-around;
// nunca toca nodos.
//
// QA real (fase7-accesibilidad): la primera versión solo interceptaba Tab
// en los BORDES (primero/último) y dejaba el resto al comportamiento nativo
// del navegador — asumía que el próximo focusable en el orden nativo del
// documento coincidía siempre con el próximo elemento de nuestra lista.
// Falso en la práctica: nav-drawer.ejs es hermano DOM de search-toggle.ejs
// (mismo contenedor en header.ejs), así que en ciertas combinaciones el Tab
// nativo escapaba del drawer hacia el buscador. Fix: SIEMPRE devolver un
// índice explícito y SIEMPRE controlar el foco a mano, nunca delegar al
// comportamiento nativo — mismo patrón que usan las librerías de focus
// trap establecidas (nunca "posición intermedia: dejalo nativo").
function computeNextFocusIndex(focusablesLength, activeIndex, shiftKey) {
  if (focusablesLength === 0) return -1;
  if (shiftKey) {
    return activeIndex <= 0 ? focusablesLength - 1 : activeIndex - 1;
  }
  return activeIndex === -1 || activeIndex === focusablesLength - 1 ? 0 : activeIndex + 1;
}

(function () {
  // Permite require() de este archivo desde node --test (sin `document`)
  // para testear computeNextFocusIndex sin ejecutar el wiring de DOM real.
  if (typeof document === 'undefined') return;

  var ENTER_MS = 280;
  var EXIT_MS = 220;
  var ENTER_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
  var EXIT_EASING = 'ease-in';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animate(el, keyframes, duration, easing) {
    if (!el || typeof el.animate !== 'function') return Promise.resolve();
    return el
      .animate(keyframes, { duration: duration, easing: easing, fill: 'forwards' })
      .finished.catch(function () {});
  }

  function setUp(details) {
    var summary = details.querySelector(':scope > summary');
    var panel = details.querySelector(':scope > [data-menu-panel]');
    if (!summary || !panel) return;

    var backdrop = panel.querySelector(':scope > [data-menu-backdrop]');
    var drawer = panel.querySelector(':scope > [data-menu-drawer]');
    var isDrawer = !!(backdrop && drawer);
    // Botón de cierre explícito DENTRO del panel (opcional): necesario para
    // drawers que en mobile ocupan el 100% del ancho (ej. cart-drawer.ejs),
    // donde el backdrop no deja área tapable para cerrar tocando afuera.
    var closeButtons = drawer ? drawer.querySelectorAll('[data-menu-close]') : [];
    var busy = false;

    function open() {
      details.open = true;
      summary.setAttribute('aria-expanded', 'true');
      if (isDrawer) document.body.classList.add('overflow-hidden');
      if (reduceMotion) return Promise.resolve();
      if (isDrawer) {
        return Promise.all([
          animate(backdrop, [{ opacity: 0 }, { opacity: 1 }], ENTER_MS, ENTER_EASING),
          animate(
            drawer,
            [
              { opacity: 0, transform: 'translateX(-100%)' },
              { opacity: 1, transform: 'translateX(0)' },
            ],
            ENTER_MS,
            ENTER_EASING
          ),
        ]).then(function () {
          drawer.focus();
        });
      }
      return animate(
        panel,
        [
          { opacity: 0, transform: 'translateY(-6px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        ENTER_MS,
        ENTER_EASING
      );
    }

    function close() {
      summary.setAttribute('aria-expanded', 'false');
      if (isDrawer) document.body.classList.remove('overflow-hidden');
      if (reduceMotion) {
        details.open = false;
        return Promise.resolve();
      }
      var anim = isDrawer
        ? Promise.all([
            animate(backdrop, [{ opacity: 1 }, { opacity: 0 }], EXIT_MS, EXIT_EASING),
            animate(
              drawer,
              [
                { opacity: 1, transform: 'translateX(0)' },
                { opacity: 0, transform: 'translateX(-100%)' },
              ],
              EXIT_MS,
              EXIT_EASING
            ),
          ])
        : animate(
            panel,
            [
              { opacity: 1, transform: 'translateY(0)' },
              { opacity: 0, transform: 'translateY(-6px)' },
            ],
            EXIT_MS,
            EXIT_EASING
          );
      return anim.then(function () {
        details.open = false;
      });
    }

    summary.addEventListener('click', function (event) {
      if (busy) {
        event.preventDefault();
        return;
      }
      if (reduceMotion) return; // deja que <details> togglee solo, sin animar
      event.preventDefault();
      busy = true;
      (details.open ? close() : open()).then(function () {
        busy = false;
      });
    });

    if (isDrawer) {
      // Focus trap (D1/D2): solo dentro de [data-menu-drawer] (nav+carrito),
      // nunca en dropdowns sueltos (search-toggle, mega-menu sin backdrop).
      // FOCUSABLE se consulta EN CADA Tab (D1) — el mega-menu abre
      // acordeones y cart.js inyecta líneas después de abrir el drawer, así
      // que una lista precomputada al abrir quedaría stale.
      var FOCUSABLE = 'a[href],area[href],button:not([disabled]),' +
        'input:not([disabled]):not([type="hidden"]),select:not([disabled]),' +
        'textarea:not([disabled]),summary,iframe,[tabindex]:not([tabindex="-1"]),' +
        '[contenteditable="true"]';

      function getFocusables() {
        return Array.prototype.filter.call(
          drawer.querySelectorAll(FOCUSABLE),
          function (el) { return el.getClientRects().length > 0; }
        );
      }

      drawer.addEventListener('keydown', function (event) {
        // SIEMPRE interceptamos Tab mientras el drawer está abierto — nunca
        // delegamos al comportamiento nativo del navegador (ver comentario
        // de computeNextFocusIndex más arriba, es lo que causaba el escape).
        if (event.key !== 'Tab' || !details.open) return;
        event.preventDefault();
        var focusables = getFocusables();
        var activeIndex = focusables.indexOf(document.activeElement);
        var nextIndex = computeNextFocusIndex(focusables.length, activeIndex, event.shiftKey);
        if (nextIndex === -1) {
          // D3: drawer sin ningún focusable interior — el foco queda en el
          // propio contenedor (tabindex="-1"); Escape sigue cerrando.
          drawer.focus();
          return;
        }
        focusables[nextIndex].focus();
      });

      // QA real: devolver el foco al botón que abrió el drawer (hamburguesa/
      // carrito) tiene sentido SOLO si quien cerró navega con teclado
      // (Escape) — es la convención de "no perder el lugar". Si cierra con
      // mouse/touch (backdrop o botón ✕), el usuario ya demostró que no
      // depende del foco de teclado; forzarlo ahí sería una sorpresa, no una
      // ayuda. Por eso backdrop/closeButtons NO llaman a summary.focus().
      backdrop.addEventListener('click', function () {
        if (!details.open || busy) return;
        busy = true;
        close().then(function () {
          busy = false;
        });
      });

      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || !details.open || busy) return;
        busy = true;
        close().then(function () {
          busy = false;
          summary.focus();
        });
      });

      closeButtons.forEach(function (button) {
        button.addEventListener('click', function () {
          if (!details.open || busy) return;
          busy = true;
          close().then(function () {
            busy = false;
          });
        });
      });
    } else {
      // Paneles sin backdrop (ej. buscador): cerrar al click/touch afuera o
      // con Escape, mismo criterio que el drawer.
      document.addEventListener('click', function (event) {
        if (!details.open || busy || details.contains(event.target)) return;
        busy = true;
        close().then(function () {
          busy = false;
        });
      });

      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || !details.open || busy) return;
        busy = true;
        close().then(function () {
          busy = false;
          summary.focus();
        });
      });
    }
  }

  document.querySelectorAll('details[data-menu]').forEach(setUp);
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeNextFocusIndex };
}
