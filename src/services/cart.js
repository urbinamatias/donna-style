// Servicio puro de carrito (§5.7 de prompt.md, design.md D5/D6). Sin acceso
// a DB: opera sobre `lines` (la única forma persistida, req.session.cart =
// [{ variantId, quantity }]) y sobre filas "vivas" ya resueltas por
// variantsModel.findByIds. Nunca confía en precio/stock que venga del
// cliente — eso siempre se re-deriva acá a partir de `liveRows` (§CLAUDE.md
// "servicio único, sin duplicar entre card/ficha/carrito").

const { imageSrc } = require('./image-urls');

function clampQuantity(quantity, stock) {
  const qty = Number.isFinite(quantity) ? Math.trunc(quantity) : 0;
  if (qty <= 0) return 0;
  return Math.min(qty, stock);
}

// D5: una línea por variant_id; re-agregar incrementa en vez de duplicar.
function addLine(lines, variantId, quantity = 1, stock) {
  const existing = lines.find((l) => l.variantId === variantId);
  const addQty = Number.isFinite(quantity) ? Math.trunc(quantity) : 1;

  if (existing) {
    return lines.map((l) =>
      l.variantId === variantId
        ? { ...l, quantity: clampQuantity(l.quantity + addQty, stock) }
        : l
    );
  }

  const quantityClamped = clampQuantity(addQty, stock);
  if (quantityClamped <= 0) return lines;
  return [...lines, { variantId, quantity: quantityClamped }];
}

// Cantidad <= 0 se trata como remoción (spec "Update quantity").
function setQuantity(lines, variantId, quantity, stock) {
  const exists = lines.some((l) => l.variantId === variantId);
  if (!exists) return lines;

  const clamped = clampQuantity(quantity, stock);
  if (clamped <= 0) return removeLine(lines, variantId);

  return lines.map((l) => (l.variantId === variantId ? { ...l, quantity: clamped } : l));
}

function removeLine(lines, variantId) {
  return lines.filter((l) => l.variantId !== variantId);
}

// Revalidación (§5.7 / spec "Stock revalidation on open"): compara cada
// línea contra las filas vivas y auto-ajusta sin paso de confirmación.
// Notices describen QUÉ cambió, para el aviso inline por línea (D6).
function revalidate(lines, liveRows) {
  const byId = new Map(liveRows.map((row) => [row.id, row]));
  const notices = [];
  const result = [];

  for (const line of lines) {
    const row = byId.get(line.variantId);

    if (!row || row.stock <= 0) {
      notices.push({
        variantId: line.variantId,
        kind: 'removed',
        name: row ? row.product_name : null,
      });
      continue;
    }

    if (line.quantity > row.stock) {
      notices.push({
        variantId: line.variantId,
        kind: 'capped',
        name: row.product_name,
        from: line.quantity,
        to: row.stock,
      });
      result.push({ variantId: line.variantId, quantity: row.stock });
      continue;
    }

    result.push(line);
  }

  return { lines: result, notices };
}

// Subtotal/detalle de display, siempre desde `liveRows` — nunca desde datos
// que pudo haber enviado el cliente.
function summarize(lines, liveRows) {
  const byId = new Map(liveRows.map((row) => [row.id, row]));
  const display = [];
  let subtotal = 0;
  let count = 0;

  for (const line of lines) {
    const row = byId.get(line.variantId);
    if (!row) continue;

    const price = Number(row.price);
    const lineTotal = price * line.quantity;
    subtotal += lineTotal;
    count += line.quantity;

    display.push({
      variantId: line.variantId,
      quantity: line.quantity,
      name: row.product_name,
      size: row.size ?? null,
      color: row.color ?? null,
      price,
      lineTotal,
      stock: row.stock,
      // Fase 6b (spec "All image URL call sites migrated to the shared
      // helper"): 400w fijo, sin srcset — el thumbnail del carrito nunca
      // renderiza más grande que ~80px CSS x 3 DPR (D10 de design.md), así
      // que un srcset no puede elegir un candidato distinto.
      image: row.image_base_key ? imageSrc(row.product_id, row.image_base_key, 400) : null,
    });
  }

  return { lines: display, subtotal, count };
}

module.exports = { addLine, setQuantity, removeLine, revalidate, summarize };
