// CRUD de productos + generación de variantes (Fase 6a, spec admin-products
// / admin-variant-generation). Escrituras multi-tabla (producto +
// categorías + variantes) corren en una sola transacción vía
// `db/pool.js#withTransaction` (design.md "Data Flow").
const express = require('express');
const productsModel = require('../../models/products');
const categoriesModel = require('../../models/categories');
const variantsModel = require('../../models/variants');
const { withTransaction } = require('../../db/pool');
const config = require('../../config/env');

const router = express.Router();

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// El body llega como `variants[0][size]`, `variants[0][stock]`, ... (qs de
// express.urlencoded lo arma como objeto indexado por posición, no array
// real) — se normaliza acá a un array plano de filas.
function parseVariantsFromBody(raw) {
  if (!raw) return [];
  const entries = Array.isArray(raw) ? raw : Object.values(raw);
  return entries
    .filter((row) => row && (row.size || row.color))
    .map((row) => ({
      size: row.size || null,
      color: row.color || null,
      colorHex: row.color_hex || null,
      sku: row.sku || null,
      stock: row.stock ? Number(row.stock) : 0,
      sizeOrder: row.size_order ? Number(row.size_order) : 0,
      priceOverride: row.price_override ? Number(row.price_override) : null,
    }));
}

function parseCategoryIds(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((id) => Number(id)).filter((id) => Number.isInteger(id));
}

async function renderForm(res, { title, product = null, categories, error = null, status = 200 }) {
  res.status(status).render('admin/layouts/admin', {
    view: '../products/form',
    title,
    product,
    categories,
    error,
  });
}

router.get('/admin/productos', async (req, res, next) => {
  try {
    const isActive = req.query.estado === 'activos' ? true : req.query.estado === 'inactivos' ? false : null;
    const categoryId = req.query.categoria_id ? Number(req.query.categoria_id) : null;

    // Rollup igual que public.js (§0.1 regla 2): filtrar por una categoría
    // padre debe traer también los productos de sus hijas, no solo los
    // asignados exactamente a ese id — mismo criterio que "Ver todo en
    // Abrigos" en la vista de clienta.
    let categoryIds = null;
    if (categoryId) {
      const childIds = await categoriesModel.findDescendantIds(categoryId);
      categoryIds = childIds.length > 0 ? [categoryId, ...childIds] : [categoryId];
    }

    const { rows } = await productsModel.findAllForAdmin({ isActive, categoryIds, page: 1, perPage: 50 });
    const categories = await categoriesModel.findAll();

    res.render('admin/layouts/admin', {
      view: '../products/list',
      title: `Productos — ${config.NOMBRE_TIENDA}`,
      products: rows,
      categories,
      filters: { estado: req.query.estado || '', categoria_id: req.query.categoria_id || '' },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/productos/nuevo', async (req, res, next) => {
  try {
    const categories = await categoriesModel.findAll();
    await renderForm(res, { title: `Nuevo producto — ${config.NOMBRE_TIENDA}`, categories });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/productos', async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const basePrice = req.body.base_price ? Number(req.body.base_price) : null;
    const categoryIds = parseCategoryIds(req.body.category_ids);
    const variants = parseVariantsFromBody(req.body.variants);

    // Requisitos obligatorios de §3.3 (menos "al menos una imagen": 6a no
    // tiene upload todavía, se cubre forzando is_active=false — D9).
    if (!name || !basePrice || categoryIds.length === 0 || variants.length === 0) {
      const categories = await categoriesModel.findAll();
      return renderForm(res, {
        title: `Nuevo producto — ${config.NOMBRE_TIENDA}`,
        product: req.body,
        categories,
        error: 'Faltan campos obligatorios: nombre, precio base, al menos una categoría y al menos una variante.',
        status: 400,
      });
    }

    const slug = req.body.slug ? slugify(req.body.slug) : slugify(name);

    const created = await withTransaction(async (client) => {
      const product = await productsModel.create({
        name,
        slug,
        description: req.body.description || null,
        sizeGuide: req.body.size_guide || null,
        basePrice,
        compareAtPrice: req.body.compare_at_price ? Number(req.body.compare_at_price) : null,
        isFeatured: req.body.is_featured === 'on',
        // D9: un producto nuevo nunca tiene imágenes todavía (6b) — siempre
        // arranca inactivo, sin importar lo que venga en el form.
        isActive: false,
        freeShipping: req.body.free_shipping === 'on',
      });
      await productsModel.setCategories(product.id, categoryIds, client);
      await variantsModel.replaceForProduct(product.id, variants, client);
      return product;
    });

    return res.redirect(303, `/admin/productos/${created.id}/editar`);
  } catch (err) {
    if (err.code === '23505') {
      const categories = await categoriesModel.findAll();
      return renderForm(res, {
        title: `Nuevo producto — ${config.NOMBRE_TIENDA}`,
        product: req.body,
        categories,
        error: 'Ya existe un producto con ese slug o SKU.',
        status: 400,
      });
    }
    return next(err);
  }
});

router.get('/admin/productos/:id/editar', async (req, res, next) => {
  try {
    const product = await productsModel.findByIdWithDetails(req.params.id);
    if (!product) return res.status(404).send('Producto no encontrado.');
    const categories = await categoriesModel.findAll();
    await renderForm(res, { title: `Editar ${product.name} — ${config.NOMBRE_TIENDA}`, product, categories });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/productos/:id', async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const basePrice = req.body.base_price ? Number(req.body.base_price) : null;
    const categoryIds = parseCategoryIds(req.body.category_ids);
    const variants = parseVariantsFromBody(req.body.variants);

    if (!name || !basePrice || categoryIds.length === 0 || variants.length === 0) {
      const product = await productsModel.findByIdWithDetails(req.params.id);
      const categories = await categoriesModel.findAll();
      return renderForm(res, {
        title: `Editar producto — ${config.NOMBRE_TIENDA}`,
        product: { ...product, ...req.body },
        categories,
        error: 'Faltan campos obligatorios: nombre, precio base, al menos una categoría y al menos una variante.',
        status: 400,
      });
    }

    await withTransaction(async (client) => {
      await productsModel.update(
        req.params.id,
        {
          name,
          // slug NUNCA se re-deriva del nombre acá (decisión confirmada esta
          // sesión) — solo cambia si vino explícito y distinto.
          slug: req.body.slug ? slugify(req.body.slug) : undefined,
          description: req.body.description || null,
          sizeGuide: req.body.size_guide || null,
          basePrice,
          compareAtPrice: req.body.compare_at_price ? Number(req.body.compare_at_price) : null,
          isFeatured: req.body.is_featured === 'on',
          isActive: req.body.is_active === 'on',
          freeShipping: req.body.free_shipping === 'on',
        },
        client
      );
      await productsModel.setCategories(req.params.id, categoryIds, client);
      await variantsModel.replaceForProduct(req.params.id, variants, client);
    });

    return res.redirect(303, `/admin/productos/${req.params.id}/editar`);
  } catch (err) {
    if (err.code === 'NO_IMAGES' || err.code === '23505') {
      const product = await productsModel.findByIdWithDetails(req.params.id);
      const categories = await categoriesModel.findAll();
      return renderForm(res, {
        title: `Editar producto — ${config.NOMBRE_TIENDA}`,
        product: { ...product, ...req.body },
        categories,
        error:
          err.code === 'NO_IMAGES'
            ? err.message
            : 'Ya existe un producto con ese slug o SKU.',
        status: 400,
      });
    }
    return next(err);
  }
});

router.post('/admin/productos/:id/eliminar', async (req, res, next) => {
  try {
    const hasOrders = await productsModel.hasOrders(req.params.id);
    if (hasOrders) {
      const product = await productsModel.findByIdWithDetails(req.params.id);
      const categories = await categoriesModel.findAll();
      return renderForm(res, {
        title: `Editar ${product.name} — ${config.NOMBRE_TIENDA}`,
        product,
        categories,
        error:
          'No se puede borrar: este producto aparece en pedidos anteriores. Desactivalo en su lugar para ocultarlo de la tienda sin perder el historial.',
        status: 400,
      });
    }

    await productsModel.remove(req.params.id);
    return res.redirect(303, '/admin/productos');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
