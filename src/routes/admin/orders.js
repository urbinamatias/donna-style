// Panel de pedidos (Fase 6c, spec admin-orders). Toda la lógica de
// transición/efecto de stock vive en `services/orders-status.js` — esta
// ruta solo orquesta: lee el `from` bajo lock, valida, mueve stock ítem por
// ítem, hace el CAS de status, todo dentro de una única transacción
// (design.md "Data Flow — confirm order").
const express = require('express');
const ordersModel = require('../../models/orders');
const variantsModel = require('../../models/variants');
const ordersStatus = require('../../services/orders-status');
const { withTransaction } = require('../../db/pool');
const config = require('../../config/env');

const router = express.Router();

const VALID_STATUSES = new Set(Object.keys(ordersStatus.TRANSITIONS));

router.get('/admin/pedidos', async (req, res, next) => {
  try {
    const rawStatus = req.query.estado;
    // Un status desconocido se trata como "sin filtro" (spec: "An invalid
    // status value MUST behave as 'no filter' or return an explicit empty
    // state, never a 500") — nunca se manda un string arbitrario a la query.
    const status = VALID_STATUSES.has(rawStatus) ? rawStatus : null;

    const { rows } = await ordersModel.findAllForAdmin({ status, page: 1, perPage: 100 });

    res.render('admin/layouts/admin', {
      view: '../orders/list',
      title: `Pedidos — ${config.NOMBRE_TIENDA}`,
      orders: rows,
      filters: { estado: rawStatus || '' },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/pedidos/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).send('Pedido no encontrado.');

    const order = await ordersModel.findByIdWithItems(id);
    if (!order) return res.status(404).send('Pedido no encontrado.');

    const availableTransitions = (ordersStatus.TRANSITIONS[order.status] || []).map((to) => ({
      to,
      badge: ordersStatus.statusBadge(to),
    }));

    res.render('admin/layouts/admin', {
      view: '../orders/detail',
      title: `Pedido ${order.order_code} — ${config.NOMBRE_TIENDA}`,
      order,
      availableTransitions,
    });
  } catch (err) {
    next(err);
  }
});

class InsufficientStockError extends Error {
  constructor(details) {
    super('Stock insuficiente.');
    this.code = 'INSUFFICIENT_STOCK';
    this.details = details;
  }
}

// Data Flow (design.md): SELECT ... FOR UPDATE -> canTransition -> mover
// stock ítem por ítem (saltea variant_id NULL, regla "Items with no live
// variant are skipped") -> CAS de status. Todo o nada: cualquier throw
// dentro de `withTransaction` hace ROLLBACK completo.
router.post('/admin/pedidos/:id/estado', async (req, res, next) => {
  const id = Number(req.params.id);
  const to = req.body.estado;

  try {
    if (!Number.isInteger(id)) return res.status(404).send('Pedido no encontrado.');

    await withTransaction(async (client) => {
      const from = await ordersModel.findStatusForUpdate(id, client);
      if (!from) {
        const err = new Error('Pedido no encontrado.');
        err.code = 'NOT_FOUND';
        throw err;
      }

      if (!ordersStatus.canTransition(from, to)) {
        const err = new Error(`Transición ${from} -> ${to} no permitida.`);
        err.code = 'INVALID_TRANSITION';
        throw err;
      }

      const effect = ordersStatus.stockEffect(from, to);
      if (effect !== 'none') {
        const items = await ordersModel.findItems(id, client);
        const details = [];
        for (const item of items) {
          if (item.variant_id === null) continue; // regla: item huérfano se saltea

          if (effect === 'decrement') {
            const ok = await variantsModel.decrementStock(item.variant_id, item.quantity, client);
            if (!ok) {
              const { rows } = await client.query('SELECT stock FROM variants WHERE id = $1', [item.variant_id]);
              details.push({
                productName: item.product_name_snapshot,
                size: item.size,
                color: item.color,
                requested: item.quantity,
                available: rows[0] ? rows[0].stock : 0,
              });
            }
          } else if (effect === 'restore') {
            await variantsModel.incrementStock(item.variant_id, item.quantity, client);
          }
        }
        if (details.length > 0) throw new InsufficientStockError(details);
      }

      const updated = await ordersModel.updateStatus(id, from, to, client);
      if (!updated) {
        const err = new Error('El pedido ya cambió de estado (double-submit).');
        err.code = 'STALE_TRANSITION';
        throw err;
      }
    });

    req.session.adminNotice = { type: 'success', message: `Pedido actualizado a "${to}".` };
    return res.redirect(303, `/admin/pedidos/${id}`);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).send('Pedido no encontrado.');

    if (err.code === 'INSUFFICIENT_STOCK') {
      const names = err.details
        .map((d) => `${d.productName} (${[d.size, d.color].filter(Boolean).join('/')}) — pedido ${d.requested}, disponible ${d.available}`)
        .join('; ');
      req.session.adminNotice = { type: 'error', message: `Stock insuficiente: ${names}.` };
      return res.redirect(303, `/admin/pedidos/${id}`);
    }

    if (err.code === 'INVALID_TRANSITION' || err.code === 'STALE_TRANSITION') {
      req.session.adminNotice = { type: 'error', message: err.message };
      return res.redirect(303, `/admin/pedidos/${id}`);
    }

    return next(err);
  }
});

module.exports = router;
