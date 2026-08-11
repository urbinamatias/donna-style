// Fase 7 accesibilidad (design.md D4, spec R5): shouldStartAutoplay() es la
// función pura extraída de carousel.js para poder testear el guard de pausa
// sin jsdom (no disponible en el proyecto). El resto de carousel.js
// manipula DOM real (querySelectorAll, addEventListener) y queda cubierto
// por QA manual en navegador (ver design.md "Testing Strategy" y
// tasks.md "Nota de factibilidad TDD") — carousel.js debe poder
// requerirse en Node sin `document` definido (guard interno), así que este
// test solo importa la función pura, sin ejecutar el wiring de DOM.
const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldStartAutoplay } = require('../../src/public/js/carousel.js');

test('shouldStartAutoplay: no pausado y sin reduced-motion → arranca (R5 scenario 4)', () => {
  assert.equal(shouldStartAutoplay(false, false), true);
});

test('shouldStartAutoplay: pausado explícitamente → nunca arranca, aunque no haya reduced-motion (R5 scenarios 1-3)', () => {
  assert.equal(shouldStartAutoplay(true, false), false);
});

test('shouldStartAutoplay: prefers-reduced-motion → nunca arranca (R4 scenario 3)', () => {
  assert.equal(shouldStartAutoplay(false, true), false);
});

test('shouldStartAutoplay: pausado Y reduced-motion → nunca arranca', () => {
  assert.equal(shouldStartAutoplay(true, true), false);
});
