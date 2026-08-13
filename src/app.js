const path = require('path');
const express = require('express');
const compression = require('compression');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const healthRouter = require('./routes/health');
const sitemapRouter = require('./routes/sitemap');
const cartRouter = require('./routes/cart');
const checkoutRouter = require('./routes/checkout');
const adminRouter = require('./routes/admin');
const publicRouter = require('./routes/public');
const categoriesModel = require('./models/categories');
const siteSettingsModel = require('./models/site-settings');
const pagesModel = require('./models/pages');
const { formatPrice, formatDate, toScriptJson } = require('./services/format');
const { sanitizeInline } = require('./services/rich-text');
const { computeTransferPrice, computeInstallmentValue } = require('./services/pricing');
const { statusBadge, transitionButtonClass } = require('./services/orders-status');
const { imageSrc, imageAttrs, slideImageAttrs } = require('./services/image-urls');
const { normalizeRelPath, resolveCacheControl } = require('./services/cache-headers');
const { ensureToken, csrfProtection } = require('./middleware/csrf');
const { floatingUi } = require('./middleware/floating-ui');
const storeConfig = require('./services/store-config');
const config = require('./config/env');
const { pool } = require('./db/pool');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Fase 7: detrás de un reverse proxy que termina TLS, Express ve `http` en
// `req.protocol` y express-session se NIEGA a emitir la cookie con
// `secure: true` (línea ~101) — el login de admin y el carrito quedan rotos
// en silencio, sin error ni log. `1` = confiamos en UN hop (el proxy
// inmediato); con dos proxies encadenados hay que subir el número. Solo en
// producción: en dev/test queda el default `false` de Express y nadie puede
// falsear su IP vía X-Forwarded-For (req.ip alimenta middleware/rate-limit.js).
if (config.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Disponibles en todas las vistas sin tener que pasarlas en cada res.render
// (§9 servicio compartido de formato, mismo patrón que availability.js).
app.locals.formatPrice = formatPrice;
app.locals.formatDate = formatDate;
app.locals.toScriptJson = toScriptJson;
// Páginas informativas (design.md D5): sanitizeInline se llama en RENDER
// TIME desde la vista (`<%- sanitizeInline(page.description_html) %>`),
// nunca precomputado en la ruta — defensa en profundidad ante filas
// escritas fuera del router admin, mismo criterio documentado en D5.
app.locals.sanitizeInline = sanitizeInline;
// Precio con transferencia/efectivo (30% off) y valor de cuota (obs
// #406/#407) sobre `product.base_price` — mismo patrón de helper puro
// expuesto en app.locals que formatPrice, usado desde product-card.ejs.
app.locals.computeTransferPrice = computeTransferPrice;
app.locals.computeInstallmentValue = computeInstallmentValue;
// Fase 6c: badge de estado de pedido, misma fuente de verdad que la
// máquina de transiciones (services/orders-status.js) — nunca reimplementado
// en la vista.
app.locals.statusBadge = statusBadge;
app.locals.transitionButtonClass = transitionButtonClass;
// Fase 6b: único punto de acceso al esquema de URLs de imágenes desde las
// vistas (spec "single source of truth") — product-card.ejs, product.ejs y
// services/cart.js lo consumen, ninguno concatena ancho/.webp a mano.
app.locals.imageSrc = imageSrc;
app.locals.imageAttrs = imageAttrs;
// Fase 6d: mismo criterio — único punto de acceso al esquema de URLs de
// slides del carrusel, ninguna vista concatena `-d`/`-m`/ancho a mano.
app.locals.slideImageAttrs = slideImageAttrs;
// WhatsApp floating CTA (design.md D6): único punto que normaliza el
// número a solo dígitos antes de armar el link `wa.me`.
app.locals.waDigits = storeConfig.waDigits;

const PUBLIC_DIR = path.join(__dirname, 'public');

// Fase 7 (design.md D7): PRIMER middleware — si va después de
// `express.static`, los estáticos salen sin gzip. Antes de session/CSRF es
// indistinto (solo envuelve res.write/end), así que se elige la posición
// que no depende de nada.
// Nota de mantenimiento: si el hosting final trae un reverse proxy con
// gzip/brotli, sacar esta línea para no comprimir dos veces.
app.use(compression());

// Fase 7 (design.md D1/D2, spec R1-R3): un solo mount con `setHeaders` que
// decide `Cache-Control` por prefijo de path (services/cache-headers.js) —
// un solo lugar que decide TTLs, en vez de repetir mounts por bucket.
app.use(
  express.static(PUBLIC_DIR, {
    setHeaders(res, filePath) {
      // filePath es ABSOLUTO y con el separador NATIVO de la plataforma (en
      // Windows, `\`) — normalizeRelPath lo normaliza a `/` antes del
      // dispatch por prefijo.
      const rel = normalizeRelPath(path.relative(PUBLIC_DIR, filePath));
      res.setHeader('Cache-Control', resolveCacheControl(rel));
    },
  })
);
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
// Fase 6d (design.md D-C): `siteSettingsModel.getAll()` reemplaza el
// `get('announcement_bar_text')` puntual — MISMO round trip a la DB
// devuelve el anuncio Y los 4 datos de contacto del panel. `merge()` arma
// `res.locals.storeConfig` con la WHITELIST explícita (nunca más el objeto
// `config` completo, que filtraba SESSION_SECRET/DATABASE_URL a las
// vistas). Sin caché a propósito: un cambio en el panel debe verse sin
// reiniciar el proceso (spec "Panel value wins").
app.use(async (req, res, next) => {
  try {
    // Páginas informativas (spec site-navigation "Enabled pages appear in
    // menu and footer"): TERCERA query paralela, misma fuente única para
    // nav-drawer.ejs (menú) y footer.ejs — nunca duplicada por vista.
    // `findActiveForMenu()` ya filtra por `is_active` y ordena por
    // `sort_order, id`, así que este local es directamente el orden final.
    const [menuTree, settings, pages] = await Promise.all([
      categoriesModel.findMenuTree(),
      siteSettingsModel.getAll(),
      pagesModel.findActiveForMenu(),
    ]);
    res.locals.menuTree = menuTree;
    res.locals.pages = pages;
    const announcementText = settings.announcement_bar_text;
    res.locals.announcementItems = announcementText
      ? announcementText.split('•').map((s) => s.trim()).filter(Boolean)
      : [];
    res.locals.storeConfig = storeConfig.merge(config, settings);
    next();
  } catch (err) {
    next(err);
  }
});

// `hideFloatingUI` (design.md D7): deny-list por path para el magnifier del
// header y el CTA flotante de WhatsApp — va después del chrome de
// menuTree/storeConfig de arriba (ambos consumidores viven en layouts/main
// vía `res.locals`) y antes de cualquier router, para que TODA página
// (incluido el 500 handler) vea el flag ya resuelto.
app.use(floatingUi);

app.use(healthRouter);
// Antes de publicRouter (design.md D2/D7, Fase 5 tasks.md 3.8, Fase 6a
// design.md admin-routing): public.js termina en el comodín
// `/:parentSlug`, que de otro modo capturaría `/carrito`, `/checkout`,
// `/pedido/:token`, `/admin*` y ahora `/sitemap.xml`/`/robots.txt` como si
// fueran slugs de categoría de primer nivel. `sitemapRouter` va acá, no
// después de `publicRouter` — mismo bug class, misma regla (Fase 7,
// design.md D-E, cubierto por test/routes/sitemap.test.js).
app.use(sitemapRouter);
app.use(cartRouter);
app.use(checkoutRouter);
app.use(adminRouter);
app.use(publicRouter);

// Manejador de errores genérico: nunca deja escapar un stack trace a la
// clienta (§ Threat Matrix de design.md — "nunca error/stack trace").
// Fase 6d (design.md D-C, spec "Error path does not query the DB"): usa
// `res.locals.storeConfig` si el middleware de chrome ya corrió, o
// `storeConfig.fromEnv()` (sin I/O) si el error pasó ANTES de esa
// middleware — la base de datos puede ser justo lo que falló, así que este
// handler JAMÁS espera una query nueva.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('layouts/main', {
    view: '../pages/500',
    title: 'Ocurrió un error',
    menuTree: res.locals.menuTree || [],
    pages: res.locals.pages || [],
    announcementItems: res.locals.announcementItems || [],
    storeConfig: res.locals.storeConfig || storeConfig.fromEnv(),
    csrfToken: res.locals.csrfToken || '',
    // Fase 7: una respuesta 500 nunca se indexa. Slot opcional ya existente
    // del layout (main.ejs:21-23), mismo mecanismo que checkout/pedido.
    noindex: true,
  });
});

module.exports = app;
