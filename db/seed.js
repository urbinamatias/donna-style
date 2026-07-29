// Runner de seeds: NO son migraciones (no se trackean en schema_migrations),
// son datos de ejemplo para desarrollo. Idempotente vía TRUNCATE + reinsert
// (design.md §Technical Approach). Se niega a correr en producción porque
// TRUNCATE es destructivo.
require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  console.error('db/seed.js: NODE_ENV=production. Me niego a correr TRUNCATE contra una base productiva.');
  process.exit(1);
}

const { pool } = require('../src/db/pool');
const categoriesModel = require('../src/models/categories');
const productsModel = require('../src/models/products');
const productImagesModel = require('../src/models/product-images');
const variantsModel = require('../src/models/variants');
const siteSettingsModel = require('../src/models/site-settings');
const carouselSlidesModel = require('../src/models/carousel-slides');

const categoryTree = require('./seeds/categories');
const productFixtures = require('./seeds/products');
const siteSettingsFixtures = require('./seeds/site-settings');
const carouselSlideFixtures = require('./seeds/carousel-slides');

async function truncateDomainTables() {
  // admin_users queda afuera a propósito: el seed solo crea el admin de
  // desarrollo con ON CONFLICT DO NOTHING, nunca lo borra.
  await pool.query(`
    TRUNCATE
      product_categories, product_images, variants,
      order_items, orders,
      products, categories,
      carousel_slides, site_settings
    RESTART IDENTITY CASCADE;
  `);
}

async function seedCategories() {
  const slugToId = {};
  for (const [parentIndex, parent] of categoryTree.entries()) {
    const row = await categoriesModel.create({
      name: parent.name,
      slug: parent.slug,
      sortOrder: parentIndex,
    });
    slugToId[parent.slug] = row.id;
    for (const [childIndex, child] of parent.children.entries()) {
      const childRow = await categoriesModel.create({
        name: child.name,
        slug: child.slug,
        parentId: row.id,
        sortOrder: childIndex,
      });
      slugToId[child.slug] = childRow.id;
    }
  }
  return slugToId;
}

async function seedProducts(slugToId) {
  let created = 0;
  for (const fixture of productFixtures) {
    const product = await productsModel.create({
      name: fixture.name,
      slug: fixture.slug,
      description: fixture.description,
      sizeGuide: fixture.sizeGuide,
      basePrice: fixture.basePrice,
      compareAtPrice: fixture.compareAtPrice,
      isFeatured: fixture.isFeatured,
      isActive: fixture.isActive,
      freeShipping: fixture.freeShipping,
    });

    const categoryIds = fixture.categories.map((slug) => slugToId[slug]);
    await productsModel.addToCategories(product.id, categoryIds);
    await productImagesModel.bulkCreate(product.id, fixture.images);
    await variantsModel.bulkCreate(product.id, fixture.variants);
    created += 1;
  }
  return created;
}

async function seedSiteSettings() {
  const entries = Object.entries(siteSettingsFixtures);
  for (const [key, value] of entries) {
    await siteSettingsModel.set(key, value);
  }
  return entries.length;
}

async function seedCarouselSlides() {
  let created = 0;
  for (const fixture of carouselSlideFixtures) {
    await carouselSlidesModel.create(fixture);
    created += 1;
  }
  return created;
}

async function main() {
  try {
    console.log('Reseteando tablas de dominio (TRUNCATE)...');
    await truncateDomainTables();

    console.log('Sembrando árbol de categorías (§0.1)...');
    const slugToId = await seedCategories();
    console.log(`  ${Object.keys(slugToId).length} categorías creadas.`);

    console.log('Sembrando productos, imágenes y variantes...');
    const productsCreated = await seedProducts(slugToId);
    console.log(`  ${productsCreated} productos creados.`);

    console.log('Sembrando textos institucionales (site_settings)...');
    const settingsCreated = await seedSiteSettings();
    console.log(`  ${settingsCreated} claves de configuración creadas.`);

    console.log('Sembrando slides del carrusel (§5.3)...');
    const slidesCreated = await seedCarouselSlides();
    console.log(`  ${slidesCreated} slides creados.`);

    console.log('Seed completado.');
  } catch (err) {
    console.error('Error corriendo el seed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
