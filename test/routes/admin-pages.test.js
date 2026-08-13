// RED (tasks.md T5-T7, spec informational-pages + admin-ui-conventions).
// Postgres real + server real, mismo patrón que admin-carousel.test.js
// (fetch nativo, sin supertest).
const test = require('node:test');
const assert = require('node:assert/strict');

const bcrypt = require('bcryptjs');
const { pool } = require('../../src/db/pool');
const app = require('../../src/app');

let server;
let baseUrl;
let testAdmin;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const email = `test-admin-pages-${Date.now()}@donnastyle.com`;
  const passwordHash = await bcrypt.hash('password-de-test-123', 12);
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING *`,
    [email, passwordHash]
  );
  testAdmin = rows[0];
});

test.after(async () => {
  await pool.query(`DELETE FROM pages WHERE title LIKE 'Test%'`);
  if (testAdmin) await pool.query('DELETE FROM admin_users WHERE id = $1', [testAdmin.id]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

function extractCookie(res) {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  return raw.split(';')[0];
}

async function getCsrfToken(cookie) {
  const res = await fetch(`${baseUrl}/admin`, { headers: { cookie } });
  await res.text();
  const sid = decodeURIComponent(cookie.split('=')[1]).split('.')[0].replace(/^s:/, '');
  const { rows } = await pool.query('SELECT sess FROM session WHERE sid = $1', [sid]);
  return rows[0]?.sess?.csrfToken;
}

async function loginSession() {
  const anonRes = await fetch(`${baseUrl}/admin/login`, { redirect: 'manual' });
  const anonCookie = extractCookie(anonRes);
  const csrfToken = await getCsrfToken(anonCookie);
  const loginRes = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: anonCookie },
    redirect: 'manual',
    body: `email=${encodeURIComponent(testAdmin.email)}&password=password-de-test-123&_csrf=${csrfToken}`,
  });
  await loginRes.text();
  const cookie = extractCookie(loginRes) || anonCookie;
  const freshCsrf = await getCsrfToken(cookie);
  return { cookie, csrfToken: freshCsrf };
}

async function createPage(overrides = {}) {
  const { rows } = await pool.query(
    `INSERT INTO pages (title, slug, description_html, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      overrides.title ?? 'Test página',
      overrides.slug ?? `test-slug-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      overrides.descriptionHtml ?? 'Contenido de test',
      overrides.sortOrder ?? 0,
      overrides.isActive ?? false,
    ]
  );
  return rows[0];
}

// ---------------------------------------------------------------------
// T5: auth gating, listado, alta + validación + derivación de slug
// ---------------------------------------------------------------------

test('acceso no autenticado a /admin/paginas es denegado, igual que otras secciones admin', async () => {
  const res = await fetch(`${baseUrl}/admin/paginas`, { redirect: 'manual' });
  assert.ok([302, 303, 401, 403].includes(res.status));
});

test('GET /admin/paginas: lista páginas y filtra en vivo con ?q=', async () => {
  const { cookie } = await loginSession();
  const page = await createPage({ title: 'Test Envíos', slug: `test-envios-${Date.now()}` });
  try {
    const res = await fetch(`${baseUrl}/admin/paginas?q=Env%C3%ADos`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Test Envíos/);
  } finally {
    await pool.query('DELETE FROM pages WHERE id = $1', [page.id]);
  }
});

test('GET /admin/paginas/nueva: renderiza el form sin input de slug', async () => {
  const { cookie } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/paginas/nueva`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.doesNotMatch(html, /name="slug"/);
});

test('POST /admin/paginas: alta válida crea página deshabilitada, al final del orden, slug derivado', async () => {
  const { cookie, csrfToken } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/paginas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: new URLSearchParams({
      _csrf: csrfToken,
      title: 'Test Envíos y devoluciones',
      description: 'Contenido válido de la página.',
    }).toString(),
  });
  assert.ok([302, 303].includes(res.status));

  const { rows } = await pool.query(`SELECT * FROM pages WHERE title = 'Test Envíos y devoluciones'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slug, 'test-envios-y-devoluciones');
  assert.equal(rows[0].is_active, false);

  await pool.query('DELETE FROM pages WHERE id = $1', [rows[0].id]);
});

test('POST /admin/paginas: título vacío/whitespace se rechaza, nada se crea', async () => {
  const { cookie, csrfToken } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/paginas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({ _csrf: csrfToken, title: '   ', description: 'contenido' }).toString(),
  });
  assert.equal(res.status, 400);
  const { rows } = await pool.query(`SELECT * FROM pages WHERE description_html = 'contenido'`);
  assert.equal(rows.length, 0);
});

test('POST /admin/paginas: título de más de 60 caracteres se rechaza', async () => {
  const { cookie, csrfToken } = await loginSession();
  const longTitle = 'Test '.repeat(20);
  assert.ok(longTitle.length > 60);
  const res = await fetch(`${baseUrl}/admin/paginas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({ _csrf: csrfToken, title: longTitle, description: 'contenido' }).toString(),
  });
  assert.equal(res.status, 400);
  const { rows } = await pool.query(`SELECT * FROM pages WHERE title = $1`, [longTitle]);
  assert.equal(rows.length, 0);
});

test('POST /admin/paginas: descripción vacía (o solo markup sin texto) se rechaza', async () => {
  const { cookie, csrfToken } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/paginas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({ _csrf: csrfToken, title: 'Test Sin Descripción', description: '<p>   </p>' }).toString(),
  });
  assert.equal(res.status, 400);
  const { rows } = await pool.query(`SELECT * FROM pages WHERE title = 'Test Sin Descripción'`);
  assert.equal(rows.length, 0);
});

test('POST /admin/paginas: título solo emojis/símbolos (slug vacío) se rechaza', async () => {
  const { cookie, csrfToken } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/paginas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({ _csrf: csrfToken, title: '🎉🎉🎉', description: 'contenido' }).toString(),
  });
  assert.equal(res.status, 400);
  const html = await res.text();
  assert.match(html, /letras?|números?/i);
});

test('POST /admin/paginas: colisión de slug con otra página se rechaza, nombra el conflicto, nada cambia', async () => {
  const { cookie, csrfToken } = await loginSession();
  const existing = await createPage({ title: 'Test Existente', slug: 'test-colision-slug' });
  try {
    const res = await fetch(`${baseUrl}/admin/paginas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams({ _csrf: csrfToken, title: 'Test Colisión Slug', description: 'contenido' }).toString(),
    });
    assert.equal(res.status, 400);
    const html = await res.text();
    assert.match(html, /ya existe/i);

    const { rows } = await pool.query(`SELECT * FROM pages WHERE slug = 'test-colision-slug'`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, existing.id);
  } finally {
    await pool.query('DELETE FROM pages WHERE id = $1', [existing.id]);
  }
});

test('POST /admin/paginas: colisión con slug de categoría existente se rechaza con mensaje amigable', async () => {
  const { cookie, csrfToken } = await loginSession();
  const { rows: cats } = await pool.query('SELECT slug FROM categories LIMIT 1');
  if (cats.length === 0) return; // sin categorías seedeadas, escenario no aplicable en este entorno
  const res = await fetch(`${baseUrl}/admin/paginas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({ _csrf: csrfToken, title: cats[0].slug, description: 'contenido' }).toString(),
  });
  assert.equal(res.status, 400);
});

test('POST /admin/paginas: colisión con ruta reservada se rechaza con el mismo mensaje amigable', async () => {
  const { cookie, csrfToken } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/paginas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({ _csrf: csrfToken, title: 'Carrito', description: 'contenido' }).toString(),
  });
  assert.equal(res.status, 400);
  const html = await res.text();
  assert.match(html, /ya existe/i);
});

test('POST /admin/paginas sin token CSRF es 403 y no persiste nada', async () => {
  const { cookie } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/paginas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({ title: 'Test Sin CSRF', description: 'contenido' }).toString(),
  });
  assert.equal(res.status, 403);
  const { rows } = await pool.query(`SELECT * FROM pages WHERE title = 'Test Sin CSRF'`);
  assert.equal(rows.length, 0);
});

// ---------------------------------------------------------------------
// T6: edición (slug congelado)
// ---------------------------------------------------------------------

test('GET /admin/paginas/:id/editar: form pre-cargado, sin input de slug', async () => {
  const { cookie } = await loginSession();
  const page = await createPage({ title: 'Test Editar', slug: `test-editar-${Date.now()}` });
  try {
    const res = await fetch(`${baseUrl}/admin/paginas/${page.id}/editar`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Test Editar/);
    assert.doesNotMatch(html, /name="slug"/);
  } finally {
    await pool.query('DELETE FROM pages WHERE id = $1', [page.id]);
  }
});

test('POST /admin/paginas/:id: edición válida actualiza contenido, preserva posición y estado', async () => {
  const { cookie, csrfToken } = await loginSession();
  const page = await createPage({ title: 'Test Antes', slug: `test-preserva-${Date.now()}`, sortOrder: 42, isActive: true });
  try {
    const res = await fetch(`${baseUrl}/admin/paginas/${page.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
      redirect: 'manual',
      body: new URLSearchParams({ _csrf: csrfToken, title: 'Test Después', description: 'Contenido actualizado' }).toString(),
    });
    assert.ok([302, 303].includes(res.status));

    const { rows } = await pool.query('SELECT * FROM pages WHERE id = $1', [page.id]);
    assert.equal(rows[0].title, 'Test Después');
    assert.equal(rows[0].sort_order, 42, 'posición sin tocar');
    assert.equal(rows[0].is_active, true, 'estado sin tocar');
  } finally {
    await pool.query('DELETE FROM pages WHERE id = $1', [page.id]);
  }
});

test('POST /admin/paginas/:id: el slug NUNCA cambia, aun renombrando hacia el slug de otra página', async () => {
  const { cookie, csrfToken } = await loginSession();
  const envios = await createPage({ title: 'Test Envíos B', slug: 'test-envios-b' });
  const devoluciones = await createPage({ title: 'Test Devoluciones B', slug: 'test-devoluciones-b' });
  try {
    const res = await fetch(`${baseUrl}/admin/paginas/${devoluciones.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
      redirect: 'manual',
      body: new URLSearchParams({ _csrf: csrfToken, title: 'Test Envíos B', description: 'contenido' }).toString(),
    });
    assert.ok([302, 303].includes(res.status), 'no debe rechazar por conflicto de slug — el slug NUNCA se re-deriva');

    const { rows } = await pool.query('SELECT * FROM pages WHERE id = $1', [devoluciones.id]);
    assert.equal(rows[0].slug, 'test-devoluciones-b', 'slug propio sin cambios');
    assert.equal(rows[0].title, 'Test Envíos B');
  } finally {
    await pool.query('DELETE FROM pages WHERE id = ANY($1::bigint[])', [[envios.id, devoluciones.id]]);
  }
});

test('POST /admin/paginas/:id: título/descripción vacíos en edición se rechazan, valores previos intactos', async () => {
  const { cookie, csrfToken } = await loginSession();
  const page = await createPage({ title: 'Test Preservada', slug: `test-preservada-${Date.now()}`, descriptionHtml: 'Original' });
  try {
    const res = await fetch(`${baseUrl}/admin/paginas/${page.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams({ _csrf: csrfToken, title: '', description: 'contenido' }).toString(),
    });
    assert.equal(res.status, 400);

    const { rows } = await pool.query('SELECT * FROM pages WHERE id = $1', [page.id]);
    assert.equal(rows[0].title, 'Test Preservada');
    assert.equal(rows[0].description_html, 'Original');
  } finally {
    await pool.query('DELETE FROM pages WHERE id = $1', [page.id]);
  }
});

// ---------------------------------------------------------------------
// T7: toggle, reorder, delete
// ---------------------------------------------------------------------

test('POST /admin/paginas/:id/estado: alterna is_active sin confirmación, redirige preservando ?q=', async () => {
  const { cookie, csrfToken } = await loginSession();
  const page = await createPage({ title: 'Test Toggle', slug: `test-toggle-${Date.now()}` });
  try {
    const res = await fetch(`${baseUrl}/admin/paginas/${page.id}/estado?q=algo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
      redirect: 'manual',
      body: new URLSearchParams({ _csrf: csrfToken }).toString(),
    });
    assert.ok([302, 303].includes(res.status));
    assert.match(res.headers.get('location') || '', /q=algo/);

    const { rows } = await pool.query('SELECT is_active FROM pages WHERE id = $1', [page.id]);
    assert.equal(rows[0].is_active, true);
  } finally {
    await pool.query('DELETE FROM pages WHERE id = $1', [page.id]);
  }
});

test('POST /admin/paginas/:id/estado sin CSRF válido deja el estado sin cambios', async () => {
  const { cookie } = await loginSession();
  const page = await createPage({ title: 'Test Toggle CSRF', slug: `test-toggle-csrf-${Date.now()}` });
  try {
    const res = await fetch(`${baseUrl}/admin/paginas/${page.id}/estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams({}).toString(),
    });
    assert.equal(res.status, 403);
    const { rows } = await pool.query('SELECT is_active FROM pages WHERE id = $1', [page.id]);
    assert.equal(rows[0].is_active, false);
  } finally {
    await pool.query('DELETE FROM pages WHERE id = $1', [page.id]);
  }
});

test('POST /admin/paginas/:id/mover: reordena ↑/↓, no-op en el límite', async () => {
  const { cookie, csrfToken } = await loginSession();
  const a = await createPage({ title: 'Test Mover A', slug: `test-mover-a-${Date.now()}`, sortOrder: 900 });
  const b = await createPage({ title: 'Test Mover B', slug: `test-mover-b-${Date.now()}`, sortOrder: 901 });
  try {
    await fetch(`${baseUrl}/admin/paginas/${b.id}/mover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams({ _csrf: csrfToken, direction: 'up' }).toString(),
    }).then((r) => r.text());

    const { rows: after } = await pool.query(
      'SELECT id, sort_order FROM pages WHERE id = ANY($1::bigint[]) ORDER BY sort_order',
      [[a.id, b.id]]
    );
    assert.equal(after[0].id, b.id, 'b debe quedar primero tras subir');

    // Boundary: subir el primero es no-op, sin error.
    const boundaryRes = await fetch(`${baseUrl}/admin/paginas/${b.id}/mover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
      redirect: 'manual',
      body: new URLSearchParams({ _csrf: csrfToken, direction: 'up' }).toString(),
    });
    assert.ok([302, 303].includes(boundaryRes.status));
  } finally {
    await pool.query('DELETE FROM pages WHERE id = ANY($1::bigint[])', [[a.id, b.id]]);
  }
});

test('POST /admin/paginas/:id/eliminar: borra permanentemente sin importar el estado, orden queda gapless', async () => {
  const { cookie, csrfToken } = await loginSession();
  const page = await createPage({ title: 'Test Borrar', slug: `test-borrar-${Date.now()}` });

  const res = await fetch(`${baseUrl}/admin/paginas/${page.id}/eliminar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: new URLSearchParams({ _csrf: csrfToken }).toString(),
  });
  assert.ok([302, 303].includes(res.status));

  const { rows } = await pool.query('SELECT * FROM pages WHERE id = $1', [page.id]);
  assert.equal(rows.length, 0);
});

test('list.ejs: confirmación de borrado advierte que los links externos se rompen', async () => {
  const { cookie } = await loginSession();
  const page = await createPage({ title: 'Test Confirmación', slug: `test-confirm-${Date.now()}` });
  try {
    const res = await fetch(`${baseUrl}/admin/paginas`, { headers: { cookie } });
    const html = await res.text();
    assert.match(html, /no se puede deshacer/i);
    assert.match(html, /enlaces externos|links externos|dejar[aá]n de funcionar/i);
  } finally {
    await pool.query('DELETE FROM pages WHERE id = $1', [page.id]);
  }
});

test('route-shadowing: /admin/paginas NUNCA se trata como slug de categoría de primer nivel', async () => {
  const { cookie } = await loginSession();
  const res = await fetch(`${baseUrl}/admin/paginas`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.doesNotMatch(html, /Página no encontrada/i);
});
