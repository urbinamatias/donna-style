// Servicio de búsqueda de productos por nombre (design.md D3). Normalización
// pura acá; el conocimiento de que la query usa LIKE (y su escapeo) vive en
// el modelo, dialecto de Postgres — este servicio no lo conoce.
const productsModel = require('../models/products');

const MAX_TERM_LENGTH = 100;
const RESULT_LIMIT = 48;

// Trim primero, cap después (spec "Over-length term": recorta a 100 chars
// antes de matchear). `raw` no-string (ej. `?q=a&q=b` llega como array a
// Express) -> '' -> nunca toca la DB.
function normalizeTerm(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, MAX_TERM_LENGTH);
}

// `model` es inyectable SOLO para el test del término en blanco (probar que
// no se emite ninguna query) — producción siempre usa `../models/products`.
async function searchProductsByName(rawTerm, { limit = RESULT_LIMIT, model = productsModel } = {}) {
  const term = normalizeTerm(rawTerm);
  if (term === '') return { term: '', rows: [] };
  return { term, rows: await model.searchActiveByName(term, limit) };
}

module.exports = { normalizeTerm, searchProductsByName, MAX_TERM_LENGTH, RESULT_LIMIT };
