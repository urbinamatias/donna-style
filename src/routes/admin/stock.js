// Panel de stock (Fase 6c, spec admin-stock). Listado filtrable + edición
// bulk en una sola transacción — mismo patrón que products.js/categories.js
// (withTransaction para la escritura multi-fila, req.session.adminNotice
// para el aviso post-redirect).
const express = require('express');
const variantsModel = require('../../models/variants');
const productsModel = require('../../models/products');
const { withTransaction } = require('../../db/pool');
const config = require('../../config/env');

const router = express.Router();

// Resuelve el filtro `?producto=`. Nunca deja pasar un valor no-numérico a
// la query SQL (evitaría un 500 por cast inválido de bigint) — un id
// inválido o inexistente se trata igual: resultado vacío + aviso, jamás un
// error de servidor (spec "Unknown or invalid product filter").
async function resolveProductFilter(rawProductoId) {
  if (rawProductoId === undefined || rawProductoId === null || rawProductoId === '') {
    return { productId: null, invalid: false };
  }
  const parsed = Number(rawProductoId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { productId: null, invalid: true };
  }
  const product = await productsModel.findById(parsed);
  if (!product) {
    return { productId: null, invalid: true };
  }
  return { productId: parsed, invalid: false };
}

function buildRedirectQuery(producto, bajo) {
  const params = new URLSearchParams();
  if (producto) params.set('producto', producto);
  if (bajo) params.set('bajo', bajo);
  const qs = params.toString();
  return qs ? `/admin/stock?${qs}` : '/admin/stock';
}

router.get('/admin/stock', async (req, res, next) => {
  try {
    const lowStock = req.query.bajo === '1';
    const { productId, invalid } = await resolveProductFilter(req.query.producto);

    let rows = [];
    if (!invalid) {
      const result = await variantsModel.findAllForAdmin({ productId, lowStock, page: 1, perPage: 500 });
      rows = result.rows;
    }

    const { rows: products } = await productsModel.findAllForAdmin({ page: 1, perPage: 1000 });

    res.render('admin/layouts/admin', {
      view: '../stock/list',
      title: `Stock — ${config.NOMBRE_TIENDA}`,
      variants: rows,
      products,
      filters: { producto: req.query.producto || '', bajo: lowStock ? '1' : '' },
      invalidFilterNotice: invalid ? 'No se encontró el producto filtrado.' : null,
    });
  } catch (err) {
    next(err);
  }
});

// `stock[v_<id>]` = valor nuevo, `original[v_<id>]` = valor que la tabla
// tenía renderizado en esa request — solo las filas donde ambos difieren se
// escriben (spec "Partial edit"). El prefijo `v_` es obligatorio (mismo bug
// que `image_alt`, fase 6c QA): con una clave puramente numérica `qs`
// (`express.urlencoded({extended:true})`) interpreta `stock[<id>]` como
// índice de array y COMPACTA el array disperso apenas todos los ids de la
// tabla son <= su `arrayLimit` (20) — perdiendo los ids reales de todas las
// filas a la vez, no solo una. Por eso el bulk-save fallaba de forma
// inconsistente según qué ids de variante hubiera en pantalla. Un valor
// no-numérico, negativo o decimal rechaza TODO el submit sin escribir nada
// (spec "Invalid value"); un id de variante que ya no existe se ignora en
// silencio porque el UPDATE bulk simplemente no matchea esa fila (spec
// "Unknown variant id").
function parseRowId(key) {
  const match = /^v_(\d+)$/.exec(key);
  return match ? Number(match[1]) : NaN;
}

router.post('/admin/stock', async (req, res, next) => {
  try {
    const stockRaw = req.body.stock || {};
    const originalRaw = req.body.original || {};
    const redirectUrl = buildRedirectQuery(req.body.producto, req.body.bajo);

    const ids = Object.keys(stockRaw);
    const toApply = [];
    let invalidRowId = null;

    for (const key of ids) {
      const rowId = parseRowId(key);
      if (!Number.isInteger(rowId)) continue;

      const newVal = String(stockRaw[key] ?? '').trim();
      const originalVal = String(originalRaw[key] ?? '').trim();
      if (newVal === originalVal) continue; // sin cambios, no se escribe (setear valor absoluto, no delta)

      if (!/^\d+$/.test(newVal)) {
        invalidRowId = rowId;
        break;
      }
      toApply.push({ id: rowId, stock: Number(newVal) });
    }

    if (invalidRowId) {
      // Identifica la variante por producto/talle/color (spec QA fase 6c):
      // el id interno no le sirve a la dueña para encontrar la fila entre
      // varias ediciones sin guardar — el nombre y la combinación sí.
      const [variant] = await variantsModel.findByIds([invalidRowId]);
      const label = variant
        ? `${variant.product_name}${[variant.size, variant.color].filter(Boolean).length ? ' (' + [variant.size, variant.color].filter(Boolean).join(' / ') + ')' : ''}`
        : `variante #${invalidRowId}`;
      req.session.adminNotice = {
        type: 'error',
        message: `Valor inválido en ${label}: debe ser un número entero no negativo.`,
      };
      return res.redirect(303, redirectUrl);
    }

    if (toApply.length === 0) {
      req.session.adminNotice = { type: 'success', message: 'No hubo cambios para guardar.' };
      return res.redirect(303, redirectUrl);
    }

    const changedCount = await withTransaction((client) => variantsModel.updateStockBulk(toApply, client));

    req.session.adminNotice = {
      type: 'success',
      message: `${changedCount} variante${changedCount === 1 ? '' : 's'} actualizada${changedCount === 1 ? '' : 's'}.`,
    };
    return res.redirect(303, redirectUrl);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
