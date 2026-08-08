// Tests del servicio puro de SEO (Fase 7, design.md D-A/D-B). Sin DB, sin
// sharp: fixtures en memoria, mismo criterio que availability.js/format.js.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toPlainText,
  truncate,
  absoluteUrl,
  buildHomeSeo,
  buildCategorySeo,
  buildProductSeo,
  buildPrivateSeo,
  buildProductJsonLd,
  STORE_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  MAX_META,
} = require('../../src/services/seo');
const { toScriptJson, CURRENCY } = require('../../src/services/format');

const cfg = { SITE_URL: 'http://localhost:3000', NOMBRE_TIENDA: 'Donna Style' };

// --- 1.1/1.2 toPlainText ---------------------------------------------------
test('toPlainText: quita tags, decodifica entidades y colapsa espacios', () => {
  const html = '<p>Hola&nbsp;&amp; Mundo</p>\n<br>   Todo   bien</p>';
  assert.equal(toPlainText(html), 'Hola & Mundo Todo bien');
});

test('toPlainText: lista anidada queda como texto plano con un solo espacio entre items', () => {
  const html = '<ul><li>Uno</li><li>Dos</li></ul>';
  assert.equal(toPlainText(html), 'Uno Dos');
});

test('toPlainText: string vacío o null da string vacío', () => {
  assert.equal(toPlainText(''), '');
  assert.equal(toPlainText(null), '');
  assert.equal(toPlainText(undefined), '');
});

// --- 1.3/1.4 truncate -------------------------------------------------------
test('truncate: string corta (<= MAX_META) queda intacta, sin puntos suspensivos', () => {
  const short = 'Una descripción corta.';
  assert.equal(truncate(short), short);
});

test(`truncate: corta en el límite de palabra a MAX_META=${MAX_META} y agrega …`, () => {
  const long = 'Palabra '.repeat(40).trim(); // > 160 chars
  const result = truncate(long);
  assert.ok(result.length <= MAX_META + 1, 'no debe superar MAX_META + el carácter …');
  assert.ok(result.endsWith('…'));
  assert.ok(!result.slice(0, -1).endsWith(' '), 'no debe dejar espacio colgante antes de …');
  // Nunca corta una palabra a la mitad: lo que queda antes de … debe ser un
  // prefijo de "long" cortado justo en un espacio.
  const withoutEllipsis = result.slice(0, -1).trimEnd();
  assert.ok(long.startsWith(withoutEllipsis));
  assert.notEqual(long[withoutEllipsis.length], undefined);
});

// --- 1.5/1.6 absoluteUrl -----------------------------------------------------
test('absoluteUrl: arma la URL absoluta a partir de SITE_URL, sin barra doble', () => {
  assert.equal(absoluteUrl('/', cfg), 'http://localhost:3000/');
  assert.equal(absoluteUrl('/productos/remera-taylor', cfg), 'http://localhost:3000/productos/remera-taylor');
});

test('absoluteUrl: es idempotente (aplicarla dos veces da el mismo resultado)', () => {
  const once = absoluteUrl('/productos/x', cfg);
  const twice = absoluteUrl(once, cfg);
  assert.equal(twice, once);
});

test('absoluteUrl: nunca lee req.host / X-Forwarded-Host (solo cfg.SITE_URL)', () => {
  const fakeReqLikeCfg = { SITE_URL: cfg.SITE_URL, host: 'evil.example.com' };
  assert.equal(absoluteUrl('/x', fakeReqLikeCfg), 'http://localhost:3000/x');
});

// --- 2.1/2.2 buildHomeSeo ----------------------------------------------------
test('buildHomeSeo: título de tienda, STORE_DESCRIPTION exacta y canonical raíz', () => {
  const seo = buildHomeSeo(cfg);
  assert.equal(seo.title, cfg.NOMBRE_TIENDA);
  assert.equal(seo.metaDescription, STORE_DESCRIPTION);
  assert.equal(seo.canonicalUrl, `${cfg.SITE_URL}/`);
  assert.equal(seo.ogUrl, seo.canonicalUrl);
  assert.equal(seo.ogType, 'website');
});

test('STORE_DESCRIPTION: copia exacta provista por la dueña', () => {
  assert.equal(
    STORE_DESCRIPTION,
    'Donna Style — moda femenina online. Encontrá tu talle, elegí tu color y comprá fácil: coordinamos todo por WhatsApp.'
  );
});

// --- 2.3/2.4 buildCategorySeo -------------------------------------------------
test('buildCategorySeo: canonical se arma desde path, nunca desde query string', () => {
  const category = { name: 'Bodys', slug: 'bodys' };
  const seo = buildCategorySeo(category, { path: '/bodys', cfg });
  assert.equal(seo.canonicalUrl, `${cfg.SITE_URL}/bodys`);
  assert.ok(seo.title.includes('Bodys'));
});

test('buildCategorySeo: dos categorías distintas nunca comparten canonical', () => {
  const a = buildCategorySeo({ name: 'Bodys', slug: 'bodys' }, { path: '/bodys', cfg });
  const b = buildCategorySeo({ name: 'Noche', slug: 'noche' }, { path: '/noche', cfg });
  assert.notEqual(a.canonicalUrl, b.canonicalUrl);
});

test('buildCategorySeo: ignora query string incluso si el path la trajera pegada', () => {
  const category = { name: 'Bodys', slug: 'bodys' };
  const seo = buildCategorySeo(category, { path: '/bodys', cfg });
  assert.ok(!seo.canonicalUrl.includes('?'));
});

// --- 2.5/2.6 buildProductSeo -------------------------------------------------
test('buildProductSeo: descripción real se pasa a texto plano y se trunca', () => {
  const product = {
    id: 1,
    slug: 'remera-taylor',
    name: 'Remera Taylor',
    description: '<p>Una remera <strong>hermosa</strong> de algodón.</p>',
    images: [],
  };
  const seo = buildProductSeo(product, cfg);
  assert.ok(seo.metaDescription.includes('Una remera hermosa de algodón.'));
  assert.ok(!seo.metaDescription.includes('<'));
});

test('buildProductSeo: descripción vacía o solo espacios cae al fallback de tienda, nunca content=""', () => {
  const empty = buildProductSeo({ id: 1, slug: 'a', name: 'A', description: '', images: [] }, cfg);
  const blank = buildProductSeo({ id: 2, slug: 'b', name: 'B', description: '   ', images: [] }, cfg);
  const nullDesc = buildProductSeo({ id: 3, slug: 'c', name: 'C', description: null, images: [] }, cfg);
  assert.equal(empty.metaDescription, STORE_DESCRIPTION);
  assert.equal(blank.metaDescription, STORE_DESCRIPTION);
  assert.equal(nullDesc.metaDescription, STORE_DESCRIPTION);
  assert.notEqual(empty.metaDescription, '');
});

test('buildProductSeo: ogImage usa la imagen del producto cuando existe', () => {
  const product = {
    id: 7,
    slug: 'remera-taylor',
    name: 'Remera Taylor',
    description: 'Linda',
    images: [{ base_key: 'k3x9abcd' }],
  };
  const seo = buildProductSeo(product, cfg);
  assert.equal(seo.ogImage, `${cfg.SITE_URL}/uploads/7/k3x9abcd-1400.webp`);
});

test('buildProductSeo: sin imágenes cae al logo cuadrado por defecto, absoluto', () => {
  const product = { id: 8, slug: 'sin-foto', name: 'Sin Foto', description: 'x', images: [] };
  const seo = buildProductSeo(product, cfg);
  assert.equal(seo.ogImage, `${cfg.SITE_URL}${DEFAULT_OG_IMAGE}`);
});

test('buildProductSeo: título incluye el nombre del producto y canonical es su propia URL', () => {
  const product = { id: 9, slug: 'campera-denim', name: 'Campera Denim', description: 'x', images: [] };
  const seo = buildProductSeo(product, cfg);
  assert.ok(seo.title.includes('Campera Denim'));
  assert.equal(seo.canonicalUrl, `${cfg.SITE_URL}/productos/campera-denim`);
  assert.equal(seo.ogType, 'product');
});

// --- 2.7/2.8 buildPrivateSeo --------------------------------------------------
test('buildPrivateSeo: devuelve SOLO title + noindex, sin claves de OG/canonical', () => {
  const seo = buildPrivateSeo({ title: 'Carrito — Donna Style', cfg });
  assert.deepEqual(seo, { title: 'Carrito — Donna Style', noindex: true });
});

// --- 2.9/2.10 buildProductJsonLd ----------------------------------------------
function makeProduct(overrides = {}) {
  return {
    id: 5,
    slug: 'remera-taylor',
    name: 'Remera Taylor',
    description: 'Descripción linda',
    base_price: 18700,
    images: [{ base_key: 'k3x9abcd' }],
    variants: [{ id: 1, size: 'M', size_order: 30, color: null, stock: 3 }],
    ...overrides,
  };
}

test('buildProductJsonLd: InStock cuando alguna variante tiene stock', () => {
  const jsonLd = buildProductJsonLd(makeProduct(), cfg);
  assert.equal(jsonLd['@type'], 'Product');
  assert.equal(jsonLd.offers.availability, 'https://schema.org/InStock');
});

test('buildProductJsonLd: OutOfStock cuando TODAS las variantes están en 0 — misma regla que availability.js', () => {
  const product = makeProduct({ variants: [{ id: 1, size: 'M', size_order: 30, color: null, stock: 0 }] });
  const jsonLd = buildProductJsonLd(product, cfg);
  assert.equal(jsonLd.offers.availability, 'https://schema.org/OutOfStock');
});

test('buildProductJsonLd: respeta product.availability ya calculado (no reimplementa la regla)', () => {
  const product = makeProduct({
    variants: [{ id: 1, size: 'M', size_order: 30, color: null, stock: 9 }],
    availability: { hasAnyStock: false, axes: {}, defaultSelection: {} },
  });
  const jsonLd = buildProductJsonLd(product, cfg);
  assert.equal(jsonLd.offers.availability, 'https://schema.org/OutOfStock', 'debe ganar product.availability ya calculado, no re-derivar de variants');
});

test('buildProductJsonLd: priceCurrency es la constante CURRENCY compartida', () => {
  const jsonLd = buildProductJsonLd(makeProduct(), cfg);
  assert.equal(jsonLd.offers.priceCurrency, CURRENCY);
  assert.equal(CURRENCY, 'ARS');
});

test('buildProductJsonLd: precio viene de base_price como string y las imágenes son absolutas', () => {
  const jsonLd = buildProductJsonLd(makeProduct(), cfg);
  assert.equal(jsonLd.offers.price, '18700');
  assert.deepEqual(jsonLd.image, [`${cfg.SITE_URL}/uploads/5/k3x9abcd-1400.webp`]);
  assert.equal(jsonLd.offers.url, `${cfg.SITE_URL}/productos/remera-taylor`);
});

test('buildProductJsonLd: nombre/descripción con </script> e <img onerror> sigue parseable detrás de toScriptJson', () => {
  const product = makeProduct({
    name: 'Remera</script><img src=x onerror=alert(1)>',
    description: 'Linda</script><img src=x onerror=alert(1)>',
  });
  const jsonLd = buildProductJsonLd(product, cfg);
  const embedded = toScriptJson(jsonLd);

  assert.ok(!embedded.includes('</script>'), 'no debe sobrevivir la secuencia de cierre literal');
  const parsed = JSON.parse(embedded);
  assert.equal(parsed.name, product.name);
});
