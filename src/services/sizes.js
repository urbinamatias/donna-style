// Servicio puro de derivación de `size_order` (Fase 6a, §6.3 de prompt.md,
// design.md D6). Este módulo PRODUCE la columna `size_order` que
// `availability.js` ya consume ordenando por `v.size_order` — es la otra
// punta del mismo contrato, nunca reimplementa la lógica de disponibilidad
// ni la importa (esa dirección de dependencia no existe).
//
// Regla exacta (§6.3): escala canónica de letras XS→XXXL, numérico ascendente
// para talles numéricos, nunca alfabético. Nomenclatura propia (no canónica,
// no numérica) recibe un order estable por posición de inserción, para que
// el admin siempre pueda reordenar a mano sin perder filas.

const CANONICAL = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const UNKNOWN_BASE = 9000;

function sizeOrderFor(size, index = 0) {
  if (size === null || size === undefined) return 0;

  const trimmed = String(size).trim();
  const upper = trimmed.toUpperCase();
  const canonicalIndex = CANONICAL.indexOf(upper);
  if (canonicalIndex !== -1) return canonicalIndex * 100;

  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }

  return UNKNOWN_BASE + index;
}

// Copia ordenada de `sizes` (no muta el array de entrada). Usa el índice de
// inserción original como criterio de estabilidad para nomenclatura
// desconocida — dos talles "propios" nunca colisionan en el mismo order.
function sortSizes(sizes) {
  return sizes
    .map((size, index) => ({ size, order: sizeOrderFor(size, index) }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.size);
}

// Genera el producto cruzado talle×color (§6.3 "Generación de variantes").
// Un eje vacío colapsa a `[null]` para soportar productos de un solo eje
// (o de ninguno, variante única). `defaults` permite preservar stock/SKU ya
// cargados cuando se regenera la grilla tras agregar un talle/color más —
// clave `${size ?? ''}|${color ?? ''}`, mismo formato de `decisionKey` en
// availability.js, para que ambos lados hablen la misma clave si alguna vez
// hace falta cruzarlas (hoy no se cruzan).
function buildVariantGrid({ sizes = [], colors = [], defaults = {} } = {}) {
  const sizeList = sizes.length > 0 ? sortSizes(sizes) : [null];
  const colorList = colors.length > 0 ? colors : [null];

  const grid = [];
  for (const size of sizeList) {
    const sizeOrder = size !== null ? sizeOrderFor(size, sizeList.indexOf(size)) : 0;
    for (const color of colorList) {
      const key = `${size ?? ''}|${color ?? ''}`;
      const preset = defaults[key] || {};
      grid.push({
        size,
        sizeOrder,
        color,
        sku: preset.sku ?? null,
        stock: preset.stock ?? 0,
      });
    }
  }
  return grid;
}

module.exports = { CANONICAL, sizeOrderFor, sortSizes, buildVariantGrid };
