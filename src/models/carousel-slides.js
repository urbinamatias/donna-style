// Acceso a datos de `carousel_slides`. SQL crudo parametrizado, sin ORM.
const db = require('../db/pool');

async function create({
  imageDesktop,
  imageMobile = null,
  altText,
  linkUrl = null,
  sortOrder = 0,
  isActive = true,
  startsAt = null,
  endsAt = null,
}) {
  const { rows } = await db.query(
    `INSERT INTO carousel_slides
       (image_desktop, image_mobile, alt_text, link_url, sort_order, is_active, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [imageDesktop, imageMobile, altText, linkUrl, sortOrder, isActive, startsAt, endsAt]
  );
  return rows[0];
}

module.exports = { create };
