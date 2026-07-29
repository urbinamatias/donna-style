// Test de integración de la ventana de fechas de carousel_slides (§5.3).
// Inserta filas temporales y las borra en el `finally` para no ensuciar los
// datos sembrados por db/seed.js. No usa una transacción envolvente porque
// `carouselSlidesModel.findActive()` toma su propia conexión del pool
// compartido (`src/db/pool.js`) — con BEGIN/ROLLBACK en un client aparte,
// esa segunda conexión no vería las filas todavía no confirmadas.
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const carouselSlidesModel = require('../../src/models/carousel-slides');

test('carousel-slides.findActive: ventana de fechas (pasado/futuro/null)', async () => {
  const now = new Date();
  const past = new Date(now.getTime() - 1000 * 60 * 60 * 24);
  const future = new Date(now.getTime() + 1000 * 60 * 60 * 24);

  const { rows } = await pool.query(
    `INSERT INTO carousel_slides (image_desktop, alt_text, sort_order, is_active, starts_at, ends_at)
     VALUES
       ('t-vencido.jpg', 'Slide vencido (test)', 900, true, $1, $2),
       ('t-futuro.jpg', 'Slide futuro (test)', 901, true, $3, NULL),
       ('t-sin-fechas.jpg', 'Slide sin fechas (test)', 902, true, NULL, NULL),
       ('t-inactivo.jpg', 'Slide inactivo (test)', 903, false, NULL, NULL)
     RETURNING id`,
    [past, now, future]
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

test.after(async () => {
  await pool.end();
});
