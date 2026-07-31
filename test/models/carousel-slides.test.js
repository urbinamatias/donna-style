// Test de integración de `carousel_slides` (§5.3, Fase 6d tasks.md 2.1).
// Postgres real, sin mocks. Fase 6d (migración 008, design.md D-B): la
// columna pasó de `image_desktop` a `base_key` opaco y `image_mobile` se
// eliminó (el mobile SIEMPRE se deriva del mismo `base_key`) — este archivo
// reemplaza el de Fase inicial (que insertaba directo contra
// `image_desktop`, columna que ya no existe tras la migración 008).
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const carouselSlidesModel = require('../../src/models/carousel-slides');

test('carousel-slides.findActive: ventana de fechas (pasado/futuro/null)', async () => {
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 48);
  const past = new Date(now.getTime() - 1000 * 60 * 60 * 24);
  const future = new Date(now.getTime() + 1000 * 60 * 60 * 24);

  // El "vencido" cierra un día ENTERO antes de `now`, nunca en el instante
  // exacto de `now`: comparar contra `ends_at = now` corre una carrera real
  // contra el `now()` de Postgres (drift de reloj entre el host de Node y el
  // contenedor de Postgres, sin margen), y hacía flakear el test.
  const { rows } = await pool.query(
    `INSERT INTO carousel_slides (base_key, alt_text, sort_order, is_active, starts_at, ends_at)
     VALUES
       ('t-vencido', 'Slide vencido (test)', 900, true, $1, $2),
       ('t-futuro', 'Slide futuro (test)', 901, true, $3, NULL),
       ('t-sin-fechas', 'Slide sin fechas (test)', 902, true, NULL, NULL),
       ('t-inactivo', 'Slide inactivo (test)', 903, false, NULL, NULL)
     RETURNING id`,
    [twoDaysAgo, past, future]
  );
  const insertedIds = rows.map((r) => r.id);

  try {
    const active = await carouselSlidesModel.findActive();
    const altTexts = active.map((s) => s.alt_text);

    assert.ok(!altTexts.includes('Slide vencido (test)'), 'un slide con ends_at en el pasado no debe estar activo');
    assert.ok(!altTexts.includes('Slide futuro (test)'), 'un slide con starts_at en el futuro no debe estar activo');
    assert.ok(altTexts.includes('Slide sin fechas (test)'), 'sin fechas cargadas, el slide siempre cuenta como activo');
    assert.ok(!altTexts.includes('Slide inactivo (test)'), 'is_active=false nunca debe aparecer');
  } finally {
    await pool.query('DELETE FROM carousel_slides WHERE id = ANY($1::bigint[])', [insertedIds]);
  }
});

test('create: inserta con base_key opaco (columna compartida por desktop y mobile)', async () => {
  const slide = await carouselSlidesModel.create({
    baseKey: 'test-create-key',
    altText: 'Slide de test',
    sortOrder: 950,
  });
  assert.equal(slide.base_key, 'test-create-key');
  assert.equal(slide.is_active, true, 'default is_active = true');

  await pool.query('DELETE FROM carousel_slides WHERE id = $1', [slide.id]);
});

test('findAllForAdmin: trae TODAS las filas (activas e inactivas, vencidas o no), ordenadas por sort_order', async () => {
  const a = await carouselSlidesModel.create({ baseKey: 'test-admin-a', altText: 'A', sortOrder: 960, isActive: true });
  const b = await carouselSlidesModel.create({ baseKey: 'test-admin-b', altText: 'B', sortOrder: 961, isActive: false });

  try {
    const all = await carouselSlidesModel.findAllForAdmin();
    const ids = all.map((s) => s.id);
    assert.ok(ids.includes(a.id));
    assert.ok(ids.includes(b.id), 'findAllForAdmin debe incluir inactivos, a diferencia de findActive');

    const idxA = ids.indexOf(a.id);
    const idxB = ids.indexOf(b.id);
    assert.ok(idxA < idxB, 'debe respetar sort_order');
  } finally {
    await pool.query('DELETE FROM carousel_slides WHERE id = ANY($1::bigint[])', [[a.id, b.id]]);
  }
});

test('findById: trae una fila puntual o null si no existe', async () => {
  const slide = await carouselSlidesModel.create({ baseKey: 'test-find-by-id', altText: 'X', sortOrder: 970 });
  const found = await carouselSlidesModel.findById(slide.id);
  assert.equal(found.id, slide.id);

  const missing = await carouselSlidesModel.findById(999999999);
  assert.equal(missing, null);

  await pool.query('DELETE FROM carousel_slides WHERE id = $1', [slide.id]);
});

test('update: persiste alt_text/link_url/fechas/is_active sin tocar base_key', async () => {
  const slide = await carouselSlidesModel.create({ baseKey: 'test-update-key', altText: 'Original', sortOrder: 980 });

  const updated = await carouselSlidesModel.update(slide.id, {
    altText: 'Actualizado',
    linkUrl: '/promo',
    isActive: false,
    startsAt: null,
    endsAt: null,
  });

  assert.equal(updated.alt_text, 'Actualizado');
  assert.equal(updated.link_url, '/promo');
  assert.equal(updated.is_active, false);
  assert.equal(updated.base_key, 'test-update-key', 'update nunca debe tocar base_key (no hay re-upload)');

  await pool.query('DELETE FROM carousel_slides WHERE id = $1', [slide.id]);
});

test('remove: hard-delete, RETURNING * para que el caller pueda borrar los archivos', async () => {
  const slide = await carouselSlidesModel.create({ baseKey: 'test-remove-key', altText: 'A borrar', sortOrder: 990 });

  const removed = await carouselSlidesModel.remove(slide.id);
  assert.equal(removed.base_key, 'test-remove-key');

  const { rows } = await pool.query('SELECT * FROM carousel_slides WHERE id = $1', [slide.id]);
  assert.equal(rows.length, 0, 'la fila debe estar realmente borrada, no soft-deleted');
});

test('remove: id inexistente devuelve null, no revienta', async () => {
  const result = await carouselSlidesModel.remove(999999999);
  assert.equal(result, null);
});

test('reorder: persiste sort_order para el array completo de ids, en el orden dado', async () => {
  const a = await carouselSlidesModel.create({ baseKey: 'test-reorder-a', altText: 'A', sortOrder: 0 });
  const b = await carouselSlidesModel.create({ baseKey: 'test-reorder-b', altText: 'B', sortOrder: 1 });

  try {
    await carouselSlidesModel.reorder([b.id, a.id]);
    const freshA = await carouselSlidesModel.findById(a.id);
    const freshB = await carouselSlidesModel.findById(b.id);
    assert.equal(freshB.sort_order, 0);
    assert.equal(freshA.sort_order, 1);
  } finally {
    await pool.query('DELETE FROM carousel_slides WHERE id = ANY($1::bigint[])', [[a.id, b.id]]);
  }
});

test.after(async () => {
  await pool.end();
});
