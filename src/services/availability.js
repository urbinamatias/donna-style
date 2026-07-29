// Servicio puro de disponibilidad de variantes (§3.2 de prompt.md).
// Sin acceso a DB: opera sobre filas de `variants` ya obtenidas, para que
// card, ficha y validación de carrito compartan la misma lógica (§9).
//
// Forma de fila esperada: { id, size, size_order, color, color_hex, stock }.
// Cualquiera de size/color puede ser null (producto sin ese eje).

const AXES = ['size', 'color'];

// Solo considera ejes que realmente existan en el set de variantes (al menos
// una fila con valor no-null para ese eje).
function axesPresent(variants) {
  return AXES.filter((axis) => variants.some((v) => v[axis] !== null && v[axis] !== undefined));
}

// Filtra variantes con stock > 0 que matchean `selection` en todos los ejes
// EXCEPTO `excludeAxis` (si se pasa). Es el filtro base reutilizado por
// getAvailableAxisValues y getDefaultSelection.
function filterInStock(variants, selection, excludeAxis) {
  return variants.filter((v) => {
    if (v.stock <= 0) return false;
    return AXES.every((axis) => {
      if (axis === excludeAxis) return true;
      if (!(axis in selection) || selection[axis] === undefined) return true;
      return v[axis] === selection[axis];
    });
  });
}

// Regla 1 y 2: valores distintos de `axisName` alcanzables por CUALQUIER fila
// con stock que matchee la selección en los demás ejes. Nunca precomputa por
// combinación fija, por eso "M sobrevive vía M/Blanco" sale gratis.
function getAvailableAxisValues(variants, axisName, selection = {}) {
  const matches = filterInStock(variants, selection, axisName);
  const values = new Set();
  for (const v of matches) {
    if (v[axisName] !== null && v[axisName] !== undefined) values.add(v[axisName]);
  }
  return [...values];
}

// Regla 3: talle más chico disponible por size_order (nunca alfabético). Si
// no hay eje de talle, primer color disponible por id.
function getDefaultSelection(variants) {
  const axes = axesPresent(variants);
  const selection = {};

  if (axes.includes('size')) {
    const inStock = variants.filter((v) => v.stock > 0 && v.size !== null && v.size !== undefined);
    if (inStock.length === 0) return selection;
    const smallest = inStock.slice().sort((a, b) => a.size_order - b.size_order)[0];
    selection.size = smallest.size;

    if (axes.includes('color')) {
      const colors = getAvailableAxisValues(variants, 'color', selection);
      if (colors.length > 0) selection.color = colors[0];
    }
    return selection;
  }

  if (axes.includes('color')) {
    const inStock = variants
      .filter((v) => v.stock > 0 && v.color !== null && v.color !== undefined)
      .slice()
      .sort((a, b) => a.id - b.id);
    if (inStock.length > 0) selection.color = inStock[0].color;
  }

  return selection;
}

// Regla 5/6: estado global del producto. `axes` solo trae los ejes que
// existen en el set de variantes; cada valor es la lista de valores vivos
// (regla 1: la combinación desaparece, no el valor — regla 4: un único valor
// restante igual se devuelve, la vista decide ocultar el control).
function computeAvailability(variants) {
  const hasAnyStock = variants.some((v) => v.stock > 0);

  if (!hasAnyStock) {
    return { hasAnyStock: false, axes: {}, defaultSelection: {} };
  }

  const present = axesPresent(variants);
  const axes = {};
  for (const axis of present) {
    axes[axis] = getAvailableAxisValues(variants, axis, {});
  }

  return {
    hasAnyStock: true,
    axes,
    defaultSelection: getDefaultSelection(variants),
  };
}

// Match exacto en todos los ejes presentes en `selection` (usado por cart
// revalidation y por isVariantAvailable).
function findVariant(variants, selection) {
  const found = variants.find((v) =>
    AXES.every((axis) => {
      if (!(axis in selection)) return true;
      return v[axis] === selection[axis];
    })
  );
  return found || null;
}

function isVariantAvailable(variants, selection) {
  const variant = findVariant(variants, selection);
  return variant !== null && variant.stock > 0;
}

module.exports = {
  computeAvailability,
  getAvailableAxisValues,
  getDefaultSelection,
  findVariant,
  isVariantAvailable,
};
