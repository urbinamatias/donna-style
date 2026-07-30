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
