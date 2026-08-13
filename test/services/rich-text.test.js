// RED (tasks.md T3, spec constrained-rich-text "Inline-only formatting
// allowlist"): allowlist DEDICADO a páginas informativas, distinto del
// allowlist de descripción de producto (public.js#sanitizeDescription) —
// nunca se tocan ni se importan entre sí (design.md D6).
const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeInline } = require('../../src/services/rich-text');

test('sanitizeInline: negrita, cursiva, subrayado y tachado sobreviven', () => {
  const html = '<strong>negrita</strong> <em>cursiva</em> <u>subrayado</u> <s>tachado</s>';
  assert.equal(sanitizeInline(html), html);
});

test('sanitizeInline: line breaks sobreviven', () => {
  assert.equal(sanitizeInline('linea uno<br>linea dos'), 'linea uno<br />linea dos');
});

test('sanitizeInline: script, link, párrafo y lista se stripean preservando el texto', () => {
  assert.equal(sanitizeInline('<script>alert(1)</script>texto'), 'texto');
  assert.equal(sanitizeInline('<a href="https://evil.example">link</a>'), 'link');
  assert.equal(sanitizeInline('<p>parrafo</p>'), 'parrafo');
  assert.equal(sanitizeInline('<ul><li>item</li></ul>'), 'item');
});

test('sanitizeInline: atributos inline (style/class/onerror) se eliminan', () => {
  assert.equal(sanitizeInline('<strong style="color:red" class="x" onerror="alert(1)">bold</strong>'), '<strong>bold</strong>');
});

test('sanitizeInline: transformTags absorbe variantes de navegador (b/i/strike/del)', () => {
  assert.equal(sanitizeInline('<b>bold</b>'), '<strong>bold</strong>');
  assert.equal(sanitizeInline('<i>italic</i>'), '<em>italic</em>');
  assert.equal(sanitizeInline('<strike>strike</strike>'), '<s>strike</s>');
  assert.equal(sanitizeInline('<del>del</del>'), '<s>del</s>');
});

test('sanitizeInline: input vacío o solo markup sin texto devuelve string vacío (spec "Empty description")', () => {
  assert.equal(sanitizeInline(''), '');
  assert.equal(sanitizeInline('   '), '');
  assert.equal(sanitizeInline('<p>   </p>'), '');
  // Un <br> aislado, sin texto acompañante, cuenta como "solo formatting
  // markup sin texto" (spec: "contains only formatting markup with no
  // text") — también debe colapsar a vacío para la validación de alta.
  assert.equal(sanitizeInline('<br>'), '');
});
