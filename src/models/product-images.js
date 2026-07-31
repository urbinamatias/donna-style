// Acceso a datos de `product_images`. SQL crudo parametrizado, sin ORM.
// Fase 6b (design.md D1/D7/D8): `filename` pasó a ser `base_key` (migración
// 007) y el modelo suma reorder/setPrimary/remove/updateAltText — mismo
// patrón client-aware que products.js/variants.js (`client = db` default
// para poder correr dentro de una transacción cuando hace falta).
const db = require('../db/pool');
const { reorderIds } = require('../services/ordering');

// images: [{ filename: baseKey, altText, sortOrder, isPrimary }]
// (el nombre de campo `filename` del payload se mantiene por compatibilidad
// con los callers existentes — bulkCreate lo inserta en la columna base_key).
async function bulkCreate(productId, images, client = db) {
  if (!images || images.length === 0) return [];
  const values = [];
  const placeholders = images
    .map((img, i) => {
      const base = i * 5;
      values.push(productId, img.filename, img.altText, img.sortOrder ?? 0, img.isPrimary ?? false);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    })
    .join(', ');
  const { rows } = await client.query(
    `INSERT INTO product_images (product_id, base_key, alt_text, sort_order, is_primary)
     VALUES ${placeholders}
     RETURNING *`,
    values
  );
  return rows;
}

async function findByProductId(productId) {
  const { rows } = await db.query(
    'SELECT * FROM product_images WHERE product_id = $1 ORDER BY is_primary DESC, sort_order',
    [productId]
  );
  return rows;
}

// D7 (spec "Deleting the last image of an active product is blocked"):
// política de aplicación pura, mismo patrón que hasOrders/hasProducts de
// 6a — nunca se delega a una constraint de DB porque el mensaje debe ser
// legible y la decisión (bloquear, no auto-desactivar) es de producto.
function canDeleteImage({ isActive, imageCount }) {
  if (isActive && imageCount <= 1) {
    return {
      allowed: false,
      code: 'LAST_IMAGE_ACTIVE',
      message:
        'No se puede borrar: es la última imagen de un producto activo. Desactivalo primero si querés borrarla.',
    };
  }
  return { allowed: true };
}

// Spec "Reorder with up/down controls only": pura, sin DB — el router la usa
// para calcular el nuevo orden y `reorder()` lo persiste. Extraída a
// `services/ordering.js` en Fase 6d (design.md D-F, carousel-slides.js
// también reordena) y re-exportada acá SIN CAMBIOS para que
// `test/models/product-images.test.js` (que la importa desde este módulo)
// siga en verde.

async function updateAltText(imageId, altText, client = db) {
  const { rows } = await client.query(
    'UPDATE product_images SET alt_text = $2 WHERE id = $1 RETURNING *',
    [imageId, altText]
  );
  return rows[0] || null;
}

// `orderedIds` es el array COMPLETO en el nuevo orden (sort_order = índice).
async function reorder(productId, orderedIds, client = db) {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await client.query(
      'UPDATE product_images SET sort_order = $3 WHERE id = $1 AND product_id = $2',
      [orderedIds[i], productId, i]
    );
  }
}

// D8/spec "Exactly one primary image": clear-then-set en UNA transacción —
// el índice único parcial (`uq_product_images_one_primary`) garantiza a
// nivel DB que nunca conviven dos primarias, pero clear-then-set en dos
// pasos separados violaría ese índice a mitad de camino si no van en la
// misma tx (clear todas -> set la nueva).
async function setPrimary(productId, imageId) {
  return db.withTransaction(async (client) => {
    await client.query('UPDATE product_images SET is_primary = false WHERE product_id = $1', [productId]);
    const { rows } = await client.query(
      'UPDATE product_images SET is_primary = true WHERE id = $1 AND product_id = $2 RETURNING *',
      [imageId, productId]
    );
    return rows[0] || null;
  });
}

// D7 + spec "Deleting the primary reassigns": una sola transacción que
// bloquea la fila del producto (evita condición de carrera con un update de
// is_active concurrente), aplica la política, borra la fila y promueve la
// siguiente imagen a primaria si hacía falta. El caller (router) borra los
// archivos DESPUÉS del commit (Data Flow de design.md: "DB es la fuente de
// verdad, así que los archivos mueren después del commit, nunca antes").
async function remove(imageId) {
  return db.withTransaction(async (client) => {
    const { rows: imgRows } = await client.query(
      'SELECT * FROM product_images WHERE id = $1 FOR UPDATE',
      [imageId]
    );
    const image = imgRows[0];
    if (!image) return null;

    const { rows: productRows } = await client.query(
      'SELECT is_active FROM products WHERE id = $1 FOR UPDATE',
      [image.product_id]
    );
    const isActive = productRows[0] ? productRows[0].is_active : false;

    const { rows: countRows } = await client.query(
      'SELECT count(*)::int AS n FROM product_images WHERE product_id = $1',
      [image.product_id]
    );
    const imageCount = Number(countRows[0].n);

    const policy = canDeleteImage({ isActive, imageCount });
    if (!policy.allowed) {
      const err = new Error(policy.message);
      err.code = policy.code;
      throw err;
    }

    await client.query('DELETE FROM product_images WHERE id = $1', [imageId]);

    if (image.is_primary) {
      const { rows: nextRows } = await client.query(
        `SELECT id FROM product_images WHERE product_id = $1 ORDER BY sort_order LIMIT 1`,
        [image.product_id]
      );
      if (nextRows[0]) {
        await client.query('UPDATE product_images SET is_primary = true WHERE id = $1', [nextRows[0].id]);
      }
    }

    return image;
  });
}

module.exports = {
  bulkCreate,
  findByProductId,
  canDeleteImage,
  reorderIds,
  updateAltText,
  reorder,
  setPrimary,
  remove,
};
