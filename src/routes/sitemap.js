// sitemap.xml / robots.txt (Fase 7, design.md D-E — modelado sobre
// routes/health.js: router chico, sin vista EJS). Montado en app.js ANTES
// de `publicRouter` (Threat Matrix: `/:parentSlug` de public.js de otro
// modo capturaría ambas rutas como si fueran slugs de categoría de primer
// nivel — mismo bug class ya resuelto para /carrito, /checkout, /admin).
//
// Sin caché a propósito, mismo criterio que store-config.js: un alta/baja de
// producto debe reflejarse sin reiniciar el proceso.
const express = require('express');
const categoriesModel = require('../models/categories');
const productsModel = require('../models/products');
const { absoluteUrl } = require('../services/seo');
const config = require('../config/env');

const router = express.Router();

// Único punto que escapa texto hacia el XML generado (Threat Matrix
// "Injection into generated XML"): los slugs del proyecto son `[a-z0-9-]`
// por convención, pero escapar acá NO es opcional — nunca se confía en que
// un valor generado en otro lado ya viene limpio.
function escapeXml(str) {
  return String(str).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

function urlTag(loc, { lastmod, priority } = {}) {
  let xml = `  <url>\n    <loc>${escapeXml(loc)}</loc>\n`;
  if (lastmod) xml += `    <lastmod>${escapeXml(lastmod)}</lastmod>\n`;
  if (priority) xml += `    <priority>${priority}</priority>\n`;
  xml += '  </url>\n';
  return xml;
}

// URL set (design.md D-E): home + categorías visibles de `findMenuTree()`
// (misma regla que el mega menú — nunca una segunda consulta de
// "categorías con productos") + todo producto activo, out-of-stock incluido.
router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const [menuTree, products] = await Promise.all([
      categoriesModel.findMenuTree(),
      productsModel.findAllActiveSlugs(),
    ]);

    const urls = [urlTag(absoluteUrl('/', config), { priority: '1.0' })];

    for (const parent of menuTree) {
      urls.push(urlTag(absoluteUrl(`/${parent.slug}`, config)));
      for (const child of parent.children) {
        urls.push(urlTag(absoluteUrl(`/${parent.slug}/${child.slug}`, config)));
      }
    }

    for (const product of products) {
      urls.push(
        urlTag(absoluteUrl(`/productos/${product.slug}`, config), {
          lastmod: new Date(product.updated_at).toISOString().slice(0, 10),
        })
      );
    }

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.join('') +
      '</urlset>\n';

    res.type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
});

router.get('/robots.txt', (req, res) => {
  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /carrito',
    'Disallow: /checkout',
    'Disallow: /pedido/',
    '',
    `Sitemap: ${absoluteUrl('/sitemap.xml', config)}`,
  ];
  res.type('text/plain').send(`${lines.join('\n')}\n`);
});

module.exports = router;
