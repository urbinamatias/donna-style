const path = require('path');
const express = require('express');
const healthRouter = require('./routes/health');
const publicRouter = require('./routes/public');
const { formatPrice, formatDate } = require('./services/format');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Disponibles en todas las vistas sin tener que pasarlas en cada res.render
// (§9 servicio compartido de formato, mismo patrón que availability.js).
app.locals.formatPrice = formatPrice;
app.locals.formatDate = formatDate;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(healthRouter);
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
  });
});

module.exports = app;
