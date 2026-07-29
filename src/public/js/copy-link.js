// "Copiar link" de la ficha (§5.6). Cero innerHTML: solo navigator.clipboard
// + textContent sobre un <span> de estado ya existente.
(function () {
  document.querySelectorAll('[data-copy-link]').forEach((button) => {
    const status = button.parentElement
      ? button.parentElement.querySelector('[data-copy-link-status]')
      : null;

    button.addEventListener('click', async () => {
      const url = button.getAttribute('data-url');
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        if (status) status.textContent = 'Link copiado';
      } catch (err) {
        if (status) status.textContent = 'No pudimos copiar el link';
      }
    });
  });
})();
