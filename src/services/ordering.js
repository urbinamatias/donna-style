// Reorder puro compartido entre `product-images.js` y `carousel-slides.js`
// (Fase 6d, design.md D-F). Sin DB — el router calcula el nuevo orden con
// esta función y la persistencia real la hace `reorder()` de cada modelo.
// `direction` es 'up' | 'down'. En los extremos (primero+up, último+down)
// es un no-op.
function reorderIds(ids, id, direction) {
  const index = ids.indexOf(id);
  if (index === -1) return ids;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= ids.length) return ids;

  const next = ids.slice();
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

module.exports = { reorderIds };
