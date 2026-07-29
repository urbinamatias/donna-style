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
const productsRouter = require('./products');
const { requireAdmin } = require('../../middleware/auth');
const productsModel = require('../../models/products');
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

// Dashboard (§6.3): solo el esqueleto y navegación. Pedidos pendientes y
// stock bajo dependen de datos que recién existen en 6c (proposal "Out of
// Scope" — Dashboard). El único número real que 6a puede mostrar es el total
// de productos activos.
router.get('/admin', async (req, res, next) => {
  try {
    const { total: activeCount } = await productsModel.findAllForAdmin({ isActive: true, page: 1, perPage: 1 });

    res.render('admin/layouts/admin', {
      view: '../dashboard',
      title: `Dashboard — ${config.NOMBRE_TIENDA}`,
      activeCount,
    });
  } catch (err) {
    next(err);
  }
});

router.use(categoriesRouter);
router.use(productsRouter);

module.exports = router;
