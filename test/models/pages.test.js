// Test de integración de `pages` (§ tasks.md T4, spec informational-pages).
// Postgres real, sin mocks — mismo patrón que carousel-slides.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/db/pool');
const pagesModel = require('../../src/models/pages');

async function cleanup(ids) {
  if (ids.length === 0) return;
  await pool.query('DELETE FROM pages WHERE id = ANY($1::bigint[])', [ids]);
}

test('create: inserta con is_active=false y sort_order = nextSortOrder() (al final)', async () => {
  const first = await pagesModel.create({ title: 'T Envíos', slug: 't-envios', descriptionHtml: 'contenido' });
  const second = await pagesModel.create({ title: 'T Cambios', slug: 't-cambios', descriptionHtml: 'contenido' });
  try {
    assert.equal(first.is_active, false);
    assert.equal(second.is_active, false);
    assert.ok(second.sort_order > first.sort_order, 'la segunda página nueva va después de la primera');
  } finally {
    await cleanup([first.id, second.id]);
  }
});

test('nextSortOrder: siempre al final del orden existente', async () => {
  const a = await pagesModel.create({ title: 'T Orden A', slug: 't-orden-a', descriptionHtml: 'x' });
  const next = await pagesModel.nextSortOrder();
  assert.ok(next > a.sort_order);
  await cleanup([a.id]);
});

test('findAllForAdmin: ILIKE por título (tolerante a mayúsculas)', async () => {
  const a = await pagesModel.create({ title: 'T Envíos y devoluciones', slug: 't-envios-dev', descriptionHtml: 'x' });
  try {
    const found = await pagesModel.findAllForAdmin({ term: 'envíos' });
    assert.ok(found.some((p) => p.id === a.id));
    const notFound = await pagesModel.findAllForAdmin({ term: 'zzz-inexistente' });
    assert.ok(!notFound.some((p) => p.id === a.id));
  } finally {
    await cleanup([a.id]);
  }
});

test('findActiveForMenu: solo is_active=true, ordenadas por sort_order, id', async () => {
  const enabled = await pagesModel.create({ title: 'T Activa', slug: 't-activa', descriptionHtml: 'x' });
  const disabled = await pagesModel.create({ title: 'T Inactiva', slug: 't-inactiva', descriptionHtml: 'x' });
  await pagesModel.setActive(enabled.id, true);
  try {
    const menu = await pagesModel.findActiveForMenu();
    const ids = menu.map((p) => p.id);
    assert.ok(ids.includes(enabled.id));
    assert.ok(!ids.includes(disabled.id));
  } finally {
    await cleanup([enabled.id, disabled.id]);
  }
});

test('findActiveBySlug: null si no existe O si existe pero está inactiva', async () => {
  const disabled = await pagesModel.create({ title: 'T Oculta', slug: 't-oculta', descriptionHtml: 'x' });
  try {
    assert.equal(await pagesModel.findActiveBySlug('t-oculta'), null);
    assert.equal(await pagesModel.findActiveBySlug('t-no-existe-nunca'), null);

    await pagesModel.setActive(disabled.id, true);
    const found = await pagesModel.findActiveBySlug('t-oculta');
    assert.ok(found);
    assert.equal(found.id, disabled.id);
  } finally {
    await cleanup([disabled.id]);
  }
});

test('findById / update: nunca toca slug, sort_order ni is_active', async () => {
  const p = await pagesModel.create({ title: 'T Original', slug: 't-original', descriptionHtml: 'contenido original' });
  try {
    await pagesModel.update(p.id, { title: 'T Renombrada', descriptionHtml: 'contenido nuevo' });
    const after = await pagesModel.findById(p.id);
    assert.equal(after.title, 'T Renombrada');
    assert.equal(after.description_html, 'contenido nuevo');
    assert.equal(after.slug, 't-original', 'slug congelado');
    assert.equal(after.sort_order, p.sort_order, 'sort_order sin tocar');
    assert.equal(after.is_active, p.is_active, 'is_active sin tocar');
  } finally {
    await cleanup([p.id]);
  }
});

test('setActive: alterna el estado sin tocar otros campos', async () => {
  const p = await pagesModel.create({ title: 'T Toggle', slug: 't-toggle', descriptionHtml: 'x' });
  try {
    await pagesModel.setActive(p.id, true);
    assert.equal((await pagesModel.findById(p.id)).is_active, true);
    await pagesModel.setActive(p.id, false);
    assert.equal((await pagesModel.findById(p.id)).is_active, false);
  } finally {
    await cleanup([p.id]);
  }
});

test('remove: borrado permanente', async () => {
  const p = await pagesModel.create({ title: 'T Borrar', slug: 't-borrar', descriptionHtml: 'x' });
  await pagesModel.remove(p.id);
  assert.equal(await pagesModel.findById(p.id), null);
});

test('reorder / reorderIds: produce una secuencia gapless en el nuevo orden', async () => {
  const a = await pagesModel.create({ title: 'T Reorder A', slug: 't-reorder-a', descriptionHtml: 'x' });
  const b = await pagesModel.create({ title: 'T Reorder B', slug: 't-reorder-b', descriptionHtml: 'x' });
  const c = await pagesModel.create({ title: 'T Reorder C', slug: 't-reorder-c', descriptionHtml: 'x' });
  try {
    const ids = [String(a.id), String(b.id), String(c.id)];
    const reordered = pagesModel.reorderIds(ids, String(b.id), 'up');
    await pagesModel.reorder(reordered);

    const { rows } = await pool.query(
      'SELECT id, sort_order FROM pages WHERE id = ANY($1::bigint[]) ORDER BY sort_order',
      [[a.id, b.id, c.id]]
    );
    assert.deepEqual(rows.map((r) => r.id), [b.id, a.id, c.id]);
    assert.deepEqual(rows.map((r) => r.sort_order), [0, 1, 2], 'orden gapless, sort_order = índice');
  } finally {
    await cleanup([a.id, b.id, c.id]);
  }
});

test('unique slug violation surge como error Postgres 23505', async () => {
  const a = await pagesModel.create({ title: 'T Único A', slug: 't-unico', descriptionHtml: 'x' });
  try {
    await assert.rejects(
      () => pagesModel.create({ title: 'T Único B', slug: 't-unico', descriptionHtml: 'x' }),
      (err) => {
        assert.equal(err.code, '23505');
        return true;
      }
    );
  } finally {
    await cleanup([a.id]);
  }
});
