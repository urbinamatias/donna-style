// Escapeo + tolerancia a acentos para filtros LIKE parametrizados en
// Postgres (design.md D3, extendido para los filtros de admin en
// productos/stock). Un único lugar para no duplicar esta lógica entre
// `models/products.js` y `models/variants.js` — requerir uno desde el otro
// crearía un ciclo (`products.js` ya requiere `variants.js`).
//
// `translate()` en vez de `unaccent()`: la extensión pg no está instalada
// (sin CREATE EXTENSION en /db/migrations). Da tolerancia a acentos de
// español sin extensión; no es un fold Unicode general. `%`, `_`, `\` no
// están en el mapa de fold, así que los wildcards y el caracter de escape
// sobreviven intactos.
const LIKE_META = /[\\%_]/g;
function escapeLikeLiteral(value) {
  return value.replace(LIKE_META, '\\$&');
}

const FOLD_FROM = 'áàäâãéèëêíìïîóòöôõúùüûñç';
const FOLD_TO = 'aaaaaeeeeiiiiooooouuuunc';

function likePattern(term) {
  return `%${escapeLikeLiteral(term)}%`;
}

module.exports = { escapeLikeLiteral, FOLD_FROM, FOLD_TO, likePattern };
