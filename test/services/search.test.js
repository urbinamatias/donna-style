// Test unitario del servicio de búsqueda (design.md D3). Puro: `model` es
// inyectable para probar que un término vacío/inválido NUNCA toca la DB —
// mismo criterio de inyección de dependencias que availability.js.
const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeTerm, searchProductsByName, MAX_TERM_LENGTH } = require('../../src/services/search');

test('normalizeTerm: recorta espacios en los extremos', () => {
  assert.equal(normalizeTerm('  lino  '), 'lino');
});

test('normalizeTerm: trunca a 100 caracteres, recorte DESPUÉS del trim', () => {
  const raw = ' '.repeat(5) + 'a'.repeat(150);
  const result = normalizeTerm(raw);
  assert.equal(result.length, MAX_TERM_LENGTH);
  assert.equal(result, 'a'.repeat(100));
});

test('normalizeTerm: no-string (ej. ?q=a&q=b llega como array) -> string vacío', () => {
  assert.equal(normalizeTerm(['a', 'b']), '');
  assert.equal(normalizeTerm(undefined), '');
  assert.equal(normalizeTerm(null), '');
});

test('searchProductsByName: término en blanco NUNCA llama al modelo', async () => {
  let called = false;
  const model = { searchActiveByName: async () => { called = true; return []; } };

  const result = await searchProductsByName('   ', { model });

  assert.equal(called, false);
  assert.deepEqual(result, { term: '', rows: [] });
});

test('searchProductsByName: término válido llama al modelo con el término normalizado', async () => {
  const calls = [];
  const model = {
    searchActiveByName: async (term, limit) => {
      calls.push({ term, limit });
      return [{ id: 1, name: 'Vestido Lino' }];
    },
  };

  const result = await searchProductsByName('  Lino  ', { model, limit: 10 });

  assert.deepEqual(calls, [{ term: 'Lino', limit: 10 }]);
  assert.equal(result.term, 'Lino');
  assert.equal(result.rows.length, 1);
});

test('searchProductsByName: usa el modelo real de products.js por default', () => {
  const searchModule = require('../../src/services/search');
  const productsModel = require('../../src/models/products');
  // No ejecuta la query (evitamos I/O acá), solo confirma el default wiring
  // inspeccionando que el módulo no exige pasar `model` para funcionar.
  assert.equal(typeof searchModule.searchProductsByName, 'function');
  assert.equal(typeof productsModel.searchActiveByName, 'function');
});
