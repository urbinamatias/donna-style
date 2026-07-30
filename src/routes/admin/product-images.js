// Gestión de imágenes de producto (Fase 6b, design.md D5): router separado
// de `admin/products.js` a propósito — mantiene `multer` fuera del router
// urlencoded existente (mismo criterio "un router por recurso" de 6a).
// Todas las rutas mutantes son multipart O urlencoded pero llaman
// `verifyToken(req)` explícitamente (D6): las multipart lo NECESITAN
// (`csrfProtection` global difiere la verificación para ellas — el body
// recién existe acá, después de multer); las urlencoded ya están cubiertas
// por el middleware global, pero se valida igual acá para que este router
// nunca dependa silenciosamente de su orden de montaje en app.js.
const express = require('express');
const productImagesModel = require('../../models/product-images');
const productsModel = require('../../models/products');
const categoriesModel = require('../../models/categories');
const images = require('../../services/images');
const { upload, mapMulterError, MAX_FILES } = require('../../middleware/upload');
const { verifyToken } = require('../../middleware/csrf');
const config = require('../../config/env');

const router = express.Router();

async function renderEditWithError(res, productId, error, status = 400) {
  const product = await productsModel.findByIdWithDetails(productId);
  const categories = await categoriesModel.findAll();
  return res.status(status).render('admin/layouts/admin', {
    view: '../products/form',
    title: `Editar ${product ? product.name : 'producto'} — ${config.NOMBRE_TIENDA}`,
    product,
    categories,
    error,
  });
}

function csrfGuardOrRespond(req, res) {
  if (verifyToken(req)) return true;
  res.status(403).json({ error: 'csrf_invalid' });
  return false;
}

// Procesa y persiste N archivos subidos para un producto — extraído para
// reusar EXACTAMENTE la misma lógica desde dos lugares (QA: la dueña pidió
// poder cargar fotos al CREAR el producto, no solo al editarlo después):
// esta ruta (agregar fotos a un producto ya existente) y
// admin/products.js (crear producto + fotos en una sola transacción).
// `client` participa de la transacción del caller cuando se pasa uno —
// nunca hace su propio commit/rollback acá.
async function uploadImagesForProduct(files, { productId, defaultAltText, requestedAltText, startSortOrder = 0, hasPrimaryAlready = false, client }) {
  const inserted = [];
  let sortOrder = startSortOrder;
  let madePrimary = hasPrimaryAlready;

  for (const file of files) {
    // D4: sniff real por bytes — nunca confía en extensión ni Content-Type.
    // Lanza BAD_IMAGE / TOO_SMALL con mensaje es-AR.
    await images.assertUsable(file.buffer);

    const baseKey = images.generateBaseKey();
    await images.processImage(file.buffer, { productId, baseKey });

    const altText = (requestedAltText && String(requestedAltText).trim()) || defaultAltText;
    const isPrimary = !madePrimary;

    try {
      const [row] = await productImagesModel.bulkCreate(
        productId,
        [{ filename: baseKey, altText, sortOrder, isPrimary }],
        client
      );
      inserted.push(row);
    } catch (err) {
      // Spec "Processing failure leaves no partial state": si el INSERT
      // falla, los derivados ya escritos se borran (tolerante a ENOENT).
      await images.removeImageFiles(productId, baseKey);
      throw err;
    }

    madePrimary = true;
    sortOrder += 1;
  }

  return inserted;
}

// Upload (spec "Upload validation" + "Server-side processing pipeline").
// `alt_text` pre-filled con el nombre del producto si viene vacío (spec
// "Alt text" — nunca bloquea el upload).
router.post(
  '/admin/productos/:id/imagenes',
  upload.array('images', MAX_FILES),
  mapMulterError,
  async (req, res, next) => {
    try {
      if (!csrfGuardOrRespond(req, res)) return;

      const productId = Number(req.params.id);
      const product = await productsModel.findById(productId);
      if (!product) return res.status(404).send('Producto no encontrado.');

      const files = req.files || [];
      if (files.length === 0) {
        return res.redirect(303, `/admin/productos/${productId}/editar`);
      }

      const existing = await productImagesModel.findByProductId(productId);

      await uploadImagesForProduct(files, {
        productId,
        defaultAltText: product.name,
        requestedAltText: req.body.alt_text,
        startSortOrder: existing.length,
        hasPrimaryAlready: existing.some((img) => img.is_primary),
      });

      return res.redirect(303, `/admin/productos/${productId}/editar`);
    } catch (err) {
      if (err.code === 'BAD_IMAGE' || err.code === 'TOO_SMALL') {
        return renderEditWithError(res, req.params.id, err.message);
      }
      return next(err);
    }
  }
);

// Reorder up/down (spec "Reorder with up/down controls only" — sin drag,
// D8). El router calcula el nuevo orden con la función pura `reorderIds` y
// lo persiste completo con `reorder()`.
router.post('/admin/productos/:id/imagenes/:imageId/mover', async (req, res, next) => {
  try {
    if (!csrfGuardOrRespond(req, res)) return;

    const productId = req.params.id;
    const direction = req.body.direction === 'down' ? 'down' : 'up';
    const images_ = await productImagesModel.findByProductId(productId);
    const ids = images_
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => String(img.id));

    const reordered = productImagesModel.reorderIds(ids, String(req.params.imageId), direction);
    await productImagesModel.reorder(productId, reordered);

    return res.redirect(303, `/admin/productos/${productId}/editar`);
  } catch (err) {
    return next(err);
  }
});

// Set primary (spec "Exactly one primary image", D8: clear-then-set en 1 tx).
router.post('/admin/productos/:id/imagenes/:imageId/primaria', async (req, res, next) => {
  try {
    if (!csrfGuardOrRespond(req, res)) return;
    await productImagesModel.setPrimary(req.params.id, req.params.imageId);
    return res.redirect(303, `/admin/productos/${req.params.id}/editar`);
  } catch (err) {
    return next(err);
  }
});

// Delete (spec "Deleting the last image of an active product is blocked",
// D7). El modelo aplica la política dentro de la misma tx que el DELETE;
// los archivos se borran DESPUÉS del commit (Data Flow de design.md).
router.post('/admin/productos/:id/imagenes/:imageId/eliminar', async (req, res, next) => {
  try {
    if (!csrfGuardOrRespond(req, res)) return;

    const removed = await productImagesModel.remove(req.params.imageId);
    if (removed) {
      await images.removeImageFiles(removed.product_id, removed.base_key);
    }
    return res.redirect(303, `/admin/productos/${req.params.id}/editar`);
  } catch (err) {
    if (err.code === 'LAST_IMAGE_ACTIVE') {
      return renderEditWithError(res, req.params.id, err.message);
    }
    return next(err);
  }
});

module.exports = router;
module.exports.uploadImagesForProduct = uploadImagesForProduct;
module.exports.csrfGuardOrRespond = csrfGuardOrRespond;
