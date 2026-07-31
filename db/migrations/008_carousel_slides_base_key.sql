BEGIN;

-- Fase 6d (design.md D-B, mismo patrón que migración 007 para
-- product_images): `image_desktop` guardaba un path público literal
-- (`placeholders/carousel-N.jpg`). A partir de acá cada fila guarda un
-- `base_key` OPACO compartido por AMBOS renders (desktop 1920x760 y mobile
-- 1080x1350, recorte centrado del MISMO buffer subido) — nunca dos uploads
-- separados. Toda URL se deriva en el render vía
-- `src/services/image-urls.js#slideImageAttrs`.
ALTER TABLE carousel_slides RENAME COLUMN image_desktop TO base_key;

-- `image_mobile` deja de existir como columna: por decisión de producto
-- (user decision 3 de esta fase) el mobile SIEMPRE se deriva del mismo
-- `base_key` que el desktop — una columna cuyo único valor posible sería
-- una copia del mismo dato es una fuente de desincronización, no un dato.
-- Re-agregarla es una migración de 3 líneas si algún día se necesita un
-- upload mobile independiente.
ALTER TABLE carousel_slides DROP COLUMN image_mobile;

-- Las filas legadas (`placeholders/carousel-N.jpg`) no mapean a ningún
-- archivo del esquema nuevo — sus derivados WebP jamás existieron, así que
-- dejarlas vivas solo produciría 404 en el home. `npm run seed` las
-- regenera reales, corridas por el mismo pipeline sharp que un upload real
-- (una sola ruta de render, mismo criterio que migración 007).
DELETE FROM carousel_slides WHERE base_key LIKE '%.%';

-- Corta path traversal a nivel de esquema (design.md Threat Matrix):
-- `base_key` siempre lo genera el server (`images.js#generateBaseKey`),
-- nunca el cliente, así que este CHECK nunca debería fallar en operación
-- normal — es la última línea de defensa, no la primera.
ALTER TABLE carousel_slides
  ADD CONSTRAINT chk_carousel_slides_base_key_format CHECK (base_key ~ '^[a-z0-9-]+$');

COMMIT;
