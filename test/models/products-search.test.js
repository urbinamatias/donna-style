// Test de integración de `products.searchActiveByName` (design.md D3) contra
// el Postgres real de desarrollo. Cada test crea sus propias filas y las
// limpia — mismo patrón que products.test.js (makeProduct + createdProductIds).
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const productsModel = require('../../src/models/products');

const createdProductIds = [];

async function makeProduct(overrides = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const product = await productsModel.create({
    name: `Producto test ${suffix}`,
    slug: `producto-test-${suffix}`,
    basePrice: 1000,
    ...overrides,
  });
  createdProductIds.push(product.id);
  return product;
}

test('escapeLikeLiteral: escapa %, _ y \\ como literales', () => {
  assert.equal(productsModel.escapeLikeLiteral('%'), '\\%');
  assert.equal(productsModel.escapeLikeLiteral('_'), '\\_');
  assert.equal(productsModel.escapeLikeLiteral('\\'), '\\\\');
  assert.equal(productsModel.escapeLikeLiteral('100% algodón'), '100\\% algodón');
});

test('searchActiveByName: encuentra por coincidencia parcial en el nombre', async () => {
  const product = await makeProduct({ name: `Vestido Lino Único ${Date.now()}` });

  const rows = await productsModel.searchActiveByName('Lino Único');
  assert.ok(rows.some((r) => r.id === product.id));
});

test('searchActiveByName: tolera mayúsculas/minúsculas', async () => {
  const product = await makeProduct({ name: `Vestido MayUsculaTest ${Date.now()}` });

  const rows = await productsModel.searchActiveByName('mayusculatest');
  assert.ok(rows.some((r) => r.id === product.id));
});

test('searchActiveByName: tolera acentos (translate-based fold)', async () => {
  const product = await makeProduct({ name: `Vestido Canesú Especial ${Date.now()}` });

  const rows = await productsModel.searchActiveByName('canesu especial');
  assert.ok(rows.some((r) => r.id === product.id));
});

test('searchActiveByName: excluye productos inactivos', async () => {
  const product = await makeProduct({ name: `Producto Inactivo Buscar ${Date.now()}`, isActive: false });

  const rows = await productsModel.searchActiveByName('Inactivo Buscar');
  assert.ok(!rows.some((r) => r.id === product.id));
});

test('searchActiveByName: "%" se trata como literal, no como wildcard', async () => {
  const withPercent = await makeProduct({ name: `Descuento 20% Especial ${Date.now()}` });
  const withoutPercent = await makeProduct({ name: `Descuento Veinte Especial ${Date.now()}` });

  const rows = await productsModel.searchActiveByName('20%');
  const ids = rows.map((r) => r.id);
  assert.ok(ids.includes(withPercent.id));
  assert.ok(!ids.includes(withoutPercent.id));
});

test('searchActiveByName: intento de inyección SQL no rompe el esquema y no devuelve filas', async () => {
  const rows = await productsModel.searchActiveByName("' OR 1=1; DROP TABLE products--");
  assert.deepEqual(rows, []);

  // El esquema sigue intacto: una query trivial posterior no debe fallar.
  const { rows: check } = await pool.query('SELECT 1 AS ok');
  assert.equal(check[0].ok, 1);
});

test.after(async () => {
  if (createdProductIds.length > 0) {
    await pool.query('DELETE FROM products WHERE id = ANY($1::bigint[])', [createdProductIds]);
  }
  await pool.end();
});
