// Carrito client-side (Fase 4, §5.7/§4.3/§8.1). Progressive enhancement:
// TODOS los forms de carrito (agregar/actualizar/eliminar) funcionan como
// POST normales sin JS (303 de vuelta a /carrito). Con JS, se interceptan
// para responder con la respuesta JSON del servidor y render sin recargar
// — nunca innerHTML, solo textContent/createElement/<template>+cloneNode.
// Revalida contra GET /carrito/estado (mismo cálculo server-side que usa
// /carrito) cada vez que el drawer se abre o al cargar la página.
(function () {
  var drawerDetails = document.getElementById('cart-drawer');
  var drawerTrigger = document.getElementById('cart-drawer-trigger');
  var lineTemplate = document.querySelector('[data-cart-line-template]');
  if (!drawerDetails || !drawerTrigger || !lineTemplate) return;

  var csrfMeta = document.querySelector('meta[name="csrf-token"]');
  var csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';

  // Fuente de verdad del código de moneda: src/services/format.js#CURRENCY.
  // Este archivo es JS de cliente sin bundler/módulos (§1 CLAUDE.md), así
  // que no puede importarlo — queda como literal a propósito, no
  // "consolidado" de mentira; si CURRENCY cambia alguna vez, este literal
  // hay que actualizarlo a mano.
  var currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
  function formatPrice(amount) {
    return currencyFormatter.format(amount).replace(/ /, '');
  }

  function fetchJson(url, options) {
    var opts = options || {};
    opts.headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    return fetch(url, opts).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }

  // El drawer y la página /carrito comparten los mismos data-attributes de
  // contenedor (misma pieza de UI, dos lugares donde puede estar montada a
  // la vez) — querySelectorAll + forEach para actualizar TODAS las
  // instancias presentes en el documento, nunca solo la primera.
  function renderNotices(state) {
    document.querySelectorAll('[data-cart-notices]').forEach(function (container) {
      while (container.firstChild) container.removeChild(container.firstChild);
      (state.notices || []).forEach(function (notice) {
        var p = document.createElement('p');
        p.className = 'rounded border border-border-strong bg-bg px-2 py-1 text-xs text-error';
        if (notice.kind === 'removed') {
          p.textContent = (notice.name || 'Un producto') + ' se agotó y fue quitado del carrito.';
        } else if (notice.kind === 'capped') {
          p.textContent = (notice.name || 'Un producto') + ': la cantidad se ajustó a ' + notice.to + ' por stock disponible.';
        }
        container.appendChild(p);
      });
    });
  }

  function renderBadge(count) {
    var existing = drawerTrigger.querySelector('[data-cart-badge]');
    if (count > 0) {
      if (!existing) {
        existing = document.createElement('span');
        existing.setAttribute('data-cart-badge', '');
        existing.className = 'ml-1 rounded-full bg-text px-1.5 py-0.5 text-xs font-semibold text-bg';
        drawerTrigger.appendChild(existing);
      }
      existing.textContent = String(count);
    } else if (existing) {
      existing.remove(); // principio de ausencia: carrito vacío no lleva badge
    }
  }

  function buildLineNode(line) {
    var node = lineTemplate.content.cloneNode(true);
    var img = node.querySelector('[data-line-image]');
    if (line.image) {
      img.src = line.image;
      img.alt = '';
    } else if (img) {
      img.remove();
    }

    var attrs = [line.size, line.color].filter(Boolean).join(' / ');
    node.querySelector('[data-line-name]').textContent = line.name;
    var attrsEl = node.querySelector('[data-line-attrs]');
    if (attrs) attrsEl.textContent = attrs;
    else attrsEl.remove();

    node.querySelector('[data-line-total]').textContent = formatPrice(line.lineTotal);

    node.querySelectorAll('[data-form-csrf]').forEach(function (el) {
      el.value = csrfToken;
    });
    node.querySelectorAll('[data-form-variant-id]').forEach(function (el) {
      el.value = String(line.variantId);
    });

    var qtyInput = node.querySelector('[data-line-qty]');
    qtyInput.value = String(line.quantity);
    qtyInput.max = String(line.stock);
    var qtyLabel = node.querySelector('[data-line-qty-label]');
    if (qtyLabel) qtyLabel.textContent = 'Cantidad de ' + line.name;

    return node;
  }

  function renderLines(state) {
    var lists = document.querySelectorAll('[data-cart-lines]');
    var empties = document.querySelectorAll('[data-cart-empty]');
    var footers = document.querySelectorAll('[data-cart-footer]');
    var subtotals = document.querySelectorAll('[data-cart-subtotal]');
    var isEmpty = !state.lines || state.lines.length === 0;

    empties.forEach(function (empty) {
      empty.classList.toggle('hidden', !isEmpty);
    });
    footers.forEach(function (footer) {
      footer.classList.toggle('hidden', isEmpty);
    });

    lists.forEach(function (list) {
      list.classList.toggle('hidden', isEmpty);
      while (list.firstChild) list.removeChild(list.firstChild);
      (state.lines || []).forEach(function (line) {
        list.appendChild(buildLineNode(line));
      });
    });

    subtotals.forEach(function (subtotalEl) {
      subtotalEl.textContent = formatPrice(state.subtotal);
    });
  }

  function renderState(state) {
    renderBadge(state.count || 0);
    renderNotices(state);
    renderLines(state);
  }

  function refreshState() {
    return fetchJson('/carrito/estado').then(function (result) {
      if (result.ok) renderState(result.body);
      return result;
    });
  }

  function openDrawer() {
    if (drawerDetails.open) return;
    drawerTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }

  // Delegado en document: cubre tanto los forms server-renderizados
  // (cart.ejs, card/ficha) como los clonados dinámicamente del <template>
  // del drawer — un solo listener, sin re-adjuntar por cada render.
  document.addEventListener('submit', function (event) {
    var form = event.target;
    var isAdd = form.matches && form.matches('[data-add-form]');
    var isCartForm = form.matches && form.matches('[data-cart-form]');
    if (!isAdd && !isCartForm) return;

    event.preventDefault();
    var errorEl = form.querySelector('[data-add-error]');
    if (errorEl) errorEl.textContent = '';

    var formData = new FormData(form);
    var body = new URLSearchParams();
    formData.forEach(function (value, key) {
      body.append(key, value);
    });

    fetchJson(form.getAttribute('action'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-Token': csrfToken },
      body: body.toString(),
    }).then(function (result) {
      if (!result.ok) {
        // Bug QA: pedir más cantidad que el stock disponible se rechaza
        // (400) en vez de agregar el máximo en silencio — este mensaje es
        // la única forma en que la clienta se entera.
        if (errorEl && result.body && result.body.error) errorEl.textContent = result.body.error;
        return;
      }
      renderState(result.body);
      // §4.4: el drawer abre solo al agregar, y es la única confirmación
      // (nunca junto a un toast).
      if (isAdd) openDrawer();
    });
  });

  drawerTrigger.addEventListener('click', function () {
    // Revalidación en cada apertura (spec "Stock revalidation on open"). El
    // click dispara el toggle nativo de <details> (o el de menu-animate.js);
    // acá solo pedimos el estado fresco en paralelo, nunca bloqueante.
    if (!drawerDetails.open) refreshState();
  });

  refreshState();
})();
