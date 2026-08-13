// Rutas públicas del catálogo (§5 de prompt.md, Fase 3). Orden de registro
// deliberado: rutas específicas antes que comodines, para no colisionar con
// `/carrito` (Fase 4) ni `/pedido/:token` (Fase 5) — ver design.md "Route Map".
const express = require('express');
const categoriesModel = require('../models/categories');
const productsModel = require('../models/products');
const productImagesModel = require('../models/product-images');
const variantsModel = require('../models/variants');
const carouselSlidesModel = require('../models/carousel-slides');
const pagesModel = require('../models/pages');
const { computeAvailability, buildDecisionTable } = require('../services/availability');
const { buildHomeSeo, buildCategorySeo, buildProductSeo, buildPrivateSeo, buildProductJsonLd } = require('../services/seo');
const { searchProductsByName } = require('../services/search');
const searchRateLimit = require('../middleware/search-rate-limit');
const config = require('../config/env');

const router = express.Router();

const PER_PAGE = 24;

// La card (§5.5) necesita imágenes + disponibilidad de variantes, que
// findByCategory/findFeatured no traen (serían más JOINs cartesianos — misma
// razón que findBySlugWithDetails evita el mega-JOIN). Se completa acá, en la
// capa de rutas, componiendo los tres modelos por producto de la página
// actual (máx. 24 productos, escala trivial para esta fase).
// Precio efectivo por variante (§3.1: `price_override ?? base_price`).
// `buildDecisionTable` es una función pura sobre `variants` (sin acceso a
// producto/DB — mismo criterio que availability.js), así que el precio
// efectivo se resuelve ACÁ, donde `product.base_price` está disponible,
// antes de pasarle las filas.
function withEffectivePrice(variants, product) {
  return variants.map((v) => ({ ...v, price: v.price_override ?? product.base_price }));
}

// Fase 7 (design.md D4-D6, spec R5-R8): batching — 2 queries fijas en vez
// de 2N. `findByProductIds` de cada modelo trae TODAS las filas de la
// página en una sola query y las agrupa en Map<number, row[]>; acá solo se
// hace el lookup por producto. `Number(product.id)` en AMBOS lados del
// join (D5/D6): `product.id` también es BIGINT string desde pg, así que sin
// normalizar el mismo bug de R8 aparece del lado del caller. Producto
// duplicado en el input (relacionados/búsqueda) comparte la MISMA
// referencia de array `images` entre las dos cards — seguro porque las
// vistas solo leen.
async function attachCardData(products) {
  if (!products || products.length === 0) return [];
  const ids = products.map((p) => p.id);
  const [imagesByProduct, variantsByProduct] = await Promise.all([
    productImagesModel.findByProductIds(ids),
    variantsModel.findByProductIds(ids),
  ]);
  return products.map((product) => {
    const key = Number(product.id);
    const variants = withEffectivePrice(variantsByProduct.get(key) || [], product);
    return {
      ...product,
      images: imagesByProduct.get(key) || [],
      variants,
      availability: computeAvailability(variants),
      // Fase 4 (design.md D4): única fuente para el selector client-side,
      // compuesta a partir de las mismas funciones que `availability` —
      // nunca una segunda implementación de §3.2.
      decisionTable: buildDecisionTable(variants),
    };
  });
}

// Whitelist de sort espejada de products.js (§8.1: nunca se pasa el valor de
// query string crudo al SQL; acá solo se valida membership antes de reenviarlo
// como clave al modelo, que vuelve a mapearlo contra su propio whitelist).
const ALLOWED_SORTS = new Set(['price_asc', 'price_desc', 'az', 'za', 'newest', 'oldest']);

function parseSort(raw) {
  return ALLOWED_SORTS.has(raw) ? raw : 'newest';
}

function parsePage(raw) {
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function parsePrice(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// La descripción es la ÚNICA dinámica que se renderiza sin escapar (`<%- %>`
// en product.ejs), y solo después de pasar por acá (§8.1). `require` es
// perezoso (no al tope del archivo): si `sanitize-html` todavía no está
// instalado (T1, pendiente de `npm install` en el host Windows), el resto
// del catálogo sigue funcionando sin problema — únicamente una ficha CON
// descripción cargada revienta acá, con un stack trace claro apuntando al
// módulo faltante, en vez de tumbar todas las rutas al arrancar el proceso.
function sanitizeDescription(html) {
  const sanitizeHtml = require('sanitize-html');
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
    allowedAttributes: { a: ['href', 'rel', 'target'] },
  });
}

function render404(req, res) {
  res.status(404).render('layouts/main', {
    view: '../pages/404',
    ...buildPrivateSeo({ title: `Página no encontrada — ${config.NOMBRE_TIENDA}` }),
  });
}

router.get('/', async (req, res, next) => {
  try {
    const [featuredRaw, slides] = await Promise.all([
      productsModel.findFeatured(8),
      carouselSlidesModel.findActive(),
    ]);
    const featured = await attachCardData(featuredRaw);
    res.render('layouts/main', {
      view: '../pages/home',
      ...buildHomeSeo(config),
      featured,
      slides,
      // carousel.js solo se carga con 2+ slides (§5.3): con 1 o 0, la imagen
      // es fija/ausente y no hay nada que animar.
      bodyScripts: slides.length >= 2 ? ['/js/carousel.js'] : [],
    });
  } catch (err) {
    next(err);
  }
});

// Registrada antes que los comodines de categoría para que `/productos` no
// pueda ser interpretado como slug de categoría de primer nivel.
router.get('/productos/:productSlug', async (req, res, next) => {
  try {
    const product = await productsModel.findBySlugWithDetails(req.params.productSlug);
    if (!product) return render404(req, res);

    const categoryIds = product.categories.map((c) => c.id);
    const relatedRaw = await productsModel.findRelated(product.id, categoryIds, 4);
    const related = await attachCardData(relatedRaw);
    product.variants = withEffectivePrice(product.variants, product);
    product.availability = computeAvailability(product.variants);
    product.decisionTable = buildDecisionTable(product.variants);
    // Principio de ausencia (§4.5): sin descripción, no hay descriptionHtml,
    // y product.ejs directamente no renderiza la sección.
    if (product.description) {
      product.descriptionHtml = sanitizeDescription(product.description);
    }

    const bodyScripts = ['/js/copy-link.js'];
    // Fase 7 lightbox (design.md U1, spec R9): antes `> 1` dejaba el lightbox
    // sin script en productos de una sola foto — con 1 foto el trigger/lupa
    // igual necesita abrir el overlay, no solo el swap de miniaturas.
    if (product.images.length >= 1) bodyScripts.push('/js/gallery.js');

    res.render('layouts/main', {
      view: '../pages/product',
      ...buildProductSeo(product, config),
      jsonLd: buildProductJsonLd(product, config),
      product,
      related,
      bodyScripts,
    });
  } catch (err) {
    next(err);
  }
});

// GET /buscar (design.md D1): registrada ACÁ a propósito, ANTES del comodín
// `/:parentSlug` (más abajo), no en un router separado — de otro modo el
// comodín de categoría capturaría `/buscar` como si fuera un slug de
// categoría de primer nivel (mismo bug class que /carrito, /checkout,
// /pedido, /admin, todos resueltos con la misma regla de orden). "buscar"
// queda como slug de primer nivel reservado, mismo estatus de facto que esos
// otros — no hay validación de slugs reservados en el admin, tampoco acá.
// test/routes/search.test.js cubre explícitamente que este handler responda
// antes que el catch-all.
router.get('/buscar', searchRateLimit, async (req, res, next) => {
  try {
    const { term, rows: rawProducts } = await searchProductsByName(req.query.q);
    const products = await attachCardData(rawProducts);

    res.render('layouts/main', {
      view: '../pages/search',
      ...buildPrivateSeo({ title: term ? `Resultados para "${term}" — ${config.NOMBRE_TIENDA}` : `Buscar — ${config.NOMBRE_TIENDA}` }),
      term,
      products,
    });
  } catch (err) {
    next(err);
  }
});

async function renderCategoryListing(req, res, next, { category, categoryIds, breadcrumbs }) {
  try {
    const priceMin = parsePrice(req.query.price_min);
    const priceMax = parsePrice(req.query.price_max);
    const sort = parseSort(req.query.sort);
    const page = parsePage(req.query.page);

    const { rows: productsRaw, total, totalPages } = await productsModel.findByCategory({
      categoryIds,
      priceMin,
      priceMax,
      sort,
      page,
      perPage: PER_PAGE,
    });
    const products = await attachCardData(productsRaw);

    res.render('layouts/main', {
      view: '../pages/category',
      ...buildCategorySeo(category, { path: req.path, cfg: config }),
      category,
      breadcrumbs,
      products,
      total,
      totalPages,
      page,
      sort,
      priceMin,
      priceMax,
      query: req.query,
      basePath: req.path,
    });
  } catch (err) {
    next(err);
  }
}

// Página informativa (spec informational-pages "Public visibility follows
// enabled state", design.md D7): registrada ACÁ, INMEDIATAMENTE ANTES del
// comodín de categoría — mismo criterio de orden que /buscar más arriba.
// `findActiveBySlug` devuelve null tanto si no existe como si está
// deshabilitada (nunca distingue los dos casos hacia afuera), así que un
// slug de página nunca "shadowea" un slug de categoría homónimo: si no hay
// página ACTIVA con ese slug, cae directo al handler de categoría de abajo
// vía `next()`, sin tocar el 404.
router.get('/:pageSlug', async (req, res, next) => {
  try {
    const page = await pagesModel.findActiveBySlug(req.params.pageSlug);
    if (!page) return next();

    res.render('layouts/main', {
      view: '../pages/info-page',
      ...buildPrivateSeo({ title: `${page.title} — ${config.NOMBRE_TIENDA}` }),
      page,
    });
  } catch (err) {
    next(err);
  }
});

// Categoría de primer nivel: rollup si tiene hijas (§0.1 regla 2), listado
// directo si es hoja (Noche, 2x1, o una hija visitada por URL directa).
router.get('/:parentSlug', async (req, res, next) => {
  try {
    const category = await categoriesModel.findBySlug(req.params.parentSlug);
    if (!category) return render404(req, res);

    const childIds = await categoriesModel.findDescendantIds(category.id);
    const categoryIds = childIds.length > 0 ? [category.id, ...childIds] : [category.id];

    const breadcrumbs = [
      { name: 'Inicio', url: '/' },
      { name: category.name, url: null },
    ];

    await renderCategoryListing(req, res, next, { category, categoryIds, breadcrumbs });
  } catch (err) {
    next(err);
  }
});

// Categoría hija (§0.1): siempre hoja, nunca acumula (max 2 niveles).
router.get('/:parentSlug/:childSlug', async (req, res, next) => {
  try {
    const [parent, child] = await Promise.all([
      categoriesModel.findBySlug(req.params.parentSlug),
      categoriesModel.findBySlug(req.params.childSlug),
    ]);
    if (!parent || !child || child.parent_id !== parent.id) return render404(req, res);

    const breadcrumbs = [
      { name: 'Inicio', url: '/' },
      { name: parent.name, url: `/${parent.slug}` },
      { name: child.name, url: null },
    ];

    await renderCategoryListing(req, res, next, { category: child, categoryIds: [child.id], breadcrumbs });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
// Fase 7 (tasks.md 3.1): `attachCardData` no depende de `sharp`, así que se
// testea directo contra Postgres real sin pasar por `app.js`/supertest
// (ver test/routes/public-attach-card-data.test.js). Los 4 call sites de
// arriba siguen usando el router — este export es solo para testing.
module.exports.attachCardData = attachCardData;
