// Fase 7 accesibilidad (design.md D1/D2/D3, spec R1/R2): computeNextFocusIndex()
// es la función pura extraída de menu-animate.js para testear la decisión de
// wrap-around del focus trap sin jsdom (no disponible en el proyecto). Recibe
// la CANTIDAD de focusables (recalculada en cada Tab, R2) y el índice activo
// actual, nunca nodos DOM — el wiring real (querySelectorAll + keydown en el
// elemento drawer) queda cubierto por QA manual en navegador (ver
// design.md "Testing Strategy" y tasks.md "Nota de factibilidad TDD"), igual
// criterio que carousel.js/shouldStartAutoplay. menu-animate.js debe poder
// requerirse en Node sin `document` definido (guard interno).
//
// QA real post-apply: la primera versión solo calculaba el índice en los
// BORDES (primero/último) y devolvía `null` en posición intermedia para
// dejar el Tab nativo del navegador seguir solo — asumía que el próximo
// focusable nativo coincidía con el próximo de nuestra lista. En el
// navegador real, con nav-drawer.ejs y search-toggle.ejs como hermanos DOM
// dentro del mismo header, el Tab nativo podía escapar el drawer. Fix:
// SIEMPRE devuelve un índice explícito (nunca `null`), así el caller
// siempre controla el foco a mano, sin depender de que el orden nativo del
// documento coincida con la lista de focusables del drawer.
const test = require('node:test');
const assert = require('node:assert/strict');

const { computeNextFocusIndex } = require('../../src/public/js/menu-animate.js');

test('computeNextFocusIndex: sin focusables devuelve -1 (fallback D3: preventDefault + drawer.focus())', () => {
  assert.equal(computeNextFocusIndex(0, -1, false), -1);
  assert.equal(computeNextFocusIndex(0, -1, true), -1);
});

test('computeNextFocusIndex: Shift+Tab en el primer focusable → vuelve al último (R1 scenario 2)', () => {
  assert.equal(computeNextFocusIndex(4, 0, true), 3);
});

test('computeNextFocusIndex: Shift+Tab con foco fuera de la lista (ej. en el propio drawer) → va al último', () => {
  assert.equal(computeNextFocusIndex(4, -1, true), 3);
});

test('computeNextFocusIndex: Tab en el último focusable → vuelve al primero (R1 scenario 1)', () => {
  assert.equal(computeNextFocusIndex(4, 3, false), 0);
});

test('computeNextFocusIndex: Tab con foco fuera de la lista → va al primero', () => {
  assert.equal(computeNextFocusIndex(4, -1, false), 0);
});

test('computeNextFocusIndex: Tab en una posición intermedia → SIEMPRE devuelve el índice siguiente explícito (nunca null, nunca comportamiento nativo)', () => {
  assert.equal(computeNextFocusIndex(4, 1, false), 2);
  assert.equal(computeNextFocusIndex(4, 2, true), 1);
});

test('computeNextFocusIndex: la lista recién recalculada (R2) puede crecer entre Tabs sin romper el wrap', () => {
  // Simula el acordeón del mega-menu revelando más focusables tras abrirse:
  // la lista pasa de 4 a 7 y el último índice de wrap se recalcula solo.
  assert.equal(computeNextFocusIndex(7, 6, false), 0);
  assert.equal(computeNextFocusIndex(7, 0, true), 6);
});

// Fase 7 lightbox (design.md D2, tasks.md T3): mismo contrato reusado por
// gallery.js para el wrap-around de prev/next entre fotos del overlay —
// `shiftKey` se mapea a "ir a la anterior" (←/prev), sin `shiftKey` a "ir a
// la siguiente" (→/next). Cero lógica nueva: estos casos DEMUESTRAN que la
// reutilización para fotos es segura, no agregan una segunda implementación.
test('computeNextFocusIndex reusada para fotos: n=1 SIEMPRE devuelve índice 0, sin importar prev/next ni el índice activo (R5 scenario 3)', () => {
  assert.equal(computeNextFocusIndex(1, 0, false), 0, 'next con 1 sola foto');
  assert.equal(computeNextFocusIndex(1, 0, true), 0, 'prev con 1 sola foto');
});

test('computeNextFocusIndex reusada para fotos: n=2 alterna 0↔1 en next (→) y en prev (←) (R5 scenarios 1-2)', () => {
  // next (→): de la última foto vuelve a la primera (wrap-around).
  assert.equal(computeNextFocusIndex(2, 1, false), 0);
  assert.equal(computeNextFocusIndex(2, 0, false), 1);
  // prev (←): de la primera foto vuelve a la última (wrap-around).
  assert.equal(computeNextFocusIndex(2, 0, true), 1);
  assert.equal(computeNextFocusIndex(2, 1, true), 0);
});
