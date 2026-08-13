// CRUD de páginas informativas del panel (spec informational-pages,
// design.md D1-D8). Mismo criterio "un router por recurso" que
// carousel.js/categories.js. El slug SIEMPRE se deriva en el alta y queda
// congelado para siempre (nunca se re-deriva en `update`, mismo criterio que
// categories.js:120-126) — ninguna de las dos vistas ofrece un input de
// slug.
const express = require('express');
const pagesModel = require('../../models/pages');
const categoriesModel = require('../../models/categories');
const { sanitizeInline } = require('../../services/rich-text');
const { isReserved } = require('../../services/reserved-slugs');
const config = require('../../config/env');

const router = express.Router();

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 5000;
const CONFLICT_MESSAGE = 'Ya existe una página o sección con ese nombre. Probá con otro título.';
const NO_LETTERS_MESSAGE = 'El título debe contener al menos una letra o un número.';

function isUniqueSlugError(err) {
  return err.code === '23505' && typeof err.constraint === 'string' && err.constraint.includes('slug');
}

// Mismo criterio que categories.js#slugify (lowercase, fold de acentos,
// no-alfanumérico -> guion) — deliberadamente duplicado en vez de
// importado: categories.js no expone `slugify` en su module.exports y
// crear un acoplamiento nuevo solo por esta función de 6 líneas no vale la
// pena (mismo espíritu que products.js/categories.js, cada uno con su
// propia copia mínima).
function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function slugConflicts(slug) {
  const category = await categoriesModel.findBySlug(slug);
  return Boolean(category) || isReserved(slug);
}

// Re-render tras un error de validación (spec "nothing created/modified"):
// `form.ejs` lee `page.description_html` (mismo campo que la fila de DB),
// pero el body del POST manda `description` (nombre del <textarea>) — este
// helper normaliza el shape para que el título y la descripción tipeados
// por la dueña NUNCA se pierdan al re-mostrar el form con el error.
function bodyAsPage(body) {
  return { title: body.title, description_html: body.description };
}

router.get('/admin/paginas', async (req, res, next) => {
  try {
    const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const pages = await pagesModel.findAllForAdmin({ term });
    res.render('admin/layouts/admin', {
      view: '../pages/list',
      title: `Páginas — ${config.NOMBRE_TIENDA}`,
      pages,
      filters: { q: term },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/paginas/nueva', (req, res) => {
  res.render('admin/layouts/admin', {
    view: '../pages/form',
    title: `Nueva página — ${config.NOMBRE_TIENDA}`,
    page: null,
    error: null,
    bodyScripts: ['/js/rich-text-editor.js'],
  });
});

router.post('/admin/paginas', async (req, res, next) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const descriptionHtml = sanitizeInline(typeof req.body.description === 'string' ? req.body.description : '');

    if (!title || title.length > TITLE_MAX) {
      return res.status(400).render('admin/layouts/admin', {
        view: '../pages/form',
        title: `Nueva página — ${config.NOMBRE_TIENDA}`,
        page: bodyAsPage(req.body),
        bodyScripts: ['/js/rich-text-editor.js'],
        error: !title ? 'El título es obligatorio.' : `El título no puede superar los ${TITLE_MAX} caracteres.`,
      });
    }

    if (!descriptionHtml) {
      return res.status(400).render('admin/layouts/admin', {
        view: '../pages/form',
        title: `Nueva página — ${config.NOMBRE_TIENDA}`,
        page: bodyAsPage(req.body),
        bodyScripts: ['/js/rich-text-editor.js'],
        error: 'La descripción es obligatoria.',
      });
    }

    if (typeof req.body.description === 'string' && req.body.description.length > DESCRIPTION_MAX) {
      return res.status(400).render('admin/layouts/admin', {
        view: '../pages/form',
        title: `Nueva página — ${config.NOMBRE_TIENDA}`,
        page: bodyAsPage(req.body),
        bodyScripts: ['/js/rich-text-editor.js'],
        error: `La descripción no puede superar los ${DESCRIPTION_MAX} caracteres.`,
      });
    }

    const slug = slugify(title);
    if (!slug) {
      return res.status(400).render('admin/layouts/admin', {
        view: '../pages/form',
        title: `Nueva página — ${config.NOMBRE_TIENDA}`,
        page: bodyAsPage(req.body),
        bodyScripts: ['/js/rich-text-editor.js'],
        error: NO_LETTERS_MESSAGE,
      });
    }

    if (await slugConflicts(slug)) {
      return res.status(400).render('admin/layouts/admin', {
        view: '../pages/form',
        title: `Nueva página — ${config.NOMBRE_TIENDA}`,
        page: bodyAsPage(req.body),
        bodyScripts: ['/js/rich-text-editor.js'],
        error: CONFLICT_MESSAGE,
      });
    }

    const sortOrder = await pagesModel.nextSortOrder();
    await pagesModel.create({ title, slug, descriptionHtml, sortOrder });

    req.session.adminNotice = { type: 'success', message: 'Página creada.' };
    return res.redirect(303, '/admin/paginas');
  } catch (err) {
    if (isUniqueSlugError(err)) {
      return res.status(400).render('admin/layouts/admin', {
        view: '../pages/form',
        title: `Nueva página — ${config.NOMBRE_TIENDA}`,
        page: bodyAsPage(req.body),
        bodyScripts: ['/js/rich-text-editor.js'],
        error: CONFLICT_MESSAGE,
      });
    }
    return next(err);
  }
});

router.get('/admin/paginas/:id/editar', async (req, res, next) => {
  try {
    const page = await pagesModel.findById(req.params.id);
    if (!page) return res.status(404).send('Página no encontrada.');
    res.render('admin/layouts/admin', {
      view: '../pages/form',
      title: `Editar página — ${config.NOMBRE_TIENDA}`,
      page,
      error: null,
      bodyScripts: ['/js/rich-text-editor.js'],
    });
  } catch (err) {
    next(err);
  }
});

// El slug NUNCA se toca acá (spec "Slug is frozen after creation") —
// `pagesModel.update` ni siquiera acepta ese campo.
router.post('/admin/paginas/:id', async (req, res, next) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const descriptionHtml = sanitizeInline(typeof req.body.description === 'string' ? req.body.description : '');

    if (!title || title.length > TITLE_MAX || !descriptionHtml) {
      const page = await pagesModel.findById(req.params.id);
      if (!page) return res.status(404).send('Página no encontrada.');
      let error = 'El título es obligatorio.';
      if (title.length > TITLE_MAX) error = `El título no puede superar los ${TITLE_MAX} caracteres.`;
      else if (title && !descriptionHtml) error = 'La descripción es obligatoria.';
      return res.status(400).render('admin/layouts/admin', {
        view: '../pages/form',
        title: `Editar página — ${config.NOMBRE_TIENDA}`,
        page,
        error,
        bodyScripts: ['/js/rich-text-editor.js'],
      });
    }

    if (typeof req.body.description === 'string' && req.body.description.length > DESCRIPTION_MAX) {
      const page = await pagesModel.findById(req.params.id);
      if (!page) return res.status(404).send('Página no encontrada.');
      return res.status(400).render('admin/layouts/admin', {
        view: '../pages/form',
        title: `Editar página — ${config.NOMBRE_TIENDA}`,
        page,
        error: `La descripción no puede superar los ${DESCRIPTION_MAX} caracteres.`,
        bodyScripts: ['/js/rich-text-editor.js'],
      });
    }

    await pagesModel.update(req.params.id, { title, descriptionHtml });
    req.session.adminNotice = { type: 'success', message: 'Página actualizada.' };
    return res.redirect(303, '/admin/paginas');
  } catch (err) {
    next(err);
  }
});

// Toggle en la fila de la lista (spec "One-click enable/disable toggle in
// the list row", design.md D4): plain POST + 303, sin confirmación, sin
// JSON — funciona sin JS, mismo patrón de hidden `_csrf` que el resto del
// panel. `?q=` se preserva vía la query del propio action del form.
router.post('/admin/paginas/:id/estado', async (req, res, next) => {
  try {
    const page = await pagesModel.findById(req.params.id);
    if (!page) return res.status(404).send('Página no encontrada.');

    await pagesModel.setActive(page.id, !page.is_active);

    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const redirectTo = q ? `/admin/paginas?q=${encodeURIComponent(q)}` : '/admin/paginas';
    return res.redirect(303, redirectTo);
  } catch (err) {
    next(err);
  }
});

// Reorder ↑/↓ (spec "Manual reordering with ↑/↓ only", mismo patrón que
// carousel.js#mover) — nunca drag-and-drop.
router.post('/admin/paginas/:id/mover', async (req, res, next) => {
  try {
    const direction = req.body.direction === 'down' ? 'down' : 'up';
    const pages = await pagesModel.findAllForAdmin({});
    const ids = pages
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => String(p.id));

    const reordered = pagesModel.reorderIds(ids, String(req.params.id), direction);
    await pagesModel.reorder(reordered);

    return res.redirect(303, '/admin/paginas');
  } catch (err) {
    next(err);
  }
});

// Borrado permanente, sin condición ni chequeo de dependencias (spec
// "Permanent deletion") — la confirmación con la advertencia de links rotos
// vive en list.ejs (`onsubmit="return confirm(...)"`, mismo patrón que
// carousel.js#eliminar).
router.post('/admin/paginas/:id/eliminar', async (req, res, next) => {
  try {
    await pagesModel.remove(req.params.id);
    req.session.adminNotice = { type: 'success', message: 'Página eliminada.' };
    return res.redirect(303, '/admin/paginas');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
