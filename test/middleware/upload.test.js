// RED (tasks.md 2.7, design.md D-E): `mapMulterError` hardcodeaba
// `../products/form` — reusarlo en el router de carrusel renderizaría la
// vista EQUIVOCADA (bug real encontrado en diseño, no hipotético).
// `makeMulterErrorHandler({view, title})` generaliza eso; `mapMulterError`
// queda como instancia product-bound, sin cambios de comportamiento para
// las rutas de Fase 6b (regresión cubierta acá con req/res fakeados, mismo
// patrón que csrf.test.js — sin levantar el server completo).
const test = require('node:test');
const assert = require('node:assert/strict');
const multer = require('multer');

const { mapMulterError, makeMulterErrorHandler } = require('../../src/middleware/upload');

function fakeRes() {
  const res = {
    statusCode: 200,
    renderedView: null,
    renderedLocals: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, locals) {
      this.renderedView = view;
      this.renderedLocals = locals;
      return this;
    },
    sendBody: null,
    send(body) {
      this.sendBody = body;
      return this;
    },
  };
  return res;
}

test('mapMulterError (product-bound, REGRESIÓN): LIMIT_FILE_SIZE sigue renderizando ../products/form', () => {
  const err = new multer.MulterError('LIMIT_FILE_SIZE');
  const res = fakeRes();
  let nextCalled = false;

  mapMulterError(err, {}, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.renderedView, 'admin/layouts/admin');
  assert.equal(res.renderedLocals.view, '../products/form');
});

test('makeMulterErrorHandler: LIMIT_FILE_SIZE renderiza la vista y el título PASADOS, no la de productos (bug de diseño real)', () => {
  const handler = makeMulterErrorHandler({ view: '../carousel/form', title: 'Nuevo slide' });
  const err = new multer.MulterError('LIMIT_FILE_SIZE');
  const res = fakeRes();

  handler(err, {}, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.renderedView, 'admin/layouts/admin');
  assert.equal(res.renderedLocals.view, '../carousel/form');
  assert.equal(res.renderedLocals.title, 'Nuevo slide');
});

test('makeMulterErrorHandler: error BAD_IMAGE se comporta igual que en mapMulterError (400 + mensaje, sin render)', () => {
  const handler = makeMulterErrorHandler({ view: '../carousel/form', title: 'Nuevo slide' });
  const err = new Error('no es una imagen');
  err.code = 'BAD_IMAGE';
  const res = fakeRes();

  handler(err, {}, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.sendBody, 'no es una imagen');
});

test('makeMulterErrorHandler: sin error, delega a next()', () => {
  const handler = makeMulterErrorHandler({ view: '../carousel/form', title: 'Nuevo slide' });
  const res = fakeRes();
  let nextCalled = false;

  handler(null, {}, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
