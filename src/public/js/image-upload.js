// Preview cliente de recorte 3:4 antes de subir (spec "Crop preview before
// saving"): aproximación, sharp server-side es la autoridad (§7). Nunca
// bloquea el submit si el canvas falla (spec "Preview unavailable does not
// block"). Cero innerHTML/outerHTML/insertAdjacentHTML/document.write con
// datos dinámicos (CLAUDE.md §3): solo createElement + append + drawImage.
(function () {
  // Sin scoping a un wrapper `[data-image-upload-form]` a propósito: al
  // crear un producto (QA), el input de fotos vive suelto dentro de
  // #product-form, no en su propio form separado como al editar — buscar
  // los dos data-attributes directo en el documento funciona para ambos
  // casos por igual, nunca coexisten los dos a la vez en una misma página.
  const fileInput = document.querySelector('[data-image-upload-input]');
  const previews = document.querySelector('[data-image-upload-previews]');
  if (!fileInput || !previews) return;

  function clearPreviews() {
    while (previews.firstChild) previews.removeChild(previews.firstChild);
  }

  // Recorte centrado 3:4 aproximado, igual criterio que sharp
  // (fit: 'cover', position: 'centre') — solo para que la dueña vea qué
  // queda afuera ANTES de subir, no reemplaza el pipeline del servidor.
  function drawCroppedPreview(img) {
    const targetRatio = 4 / 3; // alto / ancho
    const canvas = document.createElement('canvas');
    const previewWidth = 120;
    canvas.width = previewWidth;
    canvas.height = Math.round(previewWidth * targetRatio);
    canvas.className = 'h-24 w-18 rounded border border-border object-cover';

    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas; // sin 2d context disponible: devolvemos canvas vacío, no rompe nada

    const sourceRatio = img.naturalHeight / img.naturalWidth;
    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;

    if (sourceRatio > targetRatio) {
      // La imagen es más alta que el recorte 3:4: recortamos arriba/abajo.
      sh = img.naturalWidth * targetRatio;
      sy = (img.naturalHeight - sh) / 2;
    } else {
      // La imagen es más ancha: recortamos a los costados.
      sw = img.naturalHeight / targetRatio;
      sx = (img.naturalWidth - sw) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  fileInput.addEventListener('change', () => {
    clearPreviews();
    const files = Array.from(fileInput.files || []);

    files.forEach((file) => {
      // Preview es best-effort: si algo falla (formato no soportado por el
      // navegador, HEIC en un browser que no lo decodifica, etc.) el upload
      // real igual sigue funcionando — sharp es la autoridad server-side.
      try {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const canvas = drawCroppedPreview(img);
          previews.appendChild(canvas);
          URL.revokeObjectURL(objectUrl);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
        };
        img.src = objectUrl;
      } catch {
        // No-op: el preview es una ayuda visual, nunca una precondición.
      }
    });
  });
})();
