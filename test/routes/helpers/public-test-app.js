// Harness de test mínimo para publicRouter (Fase 7 lightbox, tasks.md T1/T4/
// T8). Replica a mano la cadena de middleware de `src/app.js` que
// publicRouter necesita (sesión Postgres, CSRF, chrome de menuTree/
// storeConfig, floatingUi) pero deliberadamente NO requiere `src/app.js`
// completo (que arrastra `adminRouter` -> `sharp`, no disponible en este
// entorno WSL — mismo criterio que test/routes/helpers/admin-test-app.js y
// test/routes/public-attach-card-data.test.js). Permite testear rutas HTTP
// reales de publicRouter (render de layouts/main + pages/product) contra
// Postgres real, sin ese bloqueo.
const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const publicRouter = require('../../../src/routes/public');
const categoriesModel = require('../../../src/models/categories');
const siteSettingsModel = require('../../../src/models/site-settings');
const { formatPrice, formatDate, toScriptJson } = require('../../../src/services/format');
const { computeTransferPrice, computeInstallmentValue } = require('../../../src/services/pricing');
const { imageSrc, imageAttrs, slideImageAttrs } = require('../../../src/services/image-urls');
const { ensureToken, csrfProtection } = require('../../../src/middleware/csrf');
const { floatingUi } = require('../../../src/middleware/floating-ui');
const storeConfig = require('../../../src/services/store-config');
const config = require('../../../src/config/env');
const { pool } = require('../../../src/db/pool');

function buildPublicTestApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../../../src/views'));

  app.locals.formatPrice = formatPrice;
  app.locals.formatDate = formatDate;
  app.locals.toScriptJson = toScriptJson;
  app.locals.computeTransferPrice = computeTransferPrice;
  app.locals.computeInstallmentValue = computeInstallmentValue;
  app.locals.imageSrc = imageSrc;
  app.locals.imageAttrs = imageAttrs;
  app.locals.slideImageAttrs = slideImageAttrs;
  app.locals.waDigits = storeConfig.waDigits;

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

  app.use((req, res, next) => {
    const lines = req.session.cart || [];
    res.locals.cartCount = lines.reduce((sum, l) => sum + l.quantity, 0);
    next();
  });

  app.use(async (req, res, next) => {
    try {
      const [menuTree, settings] = await Promise.all([categoriesModel.findMenuTree(), siteSettingsModel.getAll()]);
      res.locals.menuTree = menuTree;
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

  app.use(floatingUi);

  app.use(publicRouter);

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('error');
  });

  return app;
}

module.exports = { buildPublicTestApp, pool };
