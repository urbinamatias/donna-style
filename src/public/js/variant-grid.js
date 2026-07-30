// Grilla de generación de variantes talle×color (Fase 6a, spec
// admin-variant-generation "Client-side grid safety"). Construye TODO el DOM
// con createElement/textContent — CERO innerHTML/outerHTML/
// insertAdjacentHTML/document.write con datos dinámicos (CLAUDE.md §3).
//
// La derivación de `size_order` acá es un espejo minimalista de
// src/services/sizes.js (misma escala canónica, mismo criterio numérico):
// existe SOLO para dar el orden a la grilla en el cliente sin un round-trip
// al servidor. SIEMPRE de más chico a más grande, sin reorder manual — el
// drag-and-drop por talle se sacó (QA: no funcionaba en mobile y colgaba la
// página en desktop). Cada vez que se genera/regenera la grilla, el orden
// sale 100% de `sortSizes()`, nunca de una posición arrastrada a mano.
(function () {
  var grid = document.getElementById('variant-grid');
  if (!grid) return; // no-opera si el form no tiene grilla (mismo patrón que cart.js)

  var sizesInput = document.getElementById('sizes-input');
  var colorsInput = document.getElementById('colors-input');
  var generateBtn = document.getElementById('generate-grid');
  var noAxesCheckbox = document.getElementById('no-axes-checkbox');
  var generateError = document.getElementById('generate-grid-error');
  var existingScript = document.querySelector('[data-existing-variants]');
  var existing = [];
  try {
    existing = existingScript ? JSON.parse(existingScript.textContent) : [];
  } catch (e) {
    existing = [];
  }

  var CANONICAL = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

  function sizeOrderFor(size, index) {
    if (size === null || size === undefined) return 0;
    var trimmed = String(size).trim();
    var upper = trimmed.toUpperCase();
    var canonicalIndex = CANONICAL.indexOf(upper);
    if (canonicalIndex !== -1) return canonicalIndex * 100;
    if (trimmed !== '' && !isNaN(Number(trimmed))) return Number(trimmed);
    return 9000 + index;
  }

  function parseAxis(input) {
    if (!input.value.trim()) return [];
    return input.value
      .split(',')
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function sortSizes(sizes) {
    return sizes
      .map(function (size, index) {
        return { size: size, order: sizeOrderFor(size, index) };
      })
      .sort(function (a, b) {
        return a.order - b.order;
      })
      .map(function (entry) {
        return entry.size;
      });
  }

  // Lee el estado ACTUAL de la grilla en pantalla (antes de regenerar) para
  // preservar el stock ya cargado (spec "Regeneration preserves entered
  // data"). El SKU no se preserva porque no se pide: lo genera el servidor.
  function readCurrentRows() {
    var rows = {};
    grid.querySelectorAll('[data-row]').forEach(function (rowEl) {
      var size = rowEl.getAttribute('data-size') || '';
      var color = rowEl.getAttribute('data-color') || '';
      var key = size + '|' + color;
      rows[key] = {
        stock: rowEl.querySelector('[data-field="stock"]').value,
      };
    });
    return rows;
  }

  function clearGrid() {
    while (grid.firstChild) grid.removeChild(grid.firstChild);
  }

  // QA: con text-xs y sin ancho fijo, el campo de Stock pasaba desapercibido
  // — se subió a text-sm con más padding y un ancho explícito.
  function labeledInput(labelText, type, name, value, dataField) {
    var wrap = document.createElement('label');
    wrap.className = 'flex flex-col gap-1 text-sm font-medium';
    var span = document.createElement('span');
    span.textContent = labelText;
    var input = document.createElement('input');
    input.type = type;
    input.name = name;
    input.value = value;
    input.className = 'rounded border-2 border-borderStrong px-3 py-2 text-base font-normal w-24';
    if (dataField) input.setAttribute('data-field', dataField);
    if (type === 'number') {
      input.min = '0';
      input.step = '1';
    }
    wrap.appendChild(span);
    wrap.appendChild(input);
    return { wrap: wrap, input: input };
  }

  function hiddenInput(name, value) {
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    return input;
  }

  // Renderiza un grupo por talle, siempre en el orden de `sortSizes()` — sin
  // drag-and-drop (ver nota arriba).
  function renderGroup(size, sizeOrder, colors, presets, rowIndexRef) {
    var group = document.createElement('div');
    group.className = 'flex flex-col gap-3 rounded-lg border-2 border-borderStrong bg-bg p-3';
    group.setAttribute('data-size-group', size === null ? '' : size);
    group.setAttribute('data-size-order', String(sizeOrder));

    var header = document.createElement('div');
    header.className = 'flex items-center justify-between text-base font-semibold';
    var title = document.createElement('span');
    title.textContent = size === null ? 'Sin talle' : 'Talle ' + size;
    header.appendChild(title);
    group.appendChild(header);

    var colorList = colors.length > 0 ? colors : [null];
    colorList.forEach(function (color) {
      var key = (size === null ? '' : size) + '|' + (color === null ? '' : color);
      var preset = presets[key] || {};
      var rowIndex = rowIndexRef.value++;

      var row = document.createElement('div');
      row.className = 'flex flex-wrap items-end gap-2';
      row.setAttribute('data-row', 'true');
      row.setAttribute('data-size', size === null ? '' : size);
      row.setAttribute('data-color', color === null ? '' : color);

      if (color !== null) {
        var colorLabel = document.createElement('span');
        colorLabel.className = 'text-sm font-medium';
        colorLabel.textContent = color;
        row.appendChild(colorLabel);
      }

      row.appendChild(hiddenInput('variants[' + rowIndex + '][size]', size === null ? '' : size));
      row.appendChild(hiddenInput('variants[' + rowIndex + '][color]', color === null ? '' : color));
      row.appendChild(hiddenInput('variants[' + rowIndex + '][size_order]', String(sizeOrder)));

      var stockField = labeledInput('Cantidad en stock', 'number', 'variants[' + rowIndex + '][stock]', preset.stock || '0', 'stock');
      row.appendChild(stockField.wrap);

      group.appendChild(row);
    });

    return group;
  }

  function render(sizes, colors, presets) {
    clearGrid();
    var sortedSizes = sizes.length > 0 ? sortSizes(sizes) : [null];
    var rowIndexRef = { value: 0 };
    sortedSizes.forEach(function (size, index) {
      var order = size === null ? 0 : sizeOrderFor(size, index);
      var groupEl = renderGroup(size, order, colors, presets, rowIndexRef);
      grid.appendChild(groupEl);
    });
  }

  function presetsFromExisting(rows) {
    var presets = {};
    rows.forEach(function (v) {
      var key = (v.size || '') + '|' + (v.color || '');
      presets[key] = { stock: v.stock != null ? String(v.stock) : '0' };
    });
    return presets;
  }

  // Estado inicial: si el producto ya tenía variantes, precargar inputs de
  // talles/colores y la grilla con lo que ya existe. Si ya era un SKU único
  // sin ejes, el checkbox arranca tildado — si no, "Generar grilla" se
  // bloquearía apenas se toque sin querer (regenerar sin cambiar nada).
  if (existing.length > 0) {
    var sizesSeen = [];
    var colorsSeen = [];
    existing.forEach(function (v) {
      if (v.size && sizesSeen.indexOf(v.size) === -1) sizesSeen.push(v.size);
      if (v.color && colorsSeen.indexOf(v.color) === -1) colorsSeen.push(v.color);
    });
    sizesInput.value = sizesSeen.join(', ');
    colorsInput.value = colorsSeen.join(', ');
    if (sizesSeen.length === 0 && colorsSeen.length === 0) noAxesCheckbox.checked = true;
    render(sizesSeen, colorsSeen, presetsFromExisting(existing));
  }

  // QA: generar sin cargar Talle ni Color creaba una fila "Sin talle" sin
  // que quedara claro si fue a propósito. Ahora requiere al menos un eje,
  // salvo que se tilde el checkbox de "SKU único" a propósito.
  generateBtn.addEventListener('click', function () {
    var sizes = parseAxis(sizesInput);
    var colors = parseAxis(colorsInput);
    if (sizes.length === 0 && colors.length === 0 && !noAxesCheckbox.checked) {
      generateError.textContent =
        'Cargá al menos un talle o un color, o tildá "Este producto no tiene talles ni colores" si es un SKU único.';
      return;
    }
    generateError.textContent = '';
    var presets = readCurrentRows();
    render(sizes, colors, presets);
  });
})();
