// RED (tasks.md T10, spec constrained-rich-text "client editor is a
// convenience, never the security boundary"). Las funciones puras se
// testean directo, sin DOM, en ESTE archivo; el wiring real de DOM
// (querySelectorAll/Selection/Range/paste) que SÍ necesita jsdom vive en
// test/public/rich-text-editor.dom.test.js (ronda 4 — jsdom se agregó
// recién esta ronda, ver package.json devDependencies; requiere
// `npm install` desde Windows antes de poder correr ese archivo). La
// garantía "nunca innerHTML/outerHTML/insertAdjacentHTML/document.write
// con datos dinámicos" (CLAUDE.md §3) se sigue verificando acá por
// inspección textual del propio archivo fuente — mismo nivel de confianza
// que un linter de patrón, sin depender de un DOM real.
//
// Ronda 3 de QA manual: `document.execCommand` fue eliminado por completo
// (bugs estructurales de estado interno del browser, no parcheables — ver
// engram sdd/donna-style-web-paginas-informativas/apply-progress).
//
// Ronda 4 de QA manual: 4 bugs nuevos sobre esa base de Selection/Range —
// ver el comentario de cabecera de rich-text-editor.js para el detalle
// completo de cada uno. Las aserciones de este archivo se actualizan para
// reflejar: (a) los botones del toolbar ya NUNCA se deshabilitan (bug #2,
// se elimina toda la lógica de "disabled sin selección" de ronda 3); (b)
// `toolbarButtonPressedState` pasa a un contrato de 1 solo argumento; (c)
// Enter pasa de `keydown` a `beforeinput` (bug #3).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  extractPastedText,
  buildToolbarButtons,
  TOOLBAR_BUTTONS,
  TAG_BY_COMMAND,
  TAG_LIST,
  ZERO_WIDTH_SPACE,
  toolbarButtonPressedState,
  computeMountMinHeight,
} = require('../../src/public/js/rich-text-editor.js');

const SOURCE_PATH = path.join(__dirname, '..', '..', 'src', 'public', 'js', 'rich-text-editor.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

test('el script nunca usa innerHTML/outerHTML/insertAdjacentHTML/document.write (CLAUDE.md §3)', () => {
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.doesNotMatch(source, /\.outerHTML\s*=/);
  assert.doesNotMatch(source, /insertAdjacentHTML\(/);
  assert.doesNotMatch(source, /document\.write\(/);
});

test('el script nunca usa document.execCommand (ronda 3: reemplazado por Selection/Range)', () => {
  assert.doesNotMatch(source, /execCommand\(/);
  assert.doesNotMatch(source, /queryCommandState\(/);
});

test('el toolbar se construye con createElement/append, nunca con un template string de HTML', () => {
  assert.match(source, /createElement\('button'\)/);
  assert.match(source, /toolbar\.append\(/);
});

test('el formateo usa Selection/Range directamente: getSelection, extractContents, insertNode', () => {
  assert.match(source, /window\.getSelection\(\)/);
  assert.match(source, /\.extractContents\(\)/);
  assert.match(source, /\.insertNode\(/);
  assert.match(source, /document\.createRange\(\)/);
});

test('ronda 4 (bug #2): los botones del toolbar NUNCA se deshabilitan — se permite elegir formato antes de tipear (estilo Word)', () => {
  assert.doesNotMatch(source, /button\.disabled\s*=\s*true/);
  assert.doesNotMatch(source, /aria-disabled/);
  assert.match(source, /ZERO_WIDTH_SPACE/);
});

test('el toggle de formato con selección real consulta el DOM (isFormatActive) en vez de un estado del browser', () => {
  assert.match(source, /function isFormatActive\(/);
  assert.match(source, /function hasAncestorTag\(/);
});

test('ronda 4 (bug #2): selección colapsada delega en toggleCollapsedFormat, y el toolbar refleja el ancestro real del cursor (collapsedAncestorTags)', () => {
  assert.match(source, /function toggleCollapsedFormat\(/);
  assert.match(source, /function collapsedAncestorTags\(/);
  assert.match(source, /range\.collapsed/);
});

test('ronda 4 (bug #1, fix del "queda pegado para siempre"): escapeEmptyAncestor corre después de extractContents y antes de reinsertar', () => {
  assert.match(source, /function escapeEmptyAncestor\(/);
  const extractIndex = source.indexOf('const fragment = range.extractContents();');
  const escapeIndex = source.indexOf('escapeEmptyAncestor(mount, range, tagName);');
  assert.ok(extractIndex > -1 && escapeIndex > -1 && escapeIndex > extractIndex);
});

test('ronda 4 (bug #2): syncTextarea nunca escribe un placeholder de puro andamiaje (buildTextareaValue clona y limpia, no muta el mount en vivo)', () => {
  assert.match(source, /function buildTextareaValue\(/);
  assert.match(source, /function stripPendingPlaceholders\(/);
  assert.match(source, /cloneNode\(true\)/);
});

test('el paste handler previene el default e inserta SOLO texto plano (nodos de texto manuales, sin execCommand)', () => {
  assert.match(source, /addEventListener\('paste'/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /text\/plain/);
  assert.match(source, /createTextNode\(/);
});

test('ronda 4 (bug #3, fix del "doble Enter"): el salto de línea se maneja en beforeinput, no en keydown', () => {
  assert.match(source, /addEventListener\('beforeinput'/);
  assert.match(source, /insertParagraph/);
  assert.match(source, /insertLineBreak/);
  // Ronda 6: `insertLineBreak` pasa a recibir `mount` como primer parámetro
  // (ver test dedicado más abajo) — se mantiene acá solo la aserción de que
  // sigue siendo la función que maneja el salto de línea vía beforeinput,
  // nunca keydown.
  assert.doesNotMatch(source, /addEventListener\('keydown'/);
});

test('rich-text-editor.js copia aria-labelledby del textarea de origen al mount (fix de label en form.ejs)', () => {
  assert.match(source, /aria-labelledby/);
});

// Ronda 6: "si el cursor está pegado a texto afectado por un formato, no
// se puede desactivar ni tipeando afuera, ni separando con espacios/Enter".
// Fix: se intercepta también `insertText`/`insertReplacementText` en
// `beforeinput` (antes SOLO se interceptaba Enter), y toda inserción de
// caracter con cursor colapsado pasa por `escapePointOutsideFormats` —
// nunca por dejar que el browser decida el límite del tag.
test('ronda 6 (fix "el formato queda pegado al tipear"): beforeinput intercepta también insertText/insertReplacementText, no solo Enter', () => {
  assert.match(source, /event\.inputType === 'insertText'/);
  assert.match(source, /insertReplacementText/);
  assert.match(source, /function escapePointOutsideFormats\(/);
  assert.match(source, /function insertTextAtCollapsedRange\(/);
  assert.match(source, /function buildFormattedNode\(/);
});

test('ronda 6: insertLineBreak ahora recibe `mount` como primer parámetro y usa escapePointOutsideFormats (fix del <br> atrapado adentro del formato activo)', () => {
  assert.match(source, /function insertLineBreak\(mount, range\)/);
  const escapeIndex = source.indexOf('function escapePointOutsideFormats(');
  const insertLineBreakIndex = source.indexOf('function insertLineBreak(mount, range)');
  assert.ok(escapeIndex > -1 && insertLineBreakIndex > -1 && escapeIndex < insertLineBreakIndex);
});

test('ronda 6: el toolbar rastrea el estado de tipeo explícitamente (typingFormatState) en vez de derivarlo siempre del ancestro DOM del cursor', () => {
  assert.match(source, /typingFormatState/);
  assert.match(source, /function currentTypingTags\(/);
  assert.match(source, /function syncTypingStateFromCursor\(/);
});

test('el script puede requerirse en Node sin `document` definido (guard interno, mismo criterio que carousel.js)', () => {
  // Si este require() ya no explotó al importarlo arriba con `document`
  // indefinido en un entorno node --test puro, el guard funciona.
  assert.ok(typeof extractPastedText === 'function');
});

test('extractPastedText: lee únicamente text/plain del DataTransfer, nunca text/html', () => {
  const dataTransfer = {
    getData(type) {
      if (type === 'text/plain') return 'texto sin formato';
      if (type === 'text/html') return '<b>con formato</b>';
      return '';
    },
  };
  assert.equal(extractPastedText(dataTransfer), 'texto sin formato');
});

test('extractPastedText: sin dataTransfer o sin getData devuelve string vacío, nunca explota', () => {
  assert.equal(extractPastedText(null), '');
  assert.equal(extractPastedText(undefined), '');
  assert.equal(extractPastedText({}), '');
});

test('buildToolbarButtons: expone exactamente los 4 comandos del allowlist (bold/italic/underline/strikeThrough)', () => {
  const buttons = buildToolbarButtons();
  const commands = buttons.map((b) => b.command);
  assert.deepEqual(commands, ['bold', 'italic', 'underline', 'strikeThrough']);
});

test('buildToolbarButtons: devuelve una copia, nunca la referencia mutable interna', () => {
  const buttons = buildToolbarButtons();
  buttons.push({ command: 'fake' });
  assert.equal(TOOLBAR_BUTTONS.length, 4, 'el array interno no debe mutarse desde afuera');
});

// Ronda 3: reemplaza el mapeo comando→tag que antes vivía implícito en
// `document.execCommand(command)` — ahora es explícito y testeable, y
// limita el editor a crear/quitar ÚNICAMENTE los 4 tags del allowlist del
// server (rich-text.js ALLOWED_TAGS).
test('TAG_BY_COMMAND: mapea cada comando al ÚNICO tag del allowlist del server que controla', () => {
  assert.deepEqual(TAG_BY_COMMAND, {
    bold: 'strong',
    italic: 'em',
    underline: 'u',
    strikeThrough: 's',
  });
});

test('TAG_BY_COMMAND: cada comando de TOOLBAR_BUTTONS tiene un tag mapeado', () => {
  buildToolbarButtons().forEach(({ command }) => {
    assert.ok(TAG_BY_COMMAND[command], `falta mapeo de tag para el comando "${command}"`);
  });
});

// QA manual bug #2/#4 (ronda 2), su causa raíz real (ronda 3: reemplazo de
// execCommand) y el contrato final (ronda 4: ya no existe un estado
// "disabled" — los botones siempre están habilitados, "activo" ahora
// también cubre el cursor colapsado adentro de un wrapper de formato,
// pendiente o con contenido real). Función pura extraída del wiring de DOM
// para poder testear la lógica de estado sin necesitar jsdom.
test('toolbarButtonPressedState: activo devuelve aria-pressed "true" y las clases a togglear', () => {
  const state = toolbarButtonPressedState(true);
  assert.equal(state.active, true);
  assert.equal(state.ariaPressed, 'true');
  assert.deepEqual(state.toggleClasses, ['bg-brand', 'text-white', 'border-brand']);
});

test('toolbarButtonPressedState: inactivo devuelve aria-pressed "false"', () => {
  const state = toolbarButtonPressedState(false);
  assert.equal(state.active, false);
  assert.equal(state.ariaPressed, 'false');
});

test('toolbarButtonPressedState: sin argumento (undefined) se trata como inactivo, nunca explota', () => {
  const state = toolbarButtonPressedState();
  assert.equal(state.active, false);
  assert.equal(state.ariaPressed, 'false');
});

test('toolbarButtonPressedState: devuelve una copia del array de clases, nunca la referencia interna', () => {
  const state = toolbarButtonPressedState(true);
  state.toggleClasses.push('fake');
  const state2 = toolbarButtonPressedState(true);
  assert.equal(state2.toggleClasses.length, 3, 'el array interno de clases activas no debe mutarse desde afuera');
});

// Ronda 4: TAG_LIST y ZERO_WIDTH_SPACE son las piezas nuevas que sostienen
// el flujo "elegir formato antes de tipear" (bug #2) — se exportan para
// poder testear con jsdom sin duplicar el literal del ZWSP en el test.
test('TAG_LIST: expone exactamente los 4 tags del allowlist, derivados de TAG_BY_COMMAND', () => {
  assert.deepEqual(TAG_LIST.slice().sort(), ['em', 's', 'strong', 'u']);
});

test('ZERO_WIDTH_SPACE: es el único carácter U+200B, nunca un espacio normal ni un string vacío', () => {
  assert.equal(ZERO_WIDTH_SPACE.length, 1);
  assert.equal(ZERO_WIDTH_SPACE.codePointAt(0), 0x200b);
});

// QA manual bug #3 (el mount contenteditable vacío colapsaba a una línea,
// perdiendo el área clickeable de un textarea normal de varias filas).
test('computeMountMinHeight: deriva la altura mínima de `rows` del textarea original', () => {
  assert.equal(computeMountMinHeight(8), '12em');
  assert.equal(computeMountMinHeight(4), '6em');
});

test('computeMountMinHeight: sin `rows` válido usa un default razonable en vez de colapsar a 0', () => {
  assert.equal(computeMountMinHeight(0), '6em');
  assert.equal(computeMountMinHeight(undefined), '6em');
  assert.equal(computeMountMinHeight(NaN), '6em');
  assert.equal(computeMountMinHeight(-1), '6em');
});
