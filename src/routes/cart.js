// Rutas de carrito (Fase 4, §5.7 de prompt.md, design.md D7/D8). Montado en
// app.js ANTES de publicRouter: public.js termina con el comodín
// `/:parentSlug`, que de otro modo capturaría `/carrito` como si fuera un
// slug de categoría de primer nivel.
const express = require('express');
const variantsModel = require('../models/variants');
const cart = require('../services/cart');
const config = require('../config/env');

const router = express.Router();

function getLines(req) {
  return req.session.cart || [];
}

function setLines(req, lines) {
  req.session.cart = lines;
}

function wantsJson(req) {
  return (req.get('Accept') || '').includes('application/json');
}

// Regla D6: revalida contra stock vivo en cada apertura y persiste el
// ajuste, para que la siguiente apertura ya muestre el estado corregido.
async function revalidateAndSummarize(req) {
  const lines = getLines(req);
  if (lines.length === 0) return { summary: { lines: [], subtotal: 0, count: 0 }, notices: [] };

  const liveRows = await variantsModel.findByIds(lines.map((l) => l.variantId));
  const { lines: revalidated, notices } = cart.revalidate(lines, liveRows);
  setLines(req, revalidated);

  const summary = cart.summarize(revalidated, liveRows);
  return { summary, notices };
}

function respondState(req, res, { summary, notices }) {
  if (wantsJson(req)) {
    return res.json({ ...summary, notices });
  }
  req.session.cartNotices = notices;
  return res.redirect(303, '/carrito');
}

// GET /carrito — página completa (§5.7), con revalidación.
router.get('/carrito', async (req, res, next) => {
  try {
    const { summary, notices } = await revalidateAndSummarize(req);
    const sessionNotices = req.session.cartNotices || [];
    req.session.cartNotices = [];

    res.render('layouts/main', {
      view: '../pages/cart',
      title: `Carrito — ${config.NOMBRE_TIENDA}`,
      summary,
      notices: notices.length > 0 ? notices : sessionNotices,
    });
  } catch (err) {
    next(err);
  }
});

// GET /carrito/estado — mismo cálculo, forma JSON (drawer/badge sin recargar
// la página, ej. al abrir el drawer sin haber agregado nada en este request).
router.get('/carrito/estado', async (req, res, next) => {
  try {
    const { summary, notices } = await revalidateAndSummarize(req);
    res.json({ ...summary, notices });
  } catch (err) {
    next(err);
  }
});

function parseVariantId(raw) {
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseQuantity(raw, fallback = 1) {
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// POST /carrito/agregar — spec "Add to cart": re-deriva SIEMPRE desde DB
// viva vía variantsModel.findByIds; rechaza variant_id inexistente/agotado
// sin mutar la sesión (§CLAUDE.md: nunca confiar en payload del cliente).
router.post('/carrito/agregar', async (req, res, next) => {
  try {
    const variantId = parseVariantId(req.body.variant_id);
    if (!variantId) {
      return res.status(400).json({ error: 'variant_id inválido' });
    }

    const [liveVariant] = await variantsModel.findByIds([variantId]);
    if (!liveVariant || liveVariant.stock <= 0) {
      return res.status(400).json({ error: 'Variante no disponible' });
    }

    const quantity = parseQuantity(req.body.quantity, 1);
    const lines = cart.addLine(getLines(req), variantId, quantity, liveVariant.stock);
    setLines(req, lines);

    const liveRows = await variantsModel.findByIds(lines.map((l) => l.variantId));
    const summary = cart.summarize(lines, liveRows);
    return respondState(req, res, { summary, notices: [] });
  } catch (err) {
    next(err);
  }
});

// POST /carrito/actualizar — spec "Update quantity": clamp a stock vivo;
// variant_id ausente del carrito es 4xx sin crear línea.
router.post('/carrito/actualizar', async (req, res, next) => {
  try {
    const variantId = parseVariantId(req.body.variant_id);
    if (!variantId) {
      return res.status(400).json({ error: 'variant_id inválido' });
    }

    const currentLines = getLines(req);
    if (!currentLines.some((l) => l.variantId === variantId)) {
      return res.status(400).json({ error: 'La línea no existe en el carrito' });
    }

    const [liveVariant] = await variantsModel.findByIds([variantId]);
    const stock = liveVariant ? liveVariant.stock : 0;
    const quantity = parseQuantity(req.body.quantity, 0);

    const lines = cart.setQuantity(currentLines, variantId, quantity, stock);
    setLines(req, lines);

    const liveRows = await variantsModel.findByIds(lines.map((l) => l.variantId));
    const summary = cart.summarize(lines, liveRows);
    return respondState(req, res, { summary, notices: [] });
  } catch (err) {
    next(err);
  }
});

// POST /carrito/eliminar — spec "Remove line": idempotente.
router.post('/carrito/eliminar', async (req, res, next) => {
  try {
    const variantId = parseVariantId(req.body.variant_id);
    if (!variantId) {
      return res.status(400).json({ error: 'variant_id inválido' });
    }

    const lines = cart.removeLine(getLines(req), variantId);
    setLines(req, lines);

    const liveRows = await variantsModel.findByIds(lines.map((l) => l.variantId));
    const summary = cart.summarize(lines, liveRows);
    return respondState(req, res, { summary, notices: [] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
