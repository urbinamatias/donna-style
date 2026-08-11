// Filtro en vivo para forms GET de listados admin (Productos/Stock, QA:
// sacar el botón "Filtrar" — la lista se actualiza sola al tipear o al
// cambiar un combobox/checkbox). Progresivo: sin JS, el <noscript><button>
// del form sigue funcionando. `form.requestSubmit()` dispara la misma
// navegación GET de siempre, sin fetch/innerHTML — el server sigue siendo
// la única fuente de verdad del filtrado, cero estado duplicado en cliente,
// cero condición de carrera entre respuestas fuera de orden.
(function () {
  var DEBOUNCE_MS = 350;

  document.querySelectorAll('form[data-live-filter]').forEach(function (form) {
    var timer = null;
    var debouncedInput = form.querySelector('[data-live-filter-debounce]');
    // Marca "se estaba tipeando acá" en sessionStorage, sobrevive al reload
    // completo que dispara `requestSubmit()`. QA: antes solo se restauraba
    // el foco si quedaba texto en el campo — al borrar el último caracter
    // el foco se perdía y había que volver a tocar el input a mano.
    var focusFlagKey = 'live-filter-focus:' + form.getAttribute('action');

    function submitNow() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.submit();
      }
    }

    if (debouncedInput) {
      debouncedInput.addEventListener('input', function () {
        sessionStorage.setItem(focusFlagKey, '1');
        if (timer) clearTimeout(timer);
        timer = setTimeout(submitNow, DEBOUNCE_MS);
      });
    }

    form.querySelectorAll('select, input[type="checkbox"]').forEach(function (control) {
      control.addEventListener('change', function () {
        sessionStorage.removeItem(focusFlagKey);
        submitNow();
      });
    });

    // Enter en el input de texto: el <form> nativo ya lo submitea solo
    // (mismo submit real que usa `requestSubmit()` acá arriba) — no hace
    // falta interceptar el evento `submit`, y hacerlo con
    // `requestSubmit()` adentro del handler reentraría en un loop infinito
    // (`requestSubmit()` vuelve a disparar `submit`).

    if (debouncedInput && sessionStorage.getItem(focusFlagKey) === '1') {
      sessionStorage.removeItem(focusFlagKey);
      debouncedInput.focus();
      var end = debouncedInput.value.length;
      debouncedInput.setSelectionRange(end, end);
    }
  });
})();
