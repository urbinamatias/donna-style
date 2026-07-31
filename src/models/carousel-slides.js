// Acceso a datos de `carousel_slides`. SQL crudo parametrizado, sin ORM.
// Fase 6d (design.md D-B, migración 008): `image_desktop`/`image_mobile`
// se reemplazan por un único `base_key` opaco — el mobile SIEMPRE se deriva
// del mismo buffer subido, nunca hay dos uploads separados. El resto del
// modelo mirra el patrón ya establecido por `product-images.js`
// (findAllForAdmin/update/remove/reorder).
const db = require('../db/pool');
const { reorderIds } = require('../services/ordering');

async function create({
  baseKey,
  altText,
  linkUrl = null,
  sortOrder = 0,
  isActive = true,
  startsAt = null,
  endsAt = null,
}) {
  const { rows } = await db.query(
    `INSERT INTO carousel_slides
       (base_key, alt_text, link_url, sort_order, is_active, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [baseKey, altText, linkUrl, sortOrder, isActive, startsAt, endsAt]
  );
  return rows[0];
}

// Slides activos (§5.3): is_active + ventana de fechas starts_at/ends_at,
// ambas opcionales. Un slide sin fechas cargadas siempre cuenta como activo.
// Consumida por el home público — nunca por el panel admin (ver
// findAllForAdmin).
async function findActive() {
  const { rows } = await db.query(
    `SELECT * FROM carousel_slides
     WHERE is_active = true
       AND (starts_at IS NULL OR starts_at <= now())
       AND (ends_at IS NULL OR ends_at >= now())
     ORDER BY sort_order`
  );
  return rows;
}

// El panel lista TODOS los slides — activos, inactivos, vencidos o
// programados a futuro — para que la dueña pueda editar/reordenar/borrar
// cualquiera de ellos (spec "Slide listing with resulting home behaviour").
async function findAllForAdmin() {
  const { rows } = await db.query('SELECT * FROM carousel_slides ORDER BY sort_order, id');
  return rows;
}

async function findById(id) {
  const { rows } = await db.query('SELECT * FROM carousel_slides WHERE id = $1', [id]);
  return rows[0] || null;
}

// Nunca toca `base_key` (spec "Editing metadata MUST NOT require
// re-uploading the image").
async function update(id, { altText, linkUrl, isActive, startsAt, endsAt }) {
  const { rows } = await db.query(
    `UPDATE carousel_slides
     SET alt_text = $2, link_url = $3, is_active = $4, starts_at = $5, ends_at = $6
     WHERE id = $1
     RETURNING *`,
    [id, altText, linkUrl, isActive, startsAt, endsAt]
  );
  return rows[0] || null;
}

// Hard-delete (spec "Real deletion of a slide", mismo criterio que borrar
// foto de producto en Fase 6b): `RETURNING *` para que el router pueda
// borrar los archivos derivados DESPUÉS del commit, con el `base_key` de la
// fila ya borrada.
async function remove(id) {
  const { rows } = await db.query('DELETE FROM carousel_slides WHERE id = $1 RETURNING *', [id]);
  return rows[0] || null;
}

// `orderedIds` es el array COMPLETO en el nuevo orden (sort_order = índice)
// — mismo shape que `product-images.js#reorder`.
async function reorder(orderedIds) {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await db.query('UPDATE carousel_slides SET sort_order = $2 WHERE id = $1', [orderedIds[i], i]);
  }
}

module.exports = {
  create,
  findActive,
  findAllForAdmin,
  findById,
  update,
  remove,
  reorder,
  reorderIds,
};
