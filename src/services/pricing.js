// Servicio puro de pricing (obs #406/#407): calcula el precio con
// transferencia/efectivo y el valor de cuota a partir de `base_price`, que
// en el modelo de negocio YA ES el precio de venta actual (post-promo), no
// un precio pre-variante. Sin DB, sin `req` — mismo patrón que
// availability.js/format.js (§9 de prompt.md).

const TRANSFER_DISCOUNT = 0.3;
const INSTALLMENTS = 6;

// `basePrice` llega como string desde pg (columna NUMERIC) — coerción
// explícita con Number() antes de validar.
function computeTransferPrice(basePrice) {
  if (basePrice === null || basePrice === undefined) return null;
  const value = Number(basePrice);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * (1 - TRANSFER_DISCOUNT));
}

function computeInstallmentValue(basePrice, installments = INSTALLMENTS) {
  if (basePrice === null || basePrice === undefined) return null;
  const value = Number(basePrice);
  if (!Number.isFinite(value) || value < 0) return null;
  if (!Number.isFinite(installments) || installments <= 0) return null;
  return Math.round(value / installments);
}

module.exports = { computeTransferPrice, computeInstallmentValue, TRANSFER_DISCOUNT, INSTALLMENTS };
