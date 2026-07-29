// Guard de sesión admin (Fase 6a, design.md D3/D4). Lee
// `req.session.adminId` — clave elegida a propósito para no colisionar con
// `req.session.cart`/`csrfToken`/`cartNotices` ya en uso desde Fase 4/5.
//
// Cubre TODO `/admin/*` salvo login (GET/POST) y logout; ver
// `src/routes/admin/index.js`, que es el único lugar donde se decide qué
// rutas quedan exentas — así el guard nunca puede "olvidarse" al agregar un
// router nuevo.
function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();

  // Open-redirect guard (design.md threat matrix (c)): `next` solo se honra
  // si apunta dentro de /admin, nunca a un host/ruta externa.
  const candidate = req.originalUrl;
  const next_ = typeof candidate === 'string' && /^\/admin(\/|$)/.test(candidate) ? candidate : '/admin';
  return res.redirect(303, `/admin/login?next=${encodeURIComponent(next_)}`);
}

module.exports = { requireAdmin };
