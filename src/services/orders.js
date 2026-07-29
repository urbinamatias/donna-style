// Servicio puro de armado del mensaje de WhatsApp (§5.8 de prompt.md,
// design.md D3/D4). Sin acceso a DB ni a `req` — opera solo sobre datos ya
// resueltos por la ruta (líneas revalidadas por cart.summarize, no por el
// body del cliente), mismo patrón que availability.js/cart.js/format.js.
const { formatPrice } = require('./format');

// Talle {size} / {color} → degrada a "Talle {size}" o "{color}" solo, y no
// existe la línea si ninguno de los dos está presente (§5.8: "si no tiene
// ninguno, esa línea no existe").
function buildAttrLine(line) {
  const parts = [];
  if (line.size) parts.push(`Talle ${line.size}`);
  if (line.color) parts.push(line.color);
  return parts.length > 0 ? `\n  ${parts.join(' / ')}` : '';
}

function buildItemBlock(line) {
  const nameLine = `• ${String(line.name).toUpperCase()}`;
  const attrLine = buildAttrLine(line);
  const qtyLine = `\n  ${line.quantity} x ${formatPrice(line.price)} = ${formatPrice(line.lineTotal)}`;
  return `${nameLine}${attrLine}${qtyLine}`;
}

// Nombre:/Nota: se omiten enteramente (ni etiqueta ni línea en blanco) si el
// campo no fue cargado (§5.8) — principio de ausencia (§4.5).
function buildOptionalLines({ customerName, customerNote }) {
  let text = '';
  if (customerName && customerName.trim()) text += `Nombre: ${customerName.trim()}\n`;
  if (customerNote && customerNote.trim()) text += `Nota: ${customerNote.trim()}\n`;
  return text;
}

function buildHeader({ storeName, orderCode }) {
  return `¡Hola ${storeName}! Quiero hacer este pedido:\n\nPedido: ${orderCode}`;
}

function buildTotalLine({ subtotal, count }) {
  return `Total: ${formatPrice(subtotal)} (${count} producto${count === 1 ? '' : 's'})`;
}

// Forma corta (D4): usada cuando el pedido supera ~15 items o el mensaje
// codificado supera ~1500 caracteres — los deep links de WhatsApp tienen
// límite práctico de longitud de URL. Sin bloques de item.
function buildShortMessage(opts) {
  const optional = buildOptionalLines(opts);
  return [buildHeader(opts), '', buildTotalLine(opts), '', `${optional}Ver pedido: ${opts.orderUrl}`].join('\n');
}

function buildFullMessage(opts) {
  const itemBlocks = opts.lines.map(buildItemBlock).join('\n\n');
  const optional = buildOptionalLines(opts);
  return [buildHeader(opts), '', itemBlocks, '', buildTotalLine(opts), '', `${optional}Ver pedido: ${opts.orderUrl}`].join(
    '\n'
  );
}

// Umbral medido sobre el string CODIFICADO (encodeURIComponent), nunca sobre
// el raw: acentos/saltos de línea expanden 3-9x, así que medir raw
// subestimaría la longitud real de la URL wa.me (design.md D4).
function buildWhatsappMessage(opts) {
  if (opts.lines.length > 15) {
    return { text: buildShortMessage(opts), truncated: true };
  }

  const full = buildFullMessage(opts);
  if (encodeURIComponent(full).length > 1500) {
    return { text: buildShortMessage(opts), truncated: true };
  }

  return { text: full, truncated: false };
}

function buildWaLink(phone, message) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

module.exports = { buildWhatsappMessage, buildShortMessage, buildWaLink };
