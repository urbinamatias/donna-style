// Selector de variante interactivo (Fase 4, §3.2/§4.3/§8.1). RENDERER-ONLY:
// lee la tabla de decisión precomputada por el servidor
// (availability.buildDecisionTable, design.md D4) y solo muestra/oculta
// valores y resuelve el variant_id — NUNCA recalcula ninguna regla de
// disponibilidad ni hace requests de red al cambiar de eje. Cero
// innerHTML/insertAdjacentHTML: createElement + textContent únicamente.
(function () {
  var AXIS_LABEL = { size: 'Talle', color: 'Color' };

  function readTable(widget) {
    var script = widget.querySelector('[data-decision-table]');
    if (!script) return null;
    try {
      return JSON.parse(script.textContent);
    } catch (e) {
      return null;
    }
  }

  // Mismo formato de clave que `decisionKey` en availability.js — es una
  // convención de serialización, no una regla de negocio: no reimplementa
  // §3.2, solo arma el string para buscar en `table.variants`.
  function variantKeyFor(table, selection) {
    if (table.axes.length === 0) return '';
    var size = table.axes.indexOf('size') !== -1 ? selection.size || '' : '';
    var color = table.axes.indexOf('color') !== -1 ? selection.color || '' : '';
    return size + '|' + color;
  }

  function availableValuesFor(table, selection, axis) {
    var candidates = (table.values[axis] || []).slice();
    table.axes.forEach(function (otherAxis) {
      if (otherAxis === axis) return;
      var otherVal = selection[otherAxis];
      if (!otherVal) return;
      var restricted =
        (table.matrix[otherAxis] && table.matrix[otherAxis][otherVal] && table.matrix[otherAxis][otherVal][axis]) || [];
      candidates = candidates.filter(function (v) {
        return restricted.indexOf(v) !== -1;
      });
    });
    return candidates;
  }

  function setUp(widget) {
    var table = readTable(widget);
    if (!table || !table.hasAnyStock) return;

    var liveRegion = widget.querySelector('[data-variant-live-region]');
    var variantIdInput = widget.querySelector('[data-variant-id-input]');
    var quantityInput = widget.querySelector('[data-quantity-input]');
    var addButton = widget.querySelector('[data-add-button]');
    var stockAvailable = widget.querySelector('[data-stock-available]');
    var stockWarning = widget.querySelector('[data-stock-warning]');
    var groups = {};
    table.axes.forEach(function (axis) {
      var group = widget.querySelector('[data-axis-group="' + axis + '"]');
      if (group) groups[axis] = group;
    });

    var selection = Object.assign({}, table.default);

    function renderGroup(axis) {
      var group = groups[axis];
      if (!group) return;
      var available = availableValuesFor(table, selection, axis);
      if (available.indexOf(selection[axis]) === -1) selection[axis] = available[0];

      while (group.firstChild) group.removeChild(group.firstChild);
      available.forEach(function (value) {
        var isSelected = selection[axis] === value;
        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = value;
        button.setAttribute('aria-pressed', String(isSelected));
        button.className =
          'min-h-11 min-w-11 rounded border px-3 py-2 text-sm ' +
          (isSelected ? 'border-[var(--brand)] font-semibold' : 'border-border');
        button.addEventListener('click', function () {
          if (selection[axis] === value) return;
          selection[axis] = value;
          onAxisChanged(axis);
        });
        group.appendChild(button);
      });
    }

    function resolveVariant() {
      var key = variantKeyFor(table, selection);
      var variant = table.variants[key];

      if (variantIdInput) variantIdInput.value = variant ? variant.id : '';
      if (addButton) addButton.disabled = !variant;
      if (quantityInput && variant) {
        quantityInput.max = String(variant.stock);
        var current = Number.parseInt(quantityInput.value, 10) || 1;
        if (current > variant.stock) quantityInput.value = String(variant.stock);
      }
      if (stockAvailable && variant) {
        stockAvailable.textContent = 'Stock disponible: ' + variant.stock;
      }
      if (stockWarning && variant) {
        if (variant.stock <= 2) {
          stockWarning.textContent = variant.stock === 1 ? '¡Es el último!' : 'Quedan ' + variant.stock;
          stockWarning.classList.remove('hidden');
        } else {
          stockWarning.textContent = '';
          stockWarning.classList.add('hidden');
        }
      }
    }

    function announce() {
      if (!liveRegion) return;
      var parts = table.axes
        .map(function (axis) {
          return selection[axis] ? AXIS_LABEL[axis] + ' ' + selection[axis] : null;
        })
        .filter(Boolean);
      liveRegion.textContent = parts.length > 0 ? parts.join(', ') + ' seleccionado' : '';
    }

    function onAxisChanged() {
      // Sin fade: la lista de valores del otro eje debe quedar siempre
      // presente, solo se actualiza cuál queda disponible/seleccionado.
      table.axes.forEach(function (axis) {
        var group = groups[axis];
        if (!group) return;
        renderGroup(axis);
      });
      resolveVariant();
      announce();
    }

    table.axes.forEach(renderGroup);
    resolveVariant();
  }

  document.querySelectorAll('[data-variant-widget]').forEach(setUp);
})();
