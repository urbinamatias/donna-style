// Reemplaza los `onsubmit="return confirm(...)"` inline del panel admin
// (borrar producto/categoría/página/slide/imagen) — con CSP sin
// `unsafe-inline` los atributos de evento inline quedan bloqueados por el
// navegador. Un solo listener delegado en document, no uno por form:
// cualquier form nuevo solo necesita `data-confirm="mensaje"`, sin tocar
// este archivo de nuevo.
(function () {
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    var message = form.getAttribute('data-confirm');
    if (!message) return;
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  });
})();
