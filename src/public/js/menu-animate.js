// Anima menús/drawer basados en <details> (§4.3: nunca instantáneo, entrada
// más lenta que salida, solo transform/opacity, curva de entrada
// cubic-bezier(0.16,1,0.3,1), salida ease-in). <details> es la base (toggle
// instantáneo sin JS); esto mejora progresivamente con Web Animations API.
// Nunca innerHTML: solo togglea `open`/clases y anima con WAAPI.
(function () {
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
      backdrop.addEventListener('click', function () {
        if (!details.open || busy) return;
        busy = true;
        close().then(function () {
          busy = false;
          summary.focus();
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
