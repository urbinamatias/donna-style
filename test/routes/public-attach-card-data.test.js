// Fase 7 (design.md, tasks.md Phase 3): batching de attachCardData —
// R5-R8 de sdd/fase7-performance/spec. Requiere `public.js` directo, SIN
// pasar por `app.js` (que arrastra `adminRouter` -> `sharp`, no disponible
// en este entorno WSL — ver test/routes/public.test.js para el resto de la
// suite HTTP, bloqueada por esa misma razón). `attachCardData` no depende de
// sharp, así que se testea completo contra Postgres real desde acá,
// llamando la función directamente (exportada solo para testing, mismo
// criterio pragmático que el resto del proyecto no tenía necesidad de hasta
// ahora: los 4 call sites de public.js siguen usando el router, no este
// export).
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const productsModel = require('../../src/models/products');
const productImagesModel = require('../../src/models/product-images');
const variantsModel = require('../../src/models/variants');
const publicRouter = require('../../src/routes/public');
const { attachCardData } = publicRouter;

let productA; // con imágenes y variantes con stock
let productB; // sin imágenes, sin variantes
let stamp;

test.before(async () => {
  stamp = Date.now();
  productA = await productsModel.create({
    name: 'Fixture AttachCardData A',
    slug: `fixture-attach-card-data-a-${stamp}`,
    basePrice: 2000,
    isActive: false,
  });
  productB = await productsModel.create({
    name: 'Fixture AttachCardData B',
    slug: `fixture-attach-card-data-b-${stamp}`,
    basePrice: 2000,
    isActive: false,
  });

  await productImagesModel.bulkCreate(productA.id, [
    { filename: `fx7-acd-a1-${stamp}`, altText: 'A1', sortOrder: 1, isPrimary: false },
    { filename: `fx7-acd-a2-${stamp}`, altText: 'A2 primaria', sortOrder: 0, isPrimary: true },
  ]);
  await variantsModel.bulkCreate(productA.id, [
    { size: 'M', sizeOrder: 1, color: 'Negro', stock: 5, sku: `fx7-acd-a-${stamp}` },
  ]);
});

test.after(async () => {
  await productsModel.remove(productA.id);
  await productsModel.remove(productB.id);
  await pool.end();
});

test('attachCardData: [] devuelve [] sin pegarle a la DB (R5 scenario 3)', async () => {
  const originalQuery = pool.query.bind(pool);
  let queryCalls = 0;
  pool.query = (...args) => {
    queryCalls += 1;
    return originalQuery(...args);
  };
  try {
    const result = await attachCardData([]);
    assert.deepEqual(result, []);
    assert.equal(queryCalls, 0);
  } finally {
    pool.query = originalQuery;
  }
});

test('attachCardData: exactamente 2 queries sin importar la cantidad de productos (R5)', async () => {
  const originalQuery = pool.query.bind(pool);
  let queryCalls = 0;
  pool.query = (...args) => {
    queryCalls += 1;
    return originalQuery(...args);
  };
  try {
    await attachCardData([productA, productB]);
    assert.equal(queryCalls, 2);
  } finally {
    pool.query = originalQuery;
  }
});

test('attachCardData: producto con imágenes y variantes conserva shape completo (R6, R8)', async () => {
  const [cardA] = await attachCardData([productA]);

  assert.equal(cardA.images.length, 2);
  assert.equal(cardA.images[0].is_primary, true, 'la primaria va primero, igual que findByProductId singular');

  assert.equal(cardA.variants.length, 1);
  assert.equal(Number(cardA.variants[0].price), 2000, 'withEffectivePrice: sin price_override, cae a base_price');

  assert.equal(cardA.availability.hasAnyStock, true, 'detecta el bug de tipo string-vs-number si Number() se omite (R8)');
  assert.ok(cardA.decisionTable);
  assert.equal(typeof cardA.decisionTable, 'object');
});

test('attachCardData: producto sin imágenes ni variantes devuelve arrays vacíos, nunca undefined (R7)', async () => {
  const [cardB] = await attachCardData([productB]);

  assert.deepEqual(cardB.images, []);
  assert.deepEqual(cardB.variants, []);
  assert.equal(cardB.availability.hasAnyStock, false);
  assert.equal(cardB.decisionTable.hasAnyStock, false);
});
