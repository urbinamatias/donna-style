// Test de integración contra el Postgres real de desarrollo (mismo patrón
// que Fase 2 estableció para correctitud a nivel de esquema). Requiere que
// `node db/seed.js` ya haya corrido — usa los fixtures reales de §0.1/§10.
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool, withTransaction } = require('../../src/db/pool');
const categoriesModel = require('../../src/models/categories');
const productsModel = require('../../src/models/products');
const variantsModel = require('../../src/models/variants');

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

test('products.findAllForAdmin: filtrar por categoría padre hace rollup a las hijas (bug reportado en QA — antes exigía match exacto)', async () => {
  const parent = await categoriesModel.findBySlug('partes-de-arriba');
  assert.ok(parent, 'seed debe tener la categoría "partes-de-arriba" — corré node db/seed.js');

  const childIds = await categoriesModel.findDescendantIds(parent.id);
  assert.ok(childIds.length > 0);

  const { rows } = await productsModel.findAllForAdmin({
    categoryIds: [parent.id, ...childIds],
    page: 1,
    perPage: 100,
  });

  const slugs = rows.map((p) => p.slug);
  assert.ok(
    slugs.includes('body-canesu'),
    'Body Canesú está asignado solo a "Bodys" (hija) y debe aparecer al filtrar por "Partes de arriba" (padre)'
  );
});

test('products.findAllForAdmin: filtrar por categoría hoja no trae productos de otras hojas', async () => {
  const leaf = await categoriesModel.findBySlug('bodys');
  assert.ok(leaf);

  const { rows } = await productsModel.findAllForAdmin({ categoryIds: [leaf.id], page: 1, perPage: 100 });

  const slugs = rows.map((p) => p.slug);
  assert.ok(slugs.includes('body-canesu'));
  assert.ok(!slugs.includes('remera-taylor'), 'Remera Taylor no está en Bodys, no debe aparecer');
});

test('products.findAllForAdmin: sin filtro de categoría (categoryIds null) trae todos los productos', async () => {
  const { rows } = await productsModel.findAllForAdmin({ page: 1, perPage: 100 });
  assert.ok(rows.length > 0);
});

// --- Fase 6a: hasOrders, update/remove tx-aware, slug freeze ---------------
// Cada test crea sus propias filas (producto/variante/pedido de prueba) y
// las limpia, para no depender de qué trae el seed ni pisar otros tests.
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

test('products.hasOrders: false para un producto sin pedidos', async () => {
  const product = await makeProduct();
  assert.equal(await productsModel.hasOrders(product.id), false);
});

test('products.hasOrders: true cuando un order_item referencia una variante del producto', async () => {
  const product = await makeProduct();
  const [variant] = await variantsModel.bulkCreate(product.id, [{ stock: 5 }]);

  const { rows: orderRows } = await pool.query(
    `INSERT INTO orders (public_token, subtotal, items_count)
     VALUES ($1, 100, 1) RETURNING id`,
    [`test-token-${Date.now()}`]
  );
  const orderId = orderRows[0].id;
  await pool.query(
    `INSERT INTO order_items (order_id, variant_id, product_name_snapshot, unit_price, quantity)
     VALUES ($1, $2, 'snapshot', 100, 1)`,
    [orderId, variant.id]
  );

  try {
    assert.equal(await productsModel.hasOrders(product.id), true);
  } finally {
    await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);
  }
});

test('products.hasOrders: vuelve false luego de que la FK hace SET NULL al borrar la variante (documenta D7)', async () => {
  const product = await makeProduct();
  const [variant] = await variantsModel.bulkCreate(product.id, [{ stock: 5 }]);

  const { rows: orderRows } = await pool.query(
    `INSERT INTO orders (public_token, subtotal, items_count)
     VALUES ($1, 100, 1) RETURNING id`,
    [`test-token-b-${Date.now()}`]
  );
  const orderId = orderRows[0].id;
  await pool.query(
    `INSERT INTO order_items (order_id, variant_id, product_name_snapshot, unit_price, quantity)
     VALUES ($1, $2, 'snapshot', 100, 1)`,
    [orderId, variant.id]
  );

  try {
    await pool.query('DELETE FROM variants WHERE id = $1', [variant.id]);
    assert.equal(
      await productsModel.hasOrders(product.id),
      false,
      'esperado: la FK ya rompió el vínculo variant_id -> product_id (SET NULL, no RESTRICT)'
    );
  } finally {
    await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);
  }
});

test('products.update: el slug queda congelado cuando se renombra sin mandar slug explícito', async () => {
  const product = await makeProduct();
  const updated = await productsModel.update(product.id, { name: 'Nombre nuevo' });
  assert.equal(updated.name, 'Nombre nuevo');
  assert.equal(updated.slug, product.slug, 'renombrar NO debe regenerar el slug (decisión confirmada esta sesión)');
});

test('products.update: el slug SÍ cambia si viene explícito en el patch', async () => {
  const product = await makeProduct();
  const newSlug = `${product.slug}-nuevo`;
  const updated = await productsModel.update(product.id, { slug: newSlug });
  assert.equal(updated.slug, newSlug);
});

test('products.update: activar sin imágenes se rechaza con un mensaje claro (D9)', async () => {
  const product = await makeProduct({ isActive: false });
  await assert.rejects(
    () => productsModel.update(product.id, { isActive: true }),
    /imagen/i
  );
  const found = await productsModel.findById(product.id);
  assert.equal(found.is_active, false, 'el intento fallido no debe dejar el producto activado');
});

test('products.update: activar CON al menos una imagen funciona', async () => {
  const product = await makeProduct({ isActive: false });
  // Fase 6b: la columna se renombró filename -> base_key (migración 007).
  await pool.query(
    `INSERT INTO product_images (product_id, base_key, alt_text) VALUES ($1, 'abc12345', 'alt')`,
    [product.id]
  );
  const updated = await productsModel.update(product.id, { isActive: true });
  assert.equal(updated.is_active, true);
});

test('products.remove + variants.replaceForProduct: rollback de transacción no deja filas parciales', async () => {
  const product = await makeProduct();
  await variantsModel.bulkCreate(product.id, [{ size: 'M', stock: 3 }]);

  await assert.rejects(
    withTransaction(async (client) => {
      await variantsModel.replaceForProduct(product.id, [{ size: 'L', sizeOrder: 40, stock: 2 }], client);
      // Fuerza un error DESPUÉS de la escritura para probar que el rollback
      // deshace la variante nueva y no deja al producto con datos a medias.
      throw new Error('fallo forzado para probar rollback');
    }),
    /fallo forzado/
  );

  const variants = await variantsModel.findByProductId(product.id);
  assert.equal(variants.length, 1, 'la variante original (M) debe seguir intacta, la L nunca debió persistir');
  assert.equal(variants[0].size, 'M');
});

test.after(async () => {
  if (createdProductIds.length > 0) {
    await pool.query('DELETE FROM products WHERE id = ANY($1::bigint[])', [createdProductIds]);
  }
  await pool.end();
});
