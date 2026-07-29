// Tests de integración contra el Postgres real de desarrollo (Fase 6a,
// mismo patrón que products.test.js). Cada test crea sus propias filas
// (nunca toca el seed) y las limpia en su propio `test.after`, para no
// interferir con products.test.js / variants.test.js corriendo en el mismo
// proceso.
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const categoriesModel = require('../../src/models/categories');

const createdIds = [];

test.after(async () => {
  if (createdIds.length > 0) {
    await pool.query('DELETE FROM categories WHERE id = ANY($1::bigint[])', [createdIds]);
  }
  await pool.end();
});

async function makeCategory(overrides = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const category = await categoriesModel.create({
    name: `Test ${suffix}`,
    slug: `test-${suffix}`,
    ...overrides,
  });
  createdIds.push(category.id);
  return category;
}

test('categories.update: renombra y persiste', async () => {
  const category = await makeCategory();
  const updated = await categoriesModel.update(category.id, { name: 'Renombrada' });
  assert.equal(updated.name, 'Renombrada');
  assert.equal(updated.slug, category.slug, 'slug no cambia si no vino en el patch');
});

test('categories.update: re-parentar a un root existente funciona a nivel 2', async () => {
  const parent = await makeCategory();
  const child = await makeCategory();
  const updated = await categoriesModel.update(child.id, { parentId: parent.id });
  assert.equal(Number(updated.parent_id), Number(parent.id));
});

test('categories.update: re-parentar a null vuelve la categoría a raíz', async () => {
  const parent = await makeCategory();
  const child = await makeCategory({ parentId: parent.id });
  const updated = await categoriesModel.update(child.id, { parentId: null });
  assert.equal(updated.parent_id, null);
});

test('categories.update: re-parentar bajo una categoría de nivel 2 es rechazado por el trigger (depth-3 insert)', async () => {
  const root = await makeCategory();
  const level2 = await makeCategory({ parentId: root.id });
  await assert.rejects(
    () => categoriesModel.update(level2.id, { name: level2.name }).then(() =>
      categoriesModel.create({ name: 'Nivel 3', slug: `nivel3-${Date.now()}`, parentId: level2.id })
    ),
    /max 2 levels/
  );
});

test('categories.update: re-parentar un root con hijos bajo otra categoría es rechazado (depth-3 reparent)', async () => {
  const root = await makeCategory();
  const otherRoot = await makeCategory();
  const child = await makeCategory({ parentId: root.id });
  createdIds.push(child.id);
  await assert.rejects(
    () => categoriesModel.update(root.id, { parentId: otherRoot.id }),
    /max 2 levels/
  );
});

test('categories.hasProducts: false para una categoría recién creada', async () => {
  const category = await makeCategory();
  assert.equal(await categoriesModel.hasProducts(category.id), false);
});

test('categories.hasProducts: true cuando un producto está asignado', async () => {
  const category = await makeCategory();
  const { rows } = await pool.query(
    `INSERT INTO products (name, slug, base_price) VALUES ('Test producto', $1, 100) RETURNING id`,
    [`test-producto-${Date.now()}`]
  );
  const productId = rows[0].id;
  await pool.query('INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2)', [
    productId,
    category.id,
  ]);
  try {
    assert.equal(await categoriesModel.hasProducts(category.id), true);
  } finally {
    await pool.query('DELETE FROM products WHERE id = $1', [productId]);
  }
});

test('categories.remove: borra una categoría sin productos', async () => {
  const category = await makeCategory();
  await categoriesModel.remove(category.id);
  const found = await categoriesModel.findById(category.id);
  assert.equal(found, null);
  createdIds.splice(createdIds.indexOf(category.id), 1);
});
