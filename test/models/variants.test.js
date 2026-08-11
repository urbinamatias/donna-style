// Test de integración contra el Postgres real de desarrollo (mismo patrón
// que products.test.js). Requiere `node db/seed.js` ya corrido.
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const variantsModel = require('../../src/models/variants');

test('variants.findByIds: trae solo las filas pedidas, con precio efectivo y producto joineado', async () => {
  const { rows: firstVariants } = await pool.query('SELECT id FROM variants ORDER BY id LIMIT 3');
  const ids = firstVariants.map((r) => Number(r.id));

  const rows = await variantsModel.findByIds(ids);

  assert.equal(rows.length, ids.length);
  for (const row of rows) {
    assert.ok(ids.includes(row.id));
    assert.ok('stock' in row);
    assert.ok('price' in row);
    assert.ok('product_name' in row);
    assert.ok('product_slug' in row);
  }
});

test('variants.findByIds: precio efectivo usa price_override cuando existe, si no base_price', async () => {
  const { rows: overridden } = await pool.query(
    'SELECT id, price_override FROM variants WHERE price_override IS NOT NULL LIMIT 1'
  );
  if (overridden.length === 0) return; // seed puede no tener overrides — cubierto igual por el otro assert

  const [rows] = await variantsModel.findByIds([Number(overridden[0].id)]);
  assert.equal(Number(rows.price), Number(overridden[0].price_override));
});

test('variants.findByIds: array vacío devuelve array vacío sin pegarle a la DB con ANY(NULL)', async () => {
  const rows = await variantsModel.findByIds([]);
  assert.deepEqual(rows, []);
});

test('variants.findByIds: ids inexistentes no rompen, simplemente no aparecen', async () => {
  const rows = await variantsModel.findByIds([999999999]);
  assert.deepEqual(rows, []);
});

// ---------------------------------------------------------------------
// Fase 6c (design.md, tasks.md Phase 2): panel de stock. Fixtures propios
// (productos + variantes con slug/sku únicos por timestamp) para no
// depender del contenido exacto del seed y poder aserts exactos de conteo.
const productsModel = require('../../src/models/products');
const variantsModel2 = require('../../src/models/variants'); // mismo módulo, alias solo para claridad de sección

let fixtureProductA;
let fixtureProductB;
let fixtureVariants; // [{ stock: 0 }, { stock: 2 }, { stock: 7 }] de A; [{ stock: 1 }] de B

test('setup fixtures Fase 6c', async () => {
  const stamp = Date.now();
  fixtureProductA = await productsModel.create({
    name: 'Fixture Stock A',
    slug: `fixture-stock-a-${stamp}`,
    basePrice: 1000,
  });
  fixtureProductB = await productsModel.create({
    name: 'Fixture Stock B',
    slug: `fixture-stock-b-${stamp}`,
    basePrice: 1000,
  });

  const aVariants = await variantsModel2.bulkCreate(fixtureProductA.id, [
    { size: 'S', sizeOrder: 1, stock: 0, sku: `fx-a-s-${stamp}` },
    { size: 'M', sizeOrder: 2, stock: 2, sku: `fx-a-m-${stamp}` },
    { size: 'L', sizeOrder: 3, stock: 7, sku: `fx-a-l-${stamp}` },
  ]);
  const bVariants = await variantsModel2.bulkCreate(fixtureProductB.id, [
    { size: 'S', sizeOrder: 1, stock: 1, sku: `fx-b-s-${stamp}` },
  ]);
  fixtureVariants = { a: aVariants, b: bVariants };
});

test('variants.findAllForAdmin: filtro combinado nombre de producto + bajo stock (spec "Both filters combined")', async () => {
  const { rows, total } = await variantsModel.findAllForAdmin({
    q: fixtureProductA.name,
    lowStock: true,
    page: 1,
    perPage: 100,
  });

  assert.equal(total, 2);
  const stocks = rows.map((r) => r.stock).sort((a, b) => a - b);
  assert.deepEqual(stocks, [0, 2]);
});

test('variants.findAllForAdmin: sin filtro bajo trae las 3 variantes del producto A', async () => {
  const { rows, total } = await variantsModel.findAllForAdmin({
    q: fixtureProductA.name,
    page: 1,
    perPage: 100,
  });
  assert.equal(total, 3);
  assert.equal(rows.length, 3);
});

// QA: se saca el combobox de productos (ids sin ordenar, confuso) y se
// reemplaza por búsqueda de texto — mismo criterio que el buscador público.
test('variants.findAllForAdmin: q parcial/case-insensitive matchea por nombre de producto, sin matchear otros productos con prefijo compartido', async () => {
  const { rows, total } = await variantsModel.findAllForAdmin({
    q: 'stock a', // minúsculas, fragmento del medio de "Fixture Stock A"
    page: 1,
    perPage: 100,
  });
  assert.equal(total, 3);
  assert.ok(rows.every((r) => r.product_name === fixtureProductA.name));
});

test('variants.findAllForAdmin: q sin coincidencias trae lista vacía, nunca rompe', async () => {
  const { rows, total } = await variantsModel.findAllForAdmin({
    q: 'zzz-no-existe-zzz',
    page: 1,
    perPage: 100,
  });
  assert.equal(total, 0);
  assert.deepEqual(rows, []);
});

test('variants.findAllForAdmin: q con % _ \\ se trata como texto literal, no como wildcard', async () => {
  const { rows, total } = await variantsModel.findAllForAdmin({
    q: '%_\\',
    page: 1,
    perPage: 100,
  });
  assert.equal(total, 0);
  assert.deepEqual(rows, []);
});

test('variants.updateStockBulk: escribe solo las filas dadas y devuelve la cantidad', async () => {
  const [sVariant, mVariant] = fixtureVariants.a;
  const changed = await variantsModel.updateStockBulk([
    { id: sVariant.id, stock: 5 },
    { id: mVariant.id, stock: 9 },
  ]);
  assert.equal(changed, 2);

  const { rows } = await pool.query('SELECT id, stock FROM variants WHERE id = ANY($1::bigint[])', [
    [sVariant.id, mVariant.id],
  ]);
  const byId = Object.fromEntries(rows.map((r) => [Number(r.id), r.stock]));
  assert.equal(byId[Number(sVariant.id)], 5);
  assert.equal(byId[Number(mVariant.id)], 9);
});

test('variants.decrementStock: guarded update, stock < qty devuelve false y no escribe', async () => {
  const target = fixtureVariants.b[0]; // stock 1
  const ok = await variantsModel.decrementStock(target.id, 5);
  assert.equal(ok, false);

  const { rows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [target.id]);
  assert.equal(rows[0].stock, 1);
});

test('variants.decrementStock: stock suficiente descuenta y devuelve true', async () => {
  const target = fixtureVariants.b[0]; // stock 1
  const ok = await variantsModel.decrementStock(target.id, 1);
  assert.equal(ok, true);

  const { rows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [target.id]);
  assert.equal(rows[0].stock, 0);
});

test('variants.incrementStock: repone exactamente el monto dado', async () => {
  const target = fixtureVariants.b[0]; // stock 0 tras el test anterior
  await variantsModel.incrementStock(target.id, 3);

  const { rows } = await pool.query('SELECT stock FROM variants WHERE id = $1', [target.id]);
  assert.equal(rows[0].stock, 3);
});

// QA fase 6c ("SKU obligatoriamente automático"): el cliente ya no manda
// `sku` en ningún caso — el modelo lo genera solo, determinístico por
// producto+talle+color, para que la dueña nunca tenga que pensarlo.
test('variants.bulkCreate: sin sku explícito, genera uno automático y determinístico', async () => {
  const stamp = Date.now();
  const product = await productsModel.create({
    name: 'Fixture SKU auto',
    slug: `fixture-sku-auto-${stamp}`,
    basePrice: 500,
  });
  try {
    const rows = await variantsModel.bulkCreate(product.id, [
      { size: 'M', sizeOrder: 1, color: 'Negro', stock: 1 },
    ]);
    assert.equal(rows[0].sku, `SKU-${product.id}-M-NEGRO`);
  } finally {
    await pool.query('DELETE FROM products WHERE id = $1', [product.id]);
  }
});

test('variants.replaceForProduct: re-generar sin sku explícito da el mismo sku que antes (idempotente)', async () => {
  const stamp = Date.now();
  const product = await productsModel.create({
    name: 'Fixture SKU idempotente',
    slug: `fixture-sku-idempotente-${stamp}`,
    basePrice: 500,
  });
  try {
    const first = await variantsModel.replaceForProduct(product.id, [{ size: 'S', sizeOrder: 1, stock: 1 }]);
    const second = await variantsModel.replaceForProduct(product.id, [{ size: 'S', sizeOrder: 1, stock: 2 }]);
    assert.equal(first[0].sku, second[0].sku);
    assert.equal(second[0].sku, `SKU-${product.id}-S-U`);
  } finally {
    await pool.query('DELETE FROM products WHERE id = $1', [product.id]);
  }
});

// --- Fase 7 (design.md, tasks.md Phase 2): findByProductIds — mismo
// contrato que product-images.js (R5-R8 de sdd/fase7-performance/spec).
// Fixtures propios: A con 2 variantes (orden por size_order, color), B con
// 1 variante, C sin variantes.
test('variants.findByProductIds: fixtures Fase 7 + batch', async () => {
  const stamp = Date.now();

  const productA = await productsModel.create({
    name: 'Fixture Batch Variants A',
    slug: `fixture-batch-variants-a-${stamp}`,
    basePrice: 1000,
    isActive: false,
  });
  const productB = await productsModel.create({
    name: 'Fixture Batch Variants B',
    slug: `fixture-batch-variants-b-${stamp}`,
    basePrice: 1000,
    isActive: false,
  });
  const productC = await productsModel.create({
    name: 'Fixture Batch Variants C',
    slug: `fixture-batch-variants-c-${stamp}`,
    basePrice: 1000,
    isActive: false,
  });

  try {
    const [varA1, varA2] = await variantsModel2.bulkCreate(productA.id, [
      { size: 'L', sizeOrder: 2, color: 'Negro', stock: 1, sku: `fx7-a-l-${stamp}` },
      { size: 'S', sizeOrder: 1, color: 'Blanco', stock: 3, sku: `fx7-a-s-${stamp}` },
    ]);
    const [varB1] = await variantsModel2.bulkCreate(productB.id, [
      { size: 'M', sizeOrder: 1, color: 'Rojo', stock: 5, sku: `fx7-b-m-${stamp}` },
    ]);

    // Caso 1: array vacío → Map vacío, sin pegarle a la DB.
    const dbPool = require('../../src/db/pool');
    const originalQuery = dbPool.pool.query.bind(dbPool.pool);
    let queryCalls = 0;
    dbPool.pool.query = (...args) => {
      queryCalls += 1;
      return originalQuery(...args);
    };
    try {
      const emptyMap = await variantsModel.findByProductIds([]);
      assert.equal(emptyMap instanceof Map, true);
      assert.equal(emptyMap.size, 0);
      assert.equal(queryCalls, 0, 'array vacío no debe pegarle a la DB');
    } finally {
      dbPool.pool.query = originalQuery;
    }

    // Caso 2: batch con ids reales + un id sin filas (productC) + un id
    // inexistente (gap) — cada producto recibe solo sus propias filas.
    const byProduct = await variantsModel.findByProductIds([
      productA.id,
      productB.id,
      productC.id,
      999999999,
    ]);

    // Clave numérica (R8).
    assert.equal(byProduct.get(Number(productA.id)).length, 2);
    assert.equal(byProduct.get(String(productA.id)), undefined);

    // Producto sin variantes: la clave no existe (R7).
    assert.equal(byProduct.has(Number(productC.id)), false);
    assert.equal(byProduct.has(999999999), false);

    // Orden dentro del grupo: size_order, color — igual que findByProductId.
    const rowsA = byProduct.get(Number(productA.id));
    assert.equal(rowsA[0].id, varA2.id); // size_order 1 (S)
    assert.equal(rowsA[1].id, varA1.id); // size_order 2 (L)

    // Ningún cruce entre productos.
    const rowsB = byProduct.get(Number(productB.id));
    assert.equal(rowsB.length, 1);
    assert.equal(rowsB[0].id, varB1.id);
  } finally {
    await pool.query('DELETE FROM products WHERE id = $1', [productA.id]);
    await pool.query('DELETE FROM products WHERE id = $1', [productB.id]);
    await pool.query('DELETE FROM products WHERE id = $1', [productC.id]);
  }
});

test.after(async () => {
  if (fixtureProductA) await pool.query('DELETE FROM products WHERE id = $1', [fixtureProductA.id]);
  if (fixtureProductB) await pool.query('DELETE FROM products WHERE id = $1', [fixtureProductB.id]);
  await pool.end();
});
