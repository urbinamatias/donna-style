// Preview cliente de recorte 3:4 antes de subir (spec "Crop preview before
// saving"): aproximación, sharp server-side es la autoridad (§7). Nunca
// bloquea el submit si el canvas falla (spec "Preview unavailable does not
// block"). Cero innerHTML/outerHTML/insertAdjacentHTML/document.write con
// datos dinámicos (CLAUDE.md §3): solo createElement + append + drawImage.
//
// Fase 8 (fase8-bugs-produccion, spec "Photo Accumulation on Product
// Creation", design.md D4/D5): reabrir el picker nativo en el alta
// reemplazaba la selección anterior — bug real de QA. `selected` pasa a
// ser la lista autoritativa acumulada en memoria; en cada 'change' del
// input SOLO llegan los archivos recién elegidos en ESE diálogo (así
// funciona el input nativo, incluso después de reescribir `input.files`
// vía DataTransfer más abajo), así que el merge con lo ya acumulado es
// responsabilidad de este script, no del navegador. El submit real sigue
// siendo un único POST (la transacción de "Guardar" no cambia) porque
// `input.files` queda sincronizado con `selected` en todo momento.
(function () {
  // Sin scoping a un wrapper `[data-image-upload-form]` a propósito: al
  // crear un producto (QA), el input de fotos vive suelto dentro de
  // #product-form, no en su propio form separado como al editar — buscar
  // los dos data-attributes directo en el documento funciona para ambos
  // casos por igual, nunca coexisten los dos a la vez en una misma página.
  const fileInput = document.querySelector('[data-image-upload-input]');
  const previews = document.querySelector('[data-image-upload-previews]');
  // Solo existe en la sección de alta (form.ejs ~139-157) — en edición no
  // hace falta: cada "Subir fotos" ya es su propia transacción inmediata,
  // reabrir el picker ahí nunca perdió nada (spec "Edit form unchanged").
  const addButton = document.querySelector('[data-image-upload-add]');
  const errorEl = document.querySelector('[data-image-upload-error]');
  if (!fileInput || !previews) return;

  // Mismo tope que el multer del servidor (spec "Per-product photo
  // limit") — el cap real y autoritativo sigue siendo el del servidor,
  // esto es UX para no dejar que la dueña arme una selección que el
  // servidor va a rechazar entera.
  const MAX_FILES = 6;

  // Guard (design.md D4, contrato de accumulation): si el navegador no
  // soporta el constructor `DataTransfer` (algunos entornos viejos/no
  // estándar), no acumulamos — volvemos al comportamiento de reemplazo de
  // siempre, y el submit nunca queda bloqueado por esto.
  const supportsDataTransfer = typeof DataTransfer !== 'undefined';

  let selected = [];

  function setError(message) {
    if (!errorEl) return;
    errorEl.textContent = message || '';
  }

  function dedupeKey(file) {
    return `${file.name}::${file.size}::${file.lastModified}`;
  }

  function syncInputFiles() {
    if (!supportsDataTransfer) return;
    const dt = new DataTransfer();
    selected.forEach((file) => dt.items.add(file));
    fileInput.files = dt.files;
  }

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

  // Reconstruye TODAS las previews desde `selected` (autoritativo) cada
  // vez — nunca parchea el DOM existente a mano, así "Quitar" y "agregar
  // más" quedan consistentes con el mismo único código de render.
  function renderPreviews() {
    clearPreviews();

    selected.forEach((file, index) => {
      const figure = document.createElement('figure');
      figure.className = 'flex flex-col items-center gap-1';

      // Preview es best-effort: si algo falla (formato no soportado por el
      // navegador, HEIC en un browser que no lo decodifica, etc.) el
      // upload real igual sigue funcionando — sharp es la autoridad
      // server-side.
      try {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const canvas = drawCroppedPreview(img);
          figure.insertBefore(canvas, figure.firstChild);
          URL.revokeObjectURL(objectUrl);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
        };
        img.src = objectUrl;
      } catch {
        // No-op: el preview es una ayuda visual, nunca una precondición.
      }

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = 'Quitar';
      removeButton.className = 'text-xs font-medium text-error underline';
      removeButton.addEventListener('click', () => {
        selected.splice(index, 1);
        syncInputFiles();
        renderPreviews();
      });

      figure.appendChild(removeButton);
      previews.appendChild(figure);
    });
  }

  fileInput.addEventListener('change', () => {
    const incoming = Array.from(fileInput.files || []);

    if (!supportsDataTransfer) {
      // Fallback: comportamiento de reemplazo de siempre (spec "guard:
      // never block submit" — sin DataTransfer no hay forma de reescribir
      // input.files, así que no intentamos acumular).
      selected = incoming.slice(0, MAX_FILES);
      renderPreviews();
      return;
    }

    const existingKeys = new Set(selected.map(dedupeKey));
    const merged = selected.slice();
    let rejectedCount = 0;

    incoming.forEach((file) => {
      const key = dedupeKey(file);
      if (existingKeys.has(key)) return; // ya estaba: no lo duplicamos
      if (merged.length >= MAX_FILES) {
        rejectedCount += 1;
        return;
      }
      existingKeys.add(key);
      merged.push(file);
    });

    selected = merged;
    syncInputFiles();
    renderPreviews();
    setError(
      rejectedCount > 0
        ? `Ya llegaste al máximo de ${MAX_FILES} fotos por producto. Se ${rejectedCount === 1 ? 'ignoró 1 foto' : `ignoraron ${rejectedCount} fotos`} de más.`
        : ''
    );
  });

  if (addButton) {
    addButton.addEventListener('click', () => fileInput.click());
  }
})();
