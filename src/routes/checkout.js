// Rutas de checkout por WhatsApp (Fase 5, §5.8/§5.9 de prompt.md,
// design.md D1/D2). Un solo router: GET/POST /checkout y GET
// /pedido/:token comparten el mismo vocabulario de lectura/render de
// pedido y la misma regla de montaje. Montado en app.js ANTES de
// publicRouter: public.js termina en el comodín `/:parentSlug`, que de
// otro modo capturaría `/checkout` y `/pedido/:token` como si fueran slugs
// de categoría de primer nivel (mismo bug ya resuelto para `/carrito` en
// Fase 4).
const express = require('express');
const { nanoid } = require('nanoid');
const variantsModel = require('../models/variants');
const ordersModel = require('../models/orders');
const cart = require('../services/cart');
const ordersService = require('../services/orders');
const { buildPrivateSeo } = require('../services/seo');
const config = require('../config/env');
const checkoutRateLimit = require('../middleware/checkout-rate-limit');

const router = express.Router();

function getLines(req) {
  return req.session.cart || [];
}

function setLines(req, lines) {
  req.session.cart = lines;
}

function render404(req, res) {
  res.status(404).render('layouts/main', {
    view: '../pages/404',
    ...buildPrivateSeo({ title: `Página no encontrada — ${config.NOMBRE_TIENDA}` }),
  });
}

// Revalida contra stock vivo y persiste el ajuste en sesión (mismo criterio
// que cart.js/D6): quien llegue a /checkout con un carrito desactualizado
// ve el estado corregido, con el aviso inline correspondiente.
async function revalidateAndSummarize(req) {
  const lines = getLines(req);
  if (lines.length === 0) return { summary: { lines: [], subtotal: 0, count: 0 }, notices: [], liveRows: [] };

  const liveRows = await variantsModel.findByIds(lines.map((l) => l.variantId));
  const { lines: revalidated, notices } = cart.revalidate(lines, liveRows);
  setLines(req, revalidated);

  const summary = cart.summarize(revalidated, liveRows);
  return { summary, notices, liveRows };
}

function cleanOptional(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// GET /checkout — spec "Checkout form": nombre y nota opcionales, sin
// dirección (logística se negocia por chat, §5.8).
router.get('/checkout', async (req, res, next) => {
  try {
    const { summary, notices } = await revalidateAndSummarize(req);

    if (summary.lines.length === 0) {
      req.session.cartNotices = notices;
      return res.redirect(303, '/carrito');
    }

    res.render('layouts/main', {
      view: '../pages/checkout',
      ...buildPrivateSeo({ title: `Finalizar pedido — ${config.NOMBRE_TIENDA}` }),
      summary,
      notices,
    });
  } catch (err) {
    next(err);
  }
});

// POST /checkout — spec "Server-side revalidation" + "Order persistence".
// Bloquea el checkout ENTERO (sin crear orders/order_items) si la
// revalidación ajustó o quitó CUALQUIER línea — no solo si el resultado
// queda vacío (tasks.md 3.3, regla más estricta del spec sobre design.md D9).
router.post('/checkout', checkoutRateLimit, async (req, res, next) => {
  try {
    const lines = getLines(req);
    if (lines.length === 0) {
      req.session.cartNotices = [];
      return res.redirect(303, '/carrito');
    }

    const liveRows = await variantsModel.findByIds(lines.map((l) => l.variantId));
    const { lines: revalidated, notices } = cart.revalidate(lines, liveRows);
    setLines(req, revalidated);

    // Empty cart (post-revalidación) O cualquier línea ajustada/removida:
    // ambos casos rechazan el checkout completo y devuelven a la clienta al
    // carrito ya corregido, sin crear ningún pedido.
    if (revalidated.length === 0 || notices.length > 0) {
      req.session.cartNotices = notices;
      return res.redirect(303, '/carrito');
    }

    const summary = cart.summarize(revalidated, liveRows);

    const items = summary.lines.map((line) => ({
      variantId: line.variantId,
      productNameSnapshot: line.name,
      size: line.size,
      color: line.color,
      unitPrice: line.price,
      quantity: line.quantity,
    }));

    const publicToken = nanoid();
    const customerName = cleanOptional(req.body.nombre);
    const customerNote = cleanOptional(req.body.nota);

    const order = await ordersModel.createWithItems({
      publicToken,
      customerName,
      customerNote,
      subtotal: summary.subtotal,
      itemsCount: summary.count,
      items,
    });

    // Carrito vacío ANTES de renderizar la confirmación (spec "Cart cleared
    // before response").
    req.session.cart = [];

    const orderUrl = `${config.SITE_URL}/pedido/${publicToken}`;
    const { text: message } = ordersService.buildWhatsappMessage({
      storeName: config.NOMBRE_TIENDA,
      orderCode: order.order_code,
      lines: summary.lines,
      subtotal: summary.subtotal,
      count: summary.count,
      customerName,
      customerNote,
      orderUrl,
    });
    // Fase 6d (design.md D-C): el número de WhatsApp lo resuelve el panel
    // (site_settings → .env → default), nunca `config.WHATSAPP_ADMIN`
    // directo — `res.locals.storeConfig` ya lo trae poblado desde el
    // middleware de chrome de app.js, sin query extra acá.
    const waLink = ordersService.buildWaLink(res.locals.storeConfig.WHATSAPP_ADMIN, message);

    // Sin redirect automático a wa.me (D5/spec "Confirmation contract"): la
    // pestaña queda en nuestra propia página con el link clickeable y el
    // aviso explícito de que hay que tocar enviar.
    res.render('layouts/main', {
      view: '../pages/checkout-confirm',
      ...buildPrivateSeo({ title: `Pedido ${order.order_code} — ${config.NOMBRE_TIENDA}` }),
      order,
      waLink,
      orderUrl,
    });
  } catch (err) {
    next(err);
  }
});

// GET /pedido/:token — spec "Token-addressed public order view": sin login,
// noindex, 404 genérico ante token inexistente (nunca revela si existen
// otros pedidos).
router.get('/pedido/:token', async (req, res, next) => {
  try {
    const order = await ordersModel.findByToken(req.params.token);
    if (!order) return render404(req, res);

    res.render('layouts/main', {
      view: '../pages/order',
      ...buildPrivateSeo({ title: `Pedido ${order.order_code} — ${config.NOMBRE_TIENDA}` }),
      order,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
