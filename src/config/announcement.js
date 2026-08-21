// Fase 8 (fase8-bugs-produccion, design.md D1): barra de promos code-owned.
// Antes vivía en `site_settings.announcement_bar_text` (KV table) y se
// separaba por "•" en tiempo de request — en producción esa fila quedó
// vacía y la barra desapareció en silencio, sin error visible. Al ser una
// constante de código, no hay fila que pueda quedar vacía. Un único import
// compartido por `src/app.js` y `test/routes/helpers/public-test-app.js`
// (design.md D1) evita que las dos copias diverjan.
module.exports.ANNOUNCEMENT_ITEMS = Object.freeze([
  'Envíos a todo el país',
  '6 cuotas sin interés',
  '30% off abonando con efectivo/transferencia bancaria',
]);
