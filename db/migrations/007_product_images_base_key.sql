BEGIN;

-- Fase 6b (design.md D1/D2): `filename` guardaba un nombre de archivo del
-- viejo esquema (`placeholders/<slug>-<n>.jpg`). A partir de acá cada fila
-- guarda un `base_key` OPACO — sin extensión, sin ancho — y toda URL se
-- deriva en el render vía el único helper `src/services/image-urls.js`
-- (`/uploads/<productId>/<base_key>-{400,800,1400}.webp`). Guardar 3
-- columnas de ancho o el filename entero mezclaría un detalle de rendering
-- con el esquema de datos y podría desincronizarse.
ALTER TABLE product_images RENAME COLUMN filename TO base_key;

-- Las filas legadas (`placeholders/<slug>-<n>.jpg`) no mapean a ningún
-- archivo del esquema nuevo — sus derivados WebP jamás existieron, así que
-- dejarlas vivas solo produciría 404 en la tienda. `npm run seed` (TRUNCATE
-- product_images) las regenera reales, corridas por el mismo pipeline sharp
-- que un upload real (una sola ruta de render, #seed-data delta).
DELETE FROM product_images WHERE base_key LIKE '%.%';

-- D9 (products.js, invariante NO_IMAGES): un producto que quedó sin
-- imágenes por el DELETE de arriba no puede seguir activo — mismo estado
-- que un producto 6a recién creado sin fotos. Nunca lo dejamos
-- "activo pero sin imagen" en un catálogo público.
UPDATE products p
SET is_active = false
WHERE is_active = true
  AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id);

-- Corta path traversal a nivel de esquema (design.md D1): `base_key` siempre
-- lo genera el server (`images.js#generateBaseKey`), nunca el cliente, así
-- que este CHECK nunca debería fallar en operación normal — es la última
-- línea de defensa, no la primera.
ALTER TABLE product_images
  ADD CONSTRAINT chk_product_images_base_key_format CHECK (base_key ~ '^[a-z0-9-]+$');

COMMIT;
