// Fase 7 accesibilidad (design.md D6, spec R8): nombre accesible del
// link-imagen de product-card.ejs. Render aislado con ejs.renderFile, mismo
// patrón que test/routes/error-pages.test.js — sin pasar por app.js (que
// arrastra sharp, no disponible en WSL). Las funciones que necesita el
// partial (formatPrice, imageAttrs, computeTransferPrice,
// computeInstallmentValue) son puras (services/*.js), así que se pasan
// directo como locals sin mockear nada del server.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');

const { formatPrice } = require('../../src/services/format');
const { imageAttrs } = require('../../src/services/image-urls');
const { computeTransferPrice, computeInstallmentValue } = require('../../src/services/pricing');

const PARTIAL = path.join(__dirname, '../../src/views/partials/product-card.ejs');

function baseProduct(overrides = {}) {
  return {
    id: 1,
    slug: 'remera-basica',
    name: 'Remera básica',
    base_price: 10000,
    compare_at_price: null,
    free_shipping: false,
    images: [],
    variants: [],
    availability: { hasAnyStock: true, defaultSelection: {} },
    ...overrides,
  };
}

async function renderCard(product) {
  return ejs.renderFile(PARTIAL, {
    product,
    formatPrice,
    imageAttrs,
    computeTransferPrice,
    computeInstallmentValue,
  });
}

test('product-card: con alt_text presente, el <img> lo usa como alt (R8 scenario 1)', async () => {
  const product = baseProduct({
    images: [{ is_primary: true, alt_text: 'Remera básica azul de algodón', base_key: 'remera-1' }],
  });

  const html = await renderCard(product);

  assert.ok(html.includes('alt="Remera básica azul de algodón"'));
});

test('product-card: con alt_text vacío/solo espacios, el <img> cae a product.name (R8 scenario 2)', async () => {
  for (const altText of ['', '   ', null]) {
    const product = baseProduct({
      images: [{ is_primary: true, alt_text: altText, base_key: 'remera-1' }],
    });

    const html = await renderCard(product);

    assert.ok(
      html.includes('alt="Remera básica"'),
      `alt_text=${JSON.stringify(altText)} debe caer a product.name`,
    );
  }
});

test('product-card: sin imágenes, el link-imagen tiene nombre accesible no vacío (R8 scenario 3)', async () => {
  const product = baseProduct({ images: [] });

  const html = await renderCard(product);

  const linkMatch = html.match(/<a href="\/productos\/remera-basica"[^>]*class="card-media[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(linkMatch, 'debe existir el link-imagen');
  assert.ok(
    linkMatch[1].includes('<span class="sr-only">Remera básica</span>'),
    'sin imagen, el link debe exponer un sr-only con product.name como nombre accesible',
  );
});
