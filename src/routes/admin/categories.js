// CRUD de categorías del panel (Fase 6a, spec admin-categories). El límite
// de 2 niveles nunca se revalida en JS — se deja subir el error del trigger
// `enforce_category_depth` (002) y se mapea acá a un mensaje legible
// (design.md D8, "no duplicar en JS lo que ya garantiza la DB").
const express = require('express');
const categoriesModel = require('../../models/categories');
const config = require('../../config/env');

const router = express.Router();

const DEPTH_ERROR_MESSAGE = 'Esta categoría no puede tener más de 2 niveles de profundidad.';

function isDepthTriggerError(err) {
  return typeof err.message === 'string' && err.message.includes('max 2 levels');
}

function isUniqueSlugError(err) {
  return err.code === '23505' && typeof err.constraint === 'string' && err.constraint.includes('slug');
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function loadTreeForForm() {
  const all = await categoriesModel.findAll();
  return all;
}

router.get('/admin/categorias', async (req, res, next) => {
  try {
    const categories = await categoriesModel.findAll();
    res.render('admin/layouts/admin', {
      view: '../categories/list',
      title: `Categorías — ${config.NOMBRE_TIENDA}`,
      categories,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/categorias/nueva', async (req, res, next) => {
  try {
    const parents = await loadTreeForForm();
    res.render('admin/layouts/admin', {
      view: '../categories/form',
      title: `Nueva categoría — ${config.NOMBRE_TIENDA}`,
      category: null,
      parents,
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/categorias', async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const slug = req.body.slug ? slugify(req.body.slug) : slugify(name);
    const parentId = req.body.parent_id ? Number(req.body.parent_id) : null;
    const sortOrder = req.body.sort_order ? Number(req.body.sort_order) : 0;

    if (!name || !slug) {
      const parents = await loadTreeForForm();
      return res.status(400).render('admin/layouts/admin', {
        view: '../categories/form',
        title: `Nueva categoría — ${config.NOMBRE_TIENDA}`,
        category: req.body,
        parents,
        error: 'Nombre y slug son obligatorios.',
      });
    }

    await categoriesModel.create({ name, slug, parentId, sortOrder });
    return res.redirect(303, '/admin/categorias');
  } catch (err) {
    if (isDepthTriggerError(err) || isUniqueSlugError(err)) {
      const parents = await loadTreeForForm();
      return res.status(400).render('admin/layouts/admin', {
        view: '../categories/form',
        title: `Nueva categoría — ${config.NOMBRE_TIENDA}`,
        category: req.body,
        parents,
        error: isDepthTriggerError(err) ? DEPTH_ERROR_MESSAGE : 'Ya existe una categoría con ese slug.',
      });
    }
    return next(err);
  }
});

router.get('/admin/categorias/:id/editar', async (req, res, next) => {
  try {
    const category = await categoriesModel.findById(req.params.id);
    if (!category) return res.status(404).send('Categoría no encontrada.');
    const parents = (await loadTreeForForm()).filter((c) => Number(c.id) !== Number(category.id));
    res.render('admin/layouts/admin', {
      view: '../categories/form',
      title: `Editar categoría — ${config.NOMBRE_TIENDA}`,
      category,
      parents,
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/categorias/:id', async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const slug = typeof req.body.slug === 'string' && req.body.slug.trim() ? slugify(req.body.slug) : undefined;
    const parentId = req.body.parent_id ? Number(req.body.parent_id) : null;
    const sortOrder = req.body.sort_order ? Number(req.body.sort_order) : undefined;

    await categoriesModel.update(req.params.id, {
      name: name || undefined,
      slug,
      parentId,
      sortOrder,
    });
    return res.redirect(303, '/admin/categorias');
  } catch (err) {
    if (isDepthTriggerError(err) || isUniqueSlugError(err)) {
      const category = await categoriesModel.findById(req.params.id);
      const parents = (await loadTreeForForm()).filter((c) => Number(c.id) !== Number(req.params.id));
      return res.status(400).render('admin/layouts/admin', {
        view: '../categories/form',
        title: `Editar categoría — ${config.NOMBRE_TIENDA}`,
        category: { ...category, ...req.body },
        parents,
        error: isDepthTriggerError(err) ? DEPTH_ERROR_MESSAGE : 'Ya existe una categoría con ese slug.',
      });
    }
    return next(err);
  }
});

router.post('/admin/categorias/:id/eliminar', async (req, res, next) => {
  try {
    const hasProducts = await categoriesModel.hasProducts(req.params.id);
    if (hasProducts) {
      const categories = await categoriesModel.findAll();
      return res.status(400).render('admin/layouts/admin', {
        view: '../categories/list',
        title: `Categorías — ${config.NOMBRE_TIENDA}`,
        categories,
        error: 'No se puede borrar: tiene productos asignados. Reasigná esos productos a otra categoría primero.',
      });
    }

    await categoriesModel.remove(req.params.id);
    return res.redirect(303, '/admin/categorias');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
