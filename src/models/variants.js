// Acceso a datos de `variants`. SQL crudo parametrizado, sin ORM.
const db = require('../db/pool');
const { LOW_STOCK_THRESHOLD } = require('../services/orders-status');

// El SKU es un dato interno (identificador de inventario/proveedor), nunca
// algo que la dueña carga o ve (fase 6c, QA: se mostraba como campo editable
// "SKU (opcional)" en cada fila de la grilla, dándole protagonismo a un
// concepto que no le sirve). Se genera solo, a partir del id del producto
// (estable, nunca cambia) + talle + color — nunca del slug del producto,
// que si se congela distinto del nombre (CLAUDE.md, freeze de slug) igual
// podría no reflejar el nombre actual.
function skuPart(value) {
  if (!value) return null;
  const normalized = String(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, '');
  return normalized || null;
}

function autoSku(productId, size, color) {
  return `SKU-${productId}-${skuPart(size) || 'U'}-${skuPart(color) || 'U'}`;
}

// variants: [{ size, sizeOrder, color, colorHex, sku, stock, priceOverride }]
async function bulkCreate(productId, variants) {
  if (!variants || variants.length === 0) return [];
  const values = [];
  const placeholders = variants
    .map((v, i) => {
      const base = i * 8;
      values.push(
        productId,
        v.size ?? null,
        v.sizeOrder ?? 0,
        v.color ?? null,
        v.colorHex ?? null,
        v.sku ?? autoSku(productId, v.size, v.color),
        v.stock ?? 0,
        v.priceOverride ?? null
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    })
    .join(', ');
  const { rows } = await db.query(
    `INSERT INTO variants
       (product_id, size, size_order, color, color_hex, sku, stock, price_override)
     VALUES ${placeholders}
     RETURNING *`,
    values
  );
  return rows;
}

async function findByProductId(productId) {
  const { rows } = await db.query(
    'SELECT * FROM variants WHERE product_id = $1 ORDER BY size_order, color',
    [productId]
  );
  return rows;
}

// Fase 4 (design.md): re-deriva variantes desde filas LIVE para el carrito.
// Nunca confía en precio/stock enviado por el cliente (§CLAUDE.md) — cada
// POST de carrito llama esto para revalidar contra la DB real. `ANY($1)`
// con array vacío en Postgres no rompe, pero evitamos la query igual.
async function findByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const { rows } = await db.query(
    `SELECT
       v.id, v.product_id, v.size, v.color, v.stock,
       COALESCE(v.price_override, p.base_price) AS price,
       p.name AS product_name, p.slug AS product_slug,
       img.base_key AS image_base_key
     FROM variants v
     JOIN products p ON p.id = v.product_id
     LEFT JOIN LATERAL (
       SELECT base_key FROM product_images
       WHERE product_id = v.product_id
       ORDER BY is_primary DESC, sort_order ASC
       LIMIT 1
     ) img ON true
     WHERE v.id = ANY($1::bigint[])`,
    [ids]
  );
  return rows.map((row) => ({ ...row, id: Number(row.id), product_id: Number(row.product_id) }));
}

// Reemplaza TODAS las variantes de un producto en una sola operación
// (Fase 6a, design.md "variants.replaceForProduct", tx-aware vía `client`).
// Confía en el `sizeOrder` que trae cada fila — NUNCA lo recalcula acá: quien
// decide el valor final de `size_order` es siempre variant-grid.js (cliente,
// de más chico a más grande, sin reorder manual — el drag se sacó por QA) o
// sizes.js si en algún momento se genera server-side.
async function replaceForProduct(productId, variants, client = db) {
  await client.query('DELETE FROM variants WHERE product_id = $1', [productId]);
  if (!variants || variants.length === 0) return [];

  const values = [];
  const placeholders = variants
    .map((v, i) => {
      const base = i * 8;
      values.push(
        productId,
        v.size ?? null,
        v.sizeOrder ?? 0,
        v.color ?? null,
        v.colorHex ?? null,
        v.sku ?? autoSku(productId, v.size, v.color),
        v.stock ?? 0,
        v.priceOverride ?? null
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    })
    .join(', ');
  const { rows } = await client.query(
    `INSERT INTO variants
       (product_id, size, size_order, color, color_hex, sku, stock, price_override)
     VALUES ${placeholders}
     RETURNING *`,
    values
  );
  return rows;
}

async function removeById(id, client = db) {
  await client.query('DELETE FROM variants WHERE id = $1', [id]);
}

function stripFullCount(row) {
  const { full_count, ...rest } = row;
  return rest;
}

// Listado admin de stock (Fase 6c, design.md "findAllForAdmin"): incluye
// variantes de productos inactivos (spec "Rows of inactive products MUST
// still be listed"). `lowStock` usa el umbral centralizado de
// orders-status.js, nunca hardcodeado acá.
async function findAllForAdmin({ productId = null, lowStock = false, page = 1, perPage = 100 } = {}) {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const offset = (safePage - 1) * perPage;

  const { rows } = await db.query(
    `SELECT v.*, p.name AS product_name, COUNT(*) OVER() AS full_count
     FROM variants v
     JOIN products p ON p.id = v.product_id
     WHERE ($1::bigint IS NULL OR v.product_id = $1)
       AND ($2::boolean IS NOT TRUE OR v.stock <= $3::int)
     ORDER BY p.name, v.size_order, v.color
     LIMIT $4 OFFSET $5`,
    [productId, lowStock, LOW_STOCK_THRESHOLD, perPage, offset]
  );

  const total = rows.length > 0 ? Number(rows[0].full_count) : 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return { rows: rows.map(stripFullCount), total, totalPages };
}

// Guardado bulk de stock (Fase 6c, design.md D6): un solo UPDATE...FROM VALUES
// en una transacción, last-write-wins. `entries` ya viene filtrado por la
// ruta a solo las filas que cambiaron. Devuelve cuántas filas se escribieron
// de verdad (ids inexistentes simplemente no matchean, no rompen el resto).
async function updateStockBulk(entries, client = db) {
  if (!entries || entries.length === 0) return 0;
  const values = [];
  const placeholders = entries
    .map((e, i) => {
      values.push(e.id, e.stock);
      return `($${i * 2 + 1}::bigint, $${i * 2 + 2}::int)`;
    })
    .join(', ');
  const { rowCount } = await client.query(
    `UPDATE variants AS v SET stock = d.stock
     FROM (VALUES ${placeholders}) AS d(id, stock)
     WHERE v.id = d.id`,
    values
  );
  return rowCount;
}

// Descuento guardado (design.md D3): update condicional + assertion de
// rowCount. Si `stock < quantity`, 0 filas afectadas -> false, sin escribir
// nada — el caller (ruta de confirmar pedido) decide tirar INSUFFICIENT_STOCK
// y hacer rollback de toda la transacción, nunca deja que el CHECK stock >= 0
// de la DB reviente en su lugar.
async function decrementStock(variantId, quantity, client = db) {
  const { rowCount } = await client.query(
    'UPDATE variants SET stock = stock - $1 WHERE id = $2 AND stock >= $1',
    [quantity, variantId]
  );
  return rowCount === 1;
}

// Reposición (design.md D3): sin guard — sumar nunca puede violar
// CHECK (stock >= 0).
async function incrementStock(variantId, quantity, client = db) {
  await client.query('UPDATE variants SET stock = stock + $1 WHERE id = $2', [quantity, variantId]);
}

module.exports = {
  bulkCreate,
  findByProductId,
  findByIds,
  replaceForProduct,
  removeById,
  findAllForAdmin,
  updateStockBulk,
  decrementStock,
  incrementStock,
};
