const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const healthRouter = require('./routes/health');
const cartRouter = require('./routes/cart');
const checkoutRouter = require('./routes/checkout');
const adminRouter = require('./routes/admin');
const publicRouter = require('./routes/public');
const categoriesModel = require('./models/categories');
const siteSettingsModel = require('./models/site-settings');
const { formatPrice, formatDate, toScriptJson } = require('./services/format');
const { imageSrc, imageAttrs } = require('./services/image-urls');
const { ensureToken, csrfProtection } = require('./middleware/csrf');
const config = require('./config/env');
const { pool } = require('./db/pool');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Disponibles en todas las vistas sin tener que pasarlas en cada res.render
// (§9 servicio compartido de formato, mismo patrón que availability.js).
app.locals.formatPrice = formatPrice;
app.locals.formatDate = formatDate;
app.locals.toScriptJson = toScriptJson;
// Fase 6b: único punto de acceso al esquema de URLs de imágenes desde las
// vistas (spec "single source of truth") — product-card.ejs, product.ejs y
// services/cart.js lo consumen, ninguno concatena ancho/.webp a mano.
app.locals.imageSrc = imageSrc;
app.locals.imageAttrs = imageAttrs;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sesión respaldada en Postgres (design.md D1/D2). `createTableIfMissing:
// false` a propósito: la tabla la crea la migración numerada
// 006_session.sql, no el auto-create de la librería (quedaría fuera de
// `schema_migrations`). `pruneSessionInterval: 900` limpia filas vencidas
// cada 15 min sin tocar sesiones activas. `saveUninitialized: false` evita
// que cualquier visita anónima escriba una fila — solo un carrito real
// persiste.
app.use(
  session({
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: false, pruneSessionInterval: 900 }),
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días, spec "Rolling expiry"
    },
  })
);

// CSRF (design.md D3): mintea/expone el token en toda request, verifica en
// las mutantes. Va antes de las rutas para que TODA vista tenga
// `res.locals.csrfToken` disponible, incluidas las de public.js.
app.use(ensureToken);
app.use(csrfProtection);

// Badge del header (spec "Cart count in shell") — disponible en cualquier
// vista sin que cada ruta lo pase a mano. Principio de ausencia (§4.5): 0
// es un valor válido, la vista decide no renderizar el badge en ese caso.
app.use((req, res, next) => {
  const lines = req.session.cart || [];
  res.locals.cartCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  next();
});

// Menú/anuncios del chrome (header/footer), comunes a TODA página, no solo
// al catálogo: movido acá (antes vivía solo en public.js) porque cart.js
// también renderiza layouts/main y necesita los mismos locals — una sola
// carga por request, nunca duplicada entre routers.
app.use(async (req, res, next) => {
  try {
    const [menuTree, announcementText] = await Promise.all([
      categoriesModel.findMenuTree(),
      siteSettingsModel.get('announcement_bar_text'),
    ]);
    res.locals.menuTree = menuTree;
    res.locals.announcementItems = announcementText
      ? announcementText.split('•').map((s) => s.trim()).filter(Boolean)
      : [];
    res.locals.storeConfig = config;
    next();
  } catch (err) {
    next(err);
  }
});

app.use(healthRouter);
// Antes de publicRouter (design.md D2/D7, Fase 5 tasks.md 3.8, Fase 6a
// design.md admin-routing): public.js termina en el comodín
// `/:parentSlug`, que de otro modo capturaría `/carrito`, `/checkout`,
// `/pedido/:token` y `/admin*` como si fueran slugs de categoría de primer
// nivel. `adminRouter` va acá, no después de `publicRouter` — mismo bug
// class, misma regla, cubierto por una regresión automatizada
// (test/routes/admin-routing.test.js).
app.use(cartRouter);
app.use(checkoutRouter);
app.use(adminRouter);
app.use(publicRouter);

// Manejador de errores genérico: nunca deja escapar un stack trace a la
// clienta (§ Threat Matrix de design.md — "nunca error/stack trace").
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('layouts/main', {
    view: '../pages/500',
    title: 'Ocurrió un error',
    menuTree: res.locals.menuTree || [],
    announcementItems: res.locals.announcementItems || [],
    storeConfig: require('./config/env'),
    csrfToken: res.locals.csrfToken || '',
  });
});

module.exports = app;
