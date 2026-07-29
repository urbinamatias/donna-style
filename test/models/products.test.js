// Test de integración contra el Postgres real de desarrollo (mismo patrón
// que Fase 2 estableció para correctitud a nivel de esquema). Requiere que
// `node db/seed.js` ya haya corrido — usa los fixtures reales de §0.1/§10.
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const categoriesModel = require('../../src/models/categories');
const productsModel = require('../../src/models/products');

test('products.findByCategory: rollup de categoría padre incluye productos de hijas (§0.1 regla 2)', async () => {
  const parent = await categoriesModel.findBySlug('partes-de-arriba');
  assert.ok(parent, 'seed debe tener la categoría "partes-de-arriba" — corré node db/seed.js');

  const childIds = await categoriesModel.findDescendantIds(parent.id);
  assert.ok(childIds.length > 0);

  const { rows } = await productsModel.findByCategory({
    categoryIds: [parent.id, ...childIds],
    page: 1,
    perPage: 100,
  });

  const slugs = rows.map((p) => p.slug);
  assert.ok(
    slugs.includes('body-canesu'),
    'Body Canesú está asignado solo a "Bodys" (hija) y debe aparecer en el rollup de "Partes de arriba"'
  );
});

test('products.findByCategory: categoría hoja no trae productos de otras hojas', async () => {
  const leaf = await categoriesModel.findBySlug('bodys');
  assert.ok(leaf);

  const { rows } = await productsModel.findByCategory({
    categoryIds: [leaf.id],
    page: 1,
    perPage: 100,
  });

  const slugs = rows.map((p) => p.slug);
  assert.ok(slugs.includes('body-canesu'));
  assert.ok(!slugs.includes('remera-taylor'), 'Remera Taylor no está en Bodys, no debe aparecer');
});

test.after(async () => {
  await pool.end();
});
