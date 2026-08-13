// Banner de cookies (§5.1). No-op si el markup no está en el DOM (mismo
// criterio de guard defensivo que el resto de los scripts de cliente del
// proyecto — cart.js, gallery.js, etc. — nunca asumen que su selector va a
// matchear). Consentimiento persistido en localStorage: la sesión de
// servidor no es apropiada acá, este dato no necesita revalidarse contra
// nada, es puramente de UI.
(function () {
  var STORAGE_KEY = 'donna_cookie_consent';
  var banner = document.querySelector('[data-cookie-banner]');
  if (!banner) return;

  var acceptButton = banner.querySelector('[data-cookie-accept]');

  var alreadyAccepted;
  try {
    alreadyAccepted = window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch (err) {
    // Storage bloqueado (modo privado estricto, política del navegador):
    // mostramos el banner igual, es preferible a reventar el script.
    alreadyAccepted = false;
  }

  if (alreadyAccepted) return;

  banner.hidden = false;
  requestAnimationFrame(function () {
    banner.classList.remove('opacity-0', 'translate-y-2', 'pointer-events-none');
  });

  if (!acceptButton) return;

  acceptButton.addEventListener('click', function () {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch (err) {
      // Sin storage disponible no hay dónde persistir el consentimiento;
      // igual cerramos el banner para esta visita.
    }

    banner.classList.add('opacity-0', 'translate-y-2', 'pointer-events-none');
    window.setTimeout(function () {
      banner.hidden = true;
    }, 200);
  });
})();
