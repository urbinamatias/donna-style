// Login/logout del panel (Fase 6a, design.md D1/D5). Sin ruta de signup —
// spec admin-auth "No public signup": no existe ningún POST/GET de alta acá,
// ni en ningún otro router de /admin (404 real, no una ruta oculta).
const express = require('express');
const authService = require('../../services/auth');
const { loginRateLimit } = require('../../middleware/rate-limit');
const config = require('../../config/env');

const router = express.Router();
const rateLimit = loginRateLimit();

// Mismo patrón que layouts/main.ejs del sitio público: la vista se compone
// pasando "view" (path relativo a /views) + locals; nunca usamos una
// dependencia de layouts, el proyecto no la tiene (§9, sin agregar
// dependencias sin justificar).
function safeNext(candidate) {
  return typeof candidate === 'string' && /^\/admin(\/|$)/.test(candidate) ? candidate : null;
}

function renderLogin(res, { error = null, status = 200, next = null } = {}) {
  return res.status(status).render('admin/layouts/admin', {
    view: '../login',
    title: `Ingresar — ${config.NOMBRE_TIENDA}`,
    error,
    next,
  });
}

router.get('/admin/login', (req, res) => {
  if (req.session.adminId) return res.redirect(303, '/admin');
  return renderLogin(res, { next: safeNext(req.query.next) });
});

router.post('/admin/login', rateLimit, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    const admin = await authService.verifyCredentials(email, password);
    if (!admin) {
      req.rateLimit.recordFailure();
      // Mensaje genérico (spec "Wrong password"/"Unknown email"): el cuerpo
      // nunca revela cuál de las dos cosas falló.
      return renderLogin(res, { error: 'Email o contraseña incorrectos.', status: 401, next: safeNext(req.body.next) });
    }

    req.rateLimit.reset();
    await authService.startSession(req, admin);

    return res.redirect(303, safeNext(req.body.next) || '/admin');
  } catch (err) {
    return next(err);
  }
});

router.post('/admin/logout', async (req, res, next) => {
  try {
    await authService.endSession(req);
    return res.redirect(303, '/admin/login');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
