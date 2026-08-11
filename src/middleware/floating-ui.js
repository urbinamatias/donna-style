// `hideFloatingUI` (design.md D7): un único punto que decide si el magnifier
// del header y el CTA flotante de WhatsApp se ocultan, en vez de que cada
// ruta de compra (carrito/checkout) recuerde pasar el flag a mano — el
// forget-point malo es "queda visible en checkout", así que un deny-list
// centralizado y testeable como función pura es más seguro que 4+ puntos de
// `res.render` repitiendo la misma decisión.
//
// Deny-list, no allow-list: los slugs de categoría de primer nivel son
// arbitrarios (`/vestidos`, `/pantalones`, ...), así que un allow-list no es
// enumerable. `/buscar` NO matchea a propósito (spec "Search results page
// itself": ambos controles siguen visibles ahí).
const HIDDEN_PATHS = /^\/(carrito|checkout|pedido|admin)(\/|$)/;

function shouldHideFloatingUI(pathname) {
  return HIDDEN_PATHS.test(pathname);
}

function floatingUi(req, res, next) {
  res.locals.hideFloatingUI = shouldHideFloatingUI(req.path);
  next();
}

module.exports = { HIDDEN_PATHS, shouldHideFloatingUI, floatingUi };
