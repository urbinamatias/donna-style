// CRUD de productos + generación de variantes (Fase 6a, spec admin-products
// / admin-variant-generation). Escrituras multi-tabla (producto +
// categorías + variantes) corren en una sola transacción vía
// `db/pool.js#withTransaction` (design.md "Data Flow").
const express = require('express');
const productsModel = require('../../models/products');
const categoriesModel = require('../../models/categories');
const variantsModel = require('../../models/variants');
const productImagesModel = require('../../models/product-images');
const { uploadImagesForProduct, csrfGuardOrRespond } = require('./product-images');
const { upload, mapMulterError, MAX_FILES } = require('../../middleware/upload');
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
  // `row.size || row.color` descartaba por error las filas "Sin talle" (sin
  // ningún eje) — un producto de un solo SKU, caso real y válido (bug QA:
  // guardar un producto así perdía su única variante). La grilla del
  // cliente nunca manda filas vacías/placeholder, así que basta con
  // confirmar que la fila existe.
  // El SKU nunca llega del cliente (fase 6c, QA: "la dueña no tiene por qué
  // saberlo") — `variantsModel` lo genera solo a partir del id de producto +
  // talle + color.
  return entries
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      size: row.size || null,
      color: row.color || null,
      colorHex: row.color_hex || null,
      stock: row.stock ? Number(row.stock) : 0,
      sizeOrder: row.size_order ? Number(row.size_order) : 0,
      priceOverride: row.price_override ? Number(row.price_override) : null,
    }));
}

// `image_alt[img_<id>]=texto` — el texto alternativo de cada foto se edita
// como parte del form general del producto (QA: un botón "Guardar" por foto
// era ruido, la dueña quiere UN solo botón que guarde todo). Los inputs viven
// fuera de #product-form en el DOM (conviven con subir/reordenar/borrar, que
// siguen siendo acciones de un solo click) pero se asocian a este form vía el
// atributo HTML `form="product-form"` de cada input.
//
// Bug real encontrado en QA de Fase 6c (afectaba a Fase 6b desde su origen):
// con la clave puramente numérica `image_alt[<id>]`, `qs` (usado por
// `express.urlencoded({extended:true})`) interpreta el bracket como índice de
// array, no como clave de objeto, cuando el id es <= su `arrayLimit` (20) —
// y ADEMÁS compacta arrays dispersos, así que `image_alt[7]` se convertía en
// `image_alt: ['texto']` con el id real 7 perdido. Sobrevivía sin síntomas
// mientras los ids de imagen fueran altos (>20), y fallaba en silencio (sin
// guardar nada, sin error) apenas la secuencia de `product_images` volvía a
// empezar de cero (ej. después de `node db/seed.js`, que hace `RESTART
// IDENTITY`). El prefijo `img_` fuerza a `qs` a tratarlo siempre como objeto,
// sin importar el valor del id.
function parseImageAlt(raw) {
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw)
    .map(([key, text]) => {
      const match = /^img_(\d+)$/.exec(key);
      return { imageId: match ? Number(match[1]) : NaN, altText: String(text || '').trim() };
    })
    .filter((row) => Number.isInteger(row.imageId) && row.altText.length > 0);
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
    const outOfStock = req.query.estado === 'sin_stock';
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

    const { rows } = await productsModel.findAllForAdmin({ isActive, categoryIds, outOfStock, page: 1, perPage: 50 });
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

// Crear producto CON fotos en una sola request (QA: la dueña pidió no tener
// que crear y después ir a "Editar" para recién ahí poder subir imágenes —
// "Nuevo" y "Editar" eran dos experiencias distintas). multer parsea el
// multipart ANTES de este handler; como `csrfProtection` global difiere la
// verificación para multipart (D6, Fase 6b), se valida acá con
// `csrfGuardOrRespond`, igual que las rutas de imágenes.
router.post('/admin/productos', upload.array('images', MAX_FILES), mapMulterError, async (req, res, next) => {
  try {
    if (!csrfGuardOrRespond(req, res)) return;

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const basePrice = req.body.base_price ? Number(req.body.base_price) : null;
    const categoryIds = parseCategoryIds(req.body.category_ids);
    const variants = parseVariantsFromBody(req.body.variants);
    const files = req.files || [];

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
    const wantsActive = req.body.is_active === 'on';

    const created = await withTransaction(async (client) => {
      // Arranca inactivo sin importar lo que pida el form (D9): recién se
      // sabe si va a tener imágenes DESPUÉS de procesarlas, más abajo, en la
      // misma transacción.
      const product = await productsModel.create({
        name,
        slug,
        description: req.body.description || null,
        sizeGuide: req.body.size_guide || null,
        basePrice,
        compareAtPrice: req.body.compare_at_price ? Number(req.body.compare_at_price) : null,
        isFeatured: req.body.is_featured === 'on',
        isActive: false,
        freeShipping: req.body.free_shipping === 'on',
      });
      await productsModel.setCategories(product.id, categoryIds, client);
      await variantsModel.replaceForProduct(product.id, variants, client);

      const insertedImages = await uploadImagesForProduct(files, {
        productId: product.id,
        defaultAltText: name,
        requestedAltText: req.body.alt_text,
        client,
      });

      // D9, ahora resuelto en el mismo request: activar solo si de verdad
      // hay al menos una imagen (recién insertada acá arriba).
      if (wantsActive && insertedImages.length > 0) {
        await productsModel.update(product.id, { isActive: true }, client);
      }

      return { ...product, hasImages: insertedImages.length > 0 };
    });

    req.session.adminNotice = created.hasImages
      ? { type: 'success', message: 'Producto creado.' }
      : { type: 'success', message: 'Producto creado en borrador — todavía sin fotos, no aparece en la tienda.' };
    return res.redirect(303, '/admin/productos');
  } catch (err) {
    if (err.code === 'BAD_IMAGE' || err.code === 'TOO_SMALL') {
      const categories = await categoriesModel.findAll();
      return renderForm(res, {
        title: `Nuevo producto — ${config.NOMBRE_TIENDA}`,
        product: req.body,
        categories,
        error: err.message,
        status: 400,
      });
    }
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

      for (const { imageId, altText } of parseImageAlt(req.body.image_alt)) {
        await productImagesModel.updateAltText(imageId, altText, client);
      }
    });

    // A diferencia de crear (arriba), editar un producto YA cargado no tiene
    // un siguiente paso obligatorio — vuelve al listado con la confirmación
    // (QA: antes "Guardar" recargaba la misma página en silencio, sin avisar
    // si el cambio se guardó).
    req.session.adminNotice = { type: 'success', message: 'Producto actualizado.' };
    return res.redirect(303, '/admin/productos');
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
    req.session.adminNotice = { type: 'success', message: 'Producto eliminado.' };
    return res.redirect(303, '/admin/productos');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
