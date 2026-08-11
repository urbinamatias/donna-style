// RED #2/#3 (tasks.md 1.4/1.5): `canDeleteImage` y `reorderIds` son
// funciones PURAS (sin DB), separadas a propósito de las que sí tocan
// Postgres (integration, más abajo, spec "Deleting the last image..."
// y "Reorder with up/down controls only"). Las integration tests reusan el
// mismo patrón que test/models/products.test.js (Postgres real, requiere
// `node db/seed.js`).
const test = require('node:test');
const assert = require('node:assert/strict');

const productImagesModel = require('../../src/models/product-images');
const { canDeleteImage, reorderIds } = productImagesModel;

test('canDeleteImage: última imagen de un producto activo se bloquea (D7)', () => {
  const result = canDeleteImage({ isActive: true, imageCount: 1 });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'LAST_IMAGE_ACTIVE');
});

test('canDeleteImage: última imagen de un producto inactivo (borrador) se permite', () => {
  const result = canDeleteImage({ isActive: false, imageCount: 1 });
  assert.equal(result.allowed, true);
});

test('canDeleteImage: no-última imagen de un producto activo se permite', () => {
  const result = canDeleteImage({ isActive: true, imageCount: 3 });
  assert.equal(result.allowed, true);
});

test('canDeleteImage: cero imágenes (estado imposible en la práctica) no revienta', () => {
  const result = canDeleteImage({ isActive: false, imageCount: 0 });
  assert.equal(result.allowed, true);
});

test('reorderIds: mover "up" el primer elemento es un no-op (spec "Boundary controls inert")', () => {
  const result = reorderIds(['a', 'b', 'c'], 'a', 'up');
  assert.deepEqual(result, ['a', 'b', 'c']);
});

test('reorderIds: mover "down" el último elemento es un no-op', () => {
  const result = reorderIds(['a', 'b', 'c'], 'c', 'down');
  assert.deepEqual(result, ['a', 'b', 'c']);
});

test('reorderIds: mover "up" un elemento del medio lo swapea con el anterior', () => {
  const result = reorderIds(['a', 'b', 'c'], 'b', 'up');
  assert.deepEqual(result, ['b', 'a', 'c']);
});

test('reorderIds: mover "down" un elemento del medio lo swapea con el siguiente', () => {
  const result = reorderIds(['a', 'b', 'c'], 'b', 'down');
  assert.deepEqual(result, ['a', 'c', 'b']);
});

test('reorderIds: un id ausente del array deja el orden intacto', () => {
  const result = reorderIds(['a', 'b', 'c'], 'zzz', 'up');
  assert.deepEqual(result, ['a', 'b', 'c']);
});

// --- Integration (RED #6, tasks.md 1.7): Postgres real, mismo patrón que
// test/models/products.test.js. Producto de prueba propio (no depende del
// seed real: hasta que 3.7 reprocese los fixtures por el pipeline, un
// producto sembrado puede legítimamente tener cero imágenes tras la
// migración 007 — D2).
test('setPrimary: clear-then-set en una sola tx respeta el índice único parcial', async () => {
  const productsModel = require('../../src/models/products');
  const product = await productsModel.create({
    name: 'Test Set Primary',
    slug: `test-set-primary-${Date.now()}`,
    basePrice: 1000,
    isActive: false,
  });

  const [imgA, imgB] = await productImagesModel.bulkCreate(product.id, [
    { filename: 'fff666', altText: 'A', sortOrder: 0, isPrimary: true },
    { filename: 'ggg777', altText: 'B', sortOrder: 1, isPrimary: false },
  ]);

  await productImagesModel.setPrimary(product.id, imgB.id);
  const after = await productImagesModel.findByProductId(product.id);
  const primaries = after.filter((i) => i.is_primary);
  assert.equal(primaries.length, 1, 'a lo sumo una primaria en todo momento');
  assert.equal(primaries[0].id, imgB.id);

  await productsModel.remove(product.id);
});

test('remove: borrar la última imagen de un producto activo lanza LAST_IMAGE_ACTIVE', async () => {
  const productsModel = require('../../src/models/products');
  const withTx = require('../../src/db/pool').withTransaction;

  // Producto temporal activo con una sola imagen, aislado del resto del seed.
  const product = await withTx(async (client) => {
    const p = await productsModel.create({
      name: 'Test Última Imagen',
      slug: `test-ultima-imagen-${Date.now()}`,
      basePrice: 1000,
      isActive: false,
    });
    return p;
  });

  const [img] = await productImagesModel.bulkCreate(product.id, [
    { filename: 'abc123', altText: 'Test', sortOrder: 0, isPrimary: true },
  ]);

  await productsModel.update(product.id, { isActive: true });

  await assert.rejects(
    () => productImagesModel.remove(img.id),
    (err) => err.code === 'LAST_IMAGE_ACTIVE'
  );

  const stillThere = await productImagesModel.findByProductId(product.id);
  assert.equal(stillThere.length, 1);

  // Cleanup: desactivar y borrar el producto de prueba.
  await productsModel.update(product.id, { isActive: false });
  await productsModel.remove(product.id);
});

test('remove: al borrar la primaria promueve otra imagen restante como primaria', async () => {
  const productsModel = require('../../src/models/products');

  const product = await productsModel.create({
    name: 'Test Promocion Primaria',
    slug: `test-promocion-primaria-${Date.now()}`,
    basePrice: 1000,
    isActive: false,
  });

  const [imgA, imgB] = await productImagesModel.bulkCreate(product.id, [
    { filename: 'aaa111', altText: 'A', sortOrder: 0, isPrimary: true },
    { filename: 'bbb222', altText: 'B', sortOrder: 1, isPrimary: false },
  ]);

  await productImagesModel.remove(imgA.id);

  const remaining = await productImagesModel.findByProductId(product.id);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, imgB.id);
  assert.equal(remaining[0].is_primary, true);

  await productsModel.remove(product.id);
});

test('updateAltText: persiste el nuevo texto', async () => {
  const productsModel = require('../../src/models/products');
  const product = await productsModel.create({
    name: 'Test Alt Text',
    slug: `test-alt-text-${Date.now()}`,
    basePrice: 1000,
    isActive: false,
  });
  const [img] = await productImagesModel.bulkCreate(product.id, [
    { filename: 'ccc333', altText: 'Original', sortOrder: 0, isPrimary: true },
  ]);

  await productImagesModel.updateAltText(img.id, 'Nuevo alt text');
  const [updated] = await productImagesModel.findByProductId(product.id);
  assert.equal(updated.alt_text, 'Nuevo alt text');

  await productsModel.remove(product.id);
});

test('reorder: persiste sort_order en la DB', async () => {
  const productsModel = require('../../src/models/products');
  const product = await productsModel.create({
    name: 'Test Reorder',
    slug: `test-reorder-${Date.now()}`,
    basePrice: 1000,
    isActive: false,
  });
  const [imgA, imgB] = await productImagesModel.bulkCreate(product.id, [
    { filename: 'ddd444', altText: 'A', sortOrder: 0, isPrimary: true },
    { filename: 'eee555', altText: 'B', sortOrder: 1, isPrimary: false },
  ]);

  await productImagesModel.reorder(product.id, [imgB.id, imgA.id]);
  const rows = await productImagesModel.findByProductId(product.id);
  // findByProductId ordena por is_primary DESC, sort_order — imgA sigue
  // primaria, así que comparamos sort_order directo por id.
  const byId = new Map(rows.map((r) => [r.id, r]));
  assert.equal(byId.get(imgB.id).sort_order, 0);
  assert.equal(byId.get(imgA.id).sort_order, 1);

  await productsModel.remove(product.id);
});

// --- Fase 7 (design.md, tasks.md Phase 1): findByProductIds — batching de
// N+1 en attachCardData. Mismo precedente que variantsModel.findByIds
// (guard de array vacío, ANY($1::bigint[]), normalización Number() de la
// CLAVE del Map — R5-R8 de sdd/fase7-performance/spec). Fixtures propios,
// tres productos: A con 2 imágenes (una primaria), B con 1 imagen, C sin
// imágenes — para poder aserts exactos sin depender del seed real.
test('findByProductIds: fixtures Fase 7 + batch', async () => {
  const productsModel = require('../../src/models/products');
  const stamp = Date.now();

  const productA = await productsModel.create({
    name: 'Fixture Batch Images A',
    slug: `fixture-batch-images-a-${stamp}`,
    basePrice: 1000,
    isActive: false,
  });
  const productB = await productsModel.create({
    name: 'Fixture Batch Images B',
    slug: `fixture-batch-images-b-${stamp}`,
    basePrice: 1000,
    isActive: false,
  });
  const productC = await productsModel.create({
    name: 'Fixture Batch Images C',
    slug: `fixture-batch-images-c-${stamp}`,
    basePrice: 1000,
    isActive: false,
  });

  try {
    const [imgA1, imgA2] = await productImagesModel.bulkCreate(productA.id, [
      { filename: `fx7-a1-${stamp}`, altText: 'A1', sortOrder: 1, isPrimary: false },
      { filename: `fx7-a2-${stamp}`, altText: 'A2 primaria', sortOrder: 0, isPrimary: true },
    ]);
    const [imgB1] = await productImagesModel.bulkCreate(productB.id, [
      { filename: `fx7-b1-${stamp}`, altText: 'B1', sortOrder: 0, isPrimary: true },
    ]);

    // Caso 1: array vacío → Map vacío, sin pegarle a la DB (mismo patrón que
    // findByIds([]) de variants.js). Se prueba con un espía sobre pool.query
    // para demostrar que la query real nunca se ejecuta.
    const dbPool = require('../../src/db/pool');
    const originalQuery = dbPool.pool.query.bind(dbPool.pool);
    let queryCalls = 0;
    dbPool.pool.query = (...args) => {
      queryCalls += 1;
      return originalQuery(...args);
    };
    try {
      const emptyMap = await productImagesModel.findByProductIds([]);
      assert.equal(emptyMap instanceof Map, true);
      assert.equal(emptyMap.size, 0);
      assert.equal(queryCalls, 0, 'array vacío no debe pegarle a la DB');
    } finally {
      dbPool.pool.query = originalQuery;
    }

    // Caso 2: batch con ids reales, incluyendo un id sin filas (productC) y
    // un id con gap (999999999, inexistente) — cada producto recibe solo sus
    // propias filas, nunca cruzadas (R6 scenario 2).
    const byProduct = await productImagesModel.findByProductIds([
      productA.id,
      productB.id,
      productC.id,
      999999999,
    ]);

    // Clave numérica (R8): map.get(Number(id)) trae filas, map.get(String(id)) no.
    assert.equal(byProduct.get(Number(productA.id)).length, 2);
    assert.equal(byProduct.get(String(productA.id)), undefined);

    // Producto sin imágenes: la clave simplemente no existe (R7 — el caller
    // resuelve con `|| []`, no el modelo).
    assert.equal(byProduct.has(Number(productC.id)), false);
    assert.equal(byProduct.has(999999999), false);

    // Orden dentro del grupo: la primaria va primero, igual que
    // findByProductId singular (R6).
    const rowsA = byProduct.get(Number(productA.id));
    assert.equal(rowsA[0].id, imgA2.id);
    assert.equal(rowsA[0].is_primary, true);
    assert.equal(rowsA[1].id, imgA1.id);

    // Ningún cruce entre productos (gap de ids no contiguos).
    const rowsB = byProduct.get(Number(productB.id));
    assert.equal(rowsB.length, 1);
    assert.equal(rowsB[0].id, imgB1.id);
  } finally {
    await productsModel.remove(productA.id);
    await productsModel.remove(productB.id);
    await productsModel.remove(productC.id);
  }
});
