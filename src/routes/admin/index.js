// Composición de los routers de /admin (Fase 6a, design.md D2/D3). Único
// lugar donde se decide qué queda exento del guard — así ningún router
// nuevo puede "olvidarse" de aplicar `requireAdmin` (spec admin-auth
// "Admin route gating" + admin-routing "guard completeness").
//
// Montado en app.js ANTES de `publicRouter` (design.md, mismo bug class que
// `/carrito` en Fase 4 y `/checkout` en Fase 5): public.js termina en el
// comodín `/:parentSlug`, que de otro modo capturaría `/admin*` como si
// fuera un slug de categoría de primer nivel.
const express = require('express');
const authRouter = require('./auth');
const categoriesRouter = require('./categories');
const productImagesRouter = require('./product-images');
const productsRouter = require('./products');
const stockRouter = require('./stock');
const ordersRouter = require('./orders');
const carouselRouter = require('./carousel');
const settingsRouter = require('./settings');
const pagesRouter = require('./pages');
const { requireAdmin } = require('../../middleware/auth');
const productsModel = require('../../models/products');
const ordersModel = require('../../models/orders');
const config = require('../../config/env');

const router = express.Router();

// Login/logout quedan afuera del guard — son el único punto de entrada sin
// sesión. Todo lo demás bajo /admin exige `requireAdmin`.
router.use(authRouter);

router.use('/admin', requireAdmin);

// Local disponible para cualquier vista admin autenticada — la nav del
// layout lo usa para decidir si se muestra (spec: "no admin data leaks" en
// login, que nunca pasa por acá).
router.use('/admin', (req, res, next) => {
  res.locals.adminAuthenticated = true;
  next();
});

// Aviso de una sola vez tras un redirect (crear/editar/borrar producto o
// categoría) — mismo patrón que `cartNotices` de Fase 4: se guarda en
// sesión antes del redirect, se lee y se borra acá en el siguiente GET,
// nunca sobrevive a una segunda navegación (QA: "Guardar" no daba ningún
// aviso de éxito ni error, solo recargaba la página en silencio).
router.use('/admin', (req, res, next) => {
  res.locals.adminNotice = req.session.adminNotice || null;
  delete req.session.adminNotice;
  next();
});

// Dashboard (§6.3, Fase 6c: 3 métricas reales, spec "Real dashboard
// metrics"): pedidos pendientes, productos sin stock (TODAS sus variantes en
// 0) y productos activos. `Promise.all` porque las tres son independientes
// entre sí — ninguna depende del resultado de otra.
router.get('/admin', async (req, res, next) => {
  try {
    const [{ total: activeCount }, pendingOrdersCount, outOfStockCount] = await Promise.all([
      productsModel.findAllForAdmin({ isActive: true, page: 1, perPage: 1 }),
      ordersModel.countByStatus('pendiente'),
      productsModel.countWithoutStock(),
    ]);

    res.render('admin/layouts/admin', {
      view: '../dashboard',
      title: `Dashboard — ${config.NOMBRE_TIENDA}`,
      activeCount,
      pendingOrdersCount,
      outOfStockCount,
    });
  } catch (err) {
    next(err);
  }
});

router.use(categoriesRouter);
// Antes de productsRouter (design.md D5): product-images.js define rutas
// anidadas bajo /admin/productos/:id/imagenes/... — si productsRouter fuera
// primero no importaría acá (Express matchea por path completo, no por
// prefijo ambiguo), pero se mantiene el mismo orden declarado que el resto
// del archivo por legibilidad y para que un futuro comodín en products.js
// nunca capture estas rutas por accidente.
router.use(productImagesRouter);
router.use(productsRouter);
router.use(stockRouter);
router.use(ordersRouter);
// Fase 6d: mismo criterio de montaje que el resto — dentro de `adminRouter`,
// ANTES de `publicRouter` (app.js), así que `/admin/carrusel` y
// `/admin/configuracion` nunca son capturados por el comodín `/:parentSlug`.
router.use(carouselRouter);
router.use(settingsRouter);
// Páginas informativas (spec informational-pages): mismo criterio de
// montaje, ANTES de `publicRouter` (app.js) para que `/admin/paginas`
// nunca sea capturado por el comodín `/:parentSlug`.
router.use(pagesRouter);

module.exports = router;
