// Seed de SOLO el árbol de categorías reales de §0.1 — a diferencia de
// db/seed.js (que TRUNCATEa 9 tablas y siembra datos de PRUEBA), este
// script es seguro de correr contra una base de producción: nunca borra
// nada, y es idempotente (si una categoría ya existe por slug, la salta en
// vez de fallar por la UNIQUE constraint). Pensado para el primer deploy
// real: la dueña pidió expresamente que el árbol de categorías sea el único
// dato "de catálogo" que sobrevive de entrada, el resto (productos,
// imágenes, carrusel) se carga después a mano desde el panel.
require('dotenv').config();

const { pool } = require('../src/db/pool');
const categoriesModel = require('../src/models/categories');
const categoryTree = require('./seeds/categories');

async function seedCategories() {
  let created = 0;
  let skipped = 0;

  for (const [parentIndex, parent] of categoryTree.entries()) {
    let parentRow = await categoriesModel.findBySlug(parent.slug);
    if (parentRow) {
      skipped += 1;
    } else {
      parentRow = await categoriesModel.create({
        name: parent.name,
        slug: parent.slug,
        sortOrder: parentIndex,
      });
      created += 1;
    }

    for (const [childIndex, child] of parent.children.entries()) {
      const existingChild = await categoriesModel.findBySlug(child.slug);
      if (existingChild) {
        skipped += 1;
        continue;
      }
      await categoriesModel.create({
        name: child.name,
        slug: child.slug,
        parentId: parentRow.id,
        sortOrder: childIndex,
      });
      created += 1;
    }
  }

  return { created, skipped };
}

async function main() {
  try {
    console.log('Sembrando árbol de categorías (§0.1) — sin tocar ninguna otra tabla...');
    const { created, skipped } = await seedCategories();
    console.log(`  ${created} categorías creadas, ${skipped} ya existían (salteadas).`);
    console.log('Listo.');
  } catch (err) {
    console.error('Error corriendo el seed de categorías:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
