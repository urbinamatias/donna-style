// Harness de test mínimo para rutas admin que NO dependen de imágenes
// (Fase 6c: stock.js, orders.js). Replica a mano la cadena de middleware de
// `src/app.js`/`src/routes/admin/index.js` (sesión Postgres, CSRF,
// requireAdmin, adminNotice) pero deliberadamente NO requiere
// `src/routes/admin/index.js` completo ni `products.js`/`product-images.js`
// — esos routers importan `sharp` (Fase 6b), cuyo binario nativo se compila
// desde la terminal de Windows (CLAUDE.md §1) y no puede cargarse en este
// entorno WSL. Este harness deja probar stock.js/orders.js contra Postgres
// real sin ese bloqueo — no reemplaza la suite completa de `app.js`, que
// sigue debiendo correr desde Windows antes de mergear (mismo requisito ya
// documentado para admin-categories.test.js/admin-products.test.js).
const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const authRouter = require('../../../src/routes/admin/auth');
const { requireAdmin } = require('../../../src/middleware/auth');
const { ensureToken, csrfProtection } = require('../../../src/middleware/csrf');
const { formatPrice, formatDate, toScriptJson } = require('../../../src/services/format');
const { statusBadge, transitionButtonClass } = require('../../../src/services/orders-status');
const config = require('../../../src/config/env');
const { pool } = require('../../../src/db/pool');

function buildAdminTestApp(routers) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../../../src/views'));

  // Mismos locals globales que src/app.js expone a toda vista (§9) — el
  // harness los replica a mano para que las vistas admin/orders/*.ejs
  // rendericen igual que bajo la app real.
  app.locals.formatPrice = formatPrice;
  app.locals.formatDate = formatDate;
  app.locals.toScriptJson = toScriptJson;
  app.locals.statusBadge = statusBadge;
  app.locals.transitionButtonClass = transitionButtonClass;

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.use(
    session({
      store: new pgSession({ pool, tableName: 'session', createTableIfMissing: false, pruneSessionInterval: 900 }),
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 },
    })
  );

  app.use(ensureToken);
  app.use(csrfProtection);

  app.use(authRouter);
  app.use('/admin', requireAdmin);
  app.use('/admin', (req, res, next) => {
    res.locals.adminAuthenticated = true;
    next();
  });
  app.use('/admin', (req, res, next) => {
    res.locals.adminNotice = req.session.adminNotice || null;
    delete req.session.adminNotice;
    next();
  });

  for (const router of routers) {
    app.use(router);
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('error');
  });

  return app;
}

module.exports = { buildAdminTestApp };
