// Árbol de categorías real, literal de §0.1 de prompt.md: 3 padres con hijas
// + 2 categorías de primer nivel sin hijas (Noche, 2x1). Nombres con
// capitalización normal (regla 4 de §0.1) — el mayúsculas-todo se resuelve
// en CSS, no en la base.
//
// "Blazer" queda deliberadamente sin productos seeded (ver products.js) para
// probar que una categoría sin productos activos desaparece del menú (§4.5).
module.exports = [
  {
    name: 'Partes de arriba',
    slug: 'partes-de-arriba',
    children: [
      { name: 'Remeras y musculosas', slug: 'remeras-y-musculosas' },
      { name: 'Remerones', slug: 'remerones' },
      { name: 'Bodys', slug: 'bodys' },
      { name: 'Tops', slug: 'tops' },
      { name: 'Blusas y camisas', slug: 'blusas-y-camisas' },
    ],
  },
  {
    name: 'Partes de abajo',
    slug: 'partes-de-abajo',
    children: [
      { name: 'Pantalones', slug: 'pantalones' },
      { name: 'Polleras y shorts', slug: 'polleras-y-shorts' },
      { name: 'Bermudas', slug: 'bermudas' },
      { name: 'Jeans', slug: 'jeans' },
    ],
  },
  {
    name: 'Abrigos',
    slug: 'abrigos',
    children: [
      { name: 'Camperas y chaquetas', slug: 'camperas-y-chaquetas' },
      { name: 'Chalecos', slug: 'chalecos' },
      { name: 'Blazer', slug: 'blazer' },
      { name: 'Buzos y sweaters', slug: 'buzos-y-sweaters' },
      { name: 'Sacos', slug: 'sacos' },
    ],
  },
  { name: 'Noche', slug: 'noche', children: [] },
  { name: '2x1', slug: '2x1', children: [] },
];
