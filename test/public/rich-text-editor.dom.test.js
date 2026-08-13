// Ronda 4 de QA manual: jsdom se agrega recién esta ronda como
// devDependency (ver package.json) precisamente porque 3 rondas seguidas
// de bugfixes sobre la lógica de Selection/Range de rich-text-editor.js se
// basaron 100% en QA manual en navegador real, y cada ronda encontró un
// bug sutil nuevo. jsdom SÍ implementa `Range`, `Selection` y
// `TreeWalker` (a diferencia de `document.execCommand`, que jsdom NO
// implementa — irrelevante desde ronda 3, que ya sacó todo uso de
// execCommand del archivo). Esto permite testear `toggleFormat`,
// `isFormatActive`, `hasAncestorTag`, `unwrapTagInFragment`,
// `escapeEmptyAncestor` y la manipulación de Range de línea/paste de forma
// genuina, construyendo nodos DOM y objetos Range/Selection reales, sin
// necesitar un browser real.
//
// Lo que jsdom NO puede simular: tipeo real de teclado (el pipeline nativo
// de `beforeinput`/`input` de un browser real) ni renderizado visual — esos
// aspectos siguen siendo QA-manual-only y se marcan explícitamente como
// tales en cada test relacionado, más abajo y en el reporte de esta ronda.
//
// IMPORTANTE: este archivo requiere `jsdom` (ver package.json
// devDependencies, agregado esta ronda). Si `npm install` no corrió desde
// Windows todavía, este archivo completo falla con
// "Cannot find module 'jsdom'" — es el comportamiento esperado hasta ese
// paso, no una regresión.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const MODULE_PATH = require.resolve('../../src/public/js/rich-text-editor.js');

// El módulo bajo test también es requerido, SIN jsdom, por
// rich-text-editor.test.js (el archivo de funciones puras). Si ambos
// archivos corrieran en el mismo proceso Node con el require cache
// compartido, la segunda carga devolvería el módulo YA evaluado (sin
// `document` global todavía definido en ese momento) en vez de re-evaluar
// el guard `if (typeof document !== 'undefined')` con jsdom ya instalado
// como global — se limpia el cache explícitamente antes de cada require
// para que este archivo sea correcto sin importar el modelo de aislamiento
// entre archivos de `node --test`.
function freshModule() {
  delete require.cache[MODULE_PATH];
  return require(MODULE_PATH);
}

// Crea un `document`/`window` de jsdom nuevo y los expone como globales —
// necesario porque el módulo bajo test usa `document`/`window`/`Node`/
// `NodeFilter` como globales (mismo patrón que si corriera en un browser
// real), no como parámetros inyectados.
function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.NodeFilter = dom.window.NodeFilter;
  return dom;
}

function selectRangeOverText(textNode, start, end) {
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return { range, selection };
}

function collapseCursorAt(container, offset) {
  const range = document.createRange();
  range.setStart(container, offset);
  range.setEnd(container, offset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return { range, selection };
}

// ---------------------------------------------------------------------
// Bug #1 (crítico): "si activo Negrita al menos una vez, Negrita queda
// activo siempre y no se puede desactivar ni para texto seleccionado ni
// para texto nuevo."
// ---------------------------------------------------------------------

test('BUG #1 (crítico): togglear Negrita dos veces sobre la MISMA selección la desactiva por completo, sin ningún <strong> residual', () => {
  setupDom();
  const { toggleFormat } = freshModule();

  const mount = document.createElement('div');
  mount.textContent = 'hola mundo';
  document.body.appendChild(mount);

  // Selecciona "hola" (offsets 0-4 del único text node) y aplica Negrita.
  selectRangeOverText(mount.firstChild, 0, 4);
  toggleFormat(mount, 'strong');
  assert.equal(mount.innerHTML, '<strong>hola</strong> mundo', 'primera aplicación de negrita');

  // Re-selecciona el MISMO texto, ahora en negrita, y togglea de nuevo.
  // Antes del fix (ronda 4): `range.extractContents()` dejaba el <strong>
  // original VACÍO en el DOM (la selección cubría exactamente todo su
  // texto, no el elemento en sí) y el range colapsado seguía apuntando
  // ADENTRO de ese <strong> vacío; `unwrapTagInFragment` no encontraba
  // ningún <strong> DENTRO del fragmento extraído (se había quedado atrás)
  // y el texto "desenvuelto" terminaba reinsertándose adentro del mismo
  // <strong> vacío, reconstruyéndolo — de ahí "queda pegado para
  // siempre". El fix (`escapeEmptyAncestor`) remueve ese ancestro vacío y
  // reposiciona el punto de inserción afuera ANTES de reinsertar.
  const boldTextNode = mount.querySelector('strong').firstChild;
  selectRangeOverText(boldTextNode, 0, boldTextNode.data.length);
  toggleFormat(mount, 'strong');

  assert.equal(mount.querySelectorAll('strong').length, 0, 'no debe quedar ningún <strong> residual');
  assert.equal(mount.textContent, 'hola mundo');
  assert.equal(mount.innerHTML, 'hola mundo', 'debe volver a texto plano puro, sin ningún tag');
});

test('BUG #1 (crítico): una vez desactivada, Negrita se puede volver a activar sobre la misma selección (no queda en un estado roto)', () => {
  setupDom();
  const { toggleFormat } = freshModule();

  const mount = document.createElement('div');
  mount.textContent = 'hola mundo';
  document.body.appendChild(mount);

  selectRangeOverText(mount.firstChild, 0, 4);
  toggleFormat(mount, 'strong'); // on
  const boldTextNode = mount.querySelector('strong').firstChild;
  selectRangeOverText(boldTextNode, 0, boldTextNode.data.length);
  toggleFormat(mount, 'strong'); // off

  // Selecciona "hola" de nuevo (ahora plano) y activa negrita una vez más.
  selectRangeOverText(mount.firstChild, 0, 4);
  toggleFormat(mount, 'strong'); // on de nuevo

  assert.equal(mount.querySelectorAll('strong').length, 1);
  assert.equal(mount.querySelector('strong').textContent, 'hola');
});

test('BUG #1 (investigación — segunda mitad del reporte): isFormatActive NUNCA reporta activo para una selección de texto plano no relacionada, después de un negrita previo en otra parte', () => {
  setupDom();
  const { toggleFormat, isFormatActive } = freshModule();

  const mount = document.createElement('div');
  mount.textContent = 'hola mundo';
  document.body.appendChild(mount);

  selectRangeOverText(mount.firstChild, 0, 4);
  toggleFormat(mount, 'strong'); // "hola" -> <strong>hola</strong>

  // " mundo" (el texto que sigue al <strong>) nunca fue tocado.
  const plainTextNode = mount.lastChild;
  assert.equal(plainTextNode.data, ' mundo');
  const range = document.createRange();
  range.setStart(plainTextNode, 1); // "mundo", sin el espacio inicial
  range.setEnd(plainTextNode, plainTextNode.data.length);

  assert.equal(
    isFormatActive(mount, range, 'strong'),
    false,
    'texto nunca bold no debe reportarse como activo solo porque OTRO texto del mismo mount sí lo está',
  );
});

test('escapeEmptyAncestor: si el punto de inserción queda dentro de un ancestro vacío del mismo tag, lo remueve y reposiciona el range afuera', () => {
  setupDom();
  const { escapeEmptyAncestor } = freshModule();

  const mount = document.createElement('div');
  const strong = document.createElement('strong'); // vacío
  mount.appendChild(strong);
  document.body.appendChild(mount);

  const range = document.createRange();
  range.setStart(strong, 0);
  range.setEnd(strong, 0);

  escapeEmptyAncestor(mount, range, 'strong');

  assert.equal(mount.querySelectorAll('strong').length, 0, 'el <strong> vacío debe desaparecer');
  assert.equal(range.startContainer, mount, 'el range reposicionado debe quedar en el padre, afuera del tag vacío');
});

test('escapeEmptyAncestor: detecta un ancestro "vacío de contenido" aunque conserve un nodo de texto residual con data \'\' (comportamiento real de extractContents, no un <strong> literalmente sin hijos)', () => {
  setupDom();
  const { escapeEmptyAncestor } = freshModule();

  // Reproduce EXACTAMENTE lo que deja `Range.extractContents()` al extraer
  // TODO el contenido de un nodo de texto: por spec de DOM, no borra el
  // nodo de texto, solo lo deja con `data === ''` (`replaceData`, no
  // `removeChild`) — un chequeo ingenuo de `childNodes.length === 0`
  // nunca detecta este caso real.
  const mount = document.createElement('div');
  const strong = document.createElement('strong');
  const emptyText = document.createTextNode('');
  strong.appendChild(emptyText);
  mount.appendChild(strong);
  document.body.appendChild(mount);

  const range = document.createRange();
  range.setStart(emptyText, 0);
  range.setEnd(emptyText, 0);

  escapeEmptyAncestor(mount, range, 'strong');

  assert.equal(mount.querySelectorAll('strong').length, 0, 'el <strong> "vacío de contenido" debe removerse aunque conserve un nodo de texto residual');
  assert.equal(range.startContainer, mount);
});

test('escapeEmptyAncestor: no toca un ancestro del mismo tag que SÍ tiene contenido (no es "vacío")', () => {
  setupDom();
  const { escapeEmptyAncestor } = freshModule();

  const mount = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = 'a';
  mount.appendChild(strong);
  document.body.appendChild(mount);

  const range = document.createRange();
  range.setStart(strong, 0);
  range.setEnd(strong, 0);

  escapeEmptyAncestor(mount, range, 'strong');

  assert.equal(mount.querySelectorAll('strong').length, 1, 'un ancestro con contenido real nunca debe removerse');
});

// ---------------------------------------------------------------------
// Bug #2: formatear antes de tipear (estilo Word), sin volver a
// execCommand ni rastrear estado fuera del DOM.
// ---------------------------------------------------------------------

test('BUG #2: togglear formato con el cursor colapsado crea un wrapper vacío con ZWSP y deja el cursor adentro', () => {
  setupDom();
  const { toggleFormat, ZERO_WIDTH_SPACE } = freshModule();

  const mount = document.createElement('div');
  document.body.appendChild(mount);
  collapseCursorAt(mount, 0);

  toggleFormat(mount, 'strong');

  const strong = mount.querySelector('strong');
  assert.ok(strong, 'debe crear un <strong> vacío pendiente');
  assert.equal(strong.textContent, ZERO_WIDTH_SPACE);

  const sel = window.getSelection();
  const range = sel.getRangeAt(0);
  assert.equal(range.collapsed, true);
  assert.equal(range.startContainer, strong.firstChild, 'el cursor debe quedar DENTRO del wrapper, después del ZWSP');
  assert.equal(range.startOffset, 1);
});

test('BUG #2: togglear el MISMO formato dos veces con el cursor colapsado (sin tipear nada en el medio) lo desactiva — desenvuelve el wrapper pendiente', () => {
  setupDom();
  const { toggleFormat } = freshModule();

  const mount = document.createElement('div');
  document.body.appendChild(mount);
  collapseCursorAt(mount, 0);

  toggleFormat(mount, 'strong');
  toggleFormat(mount, 'strong');

  assert.equal(mount.querySelectorAll('strong').length, 0);
  assert.equal(mount.childNodes.length, 0, 'no debe quedar ningún nodo huérfano (ni el ZWSP suelto)');
});

test('BUG #2: click Negrita y después Cursiva con el cursor todavía colapsado anida el wrapper nuevo DENTRO del anterior', () => {
  setupDom();
  const { toggleFormat } = freshModule();

  const mount = document.createElement('div');
  document.body.appendChild(mount);
  collapseCursorAt(mount, 0);

  toggleFormat(mount, 'strong');
  toggleFormat(mount, 'em');

  const strong = mount.querySelector('strong');
  const em = mount.querySelector('em');
  assert.ok(strong && em, 'ambos wrappers deben existir');
  assert.ok(strong.contains(em), 'el <em> debe quedar anidado DENTRO del <strong> pendiente');
  assert.equal(strong.children.length, 1, 'el <strong> no debe conservar su propio ZWSP suelto una vez que anida un hijo');

  const sel = window.getSelection();
  const range = sel.getRangeAt(0);
  assert.equal(range.startContainer, em.firstChild, 'el cursor debe terminar adentro del wrapper más interno (em)');
});

test('BUG #2: desactivar el formato más interno de una cadena anidada deja el formato exterior todavía pendiente (con su propio ZWSP repuesto)', () => {
  setupDom();
  const { toggleFormat, isPendingWrapper } = freshModule();

  const mount = document.createElement('div');
  document.body.appendChild(mount);
  collapseCursorAt(mount, 0);

  toggleFormat(mount, 'strong');
  toggleFormat(mount, 'em'); // <strong><em>ZWSP</em></strong>
  toggleFormat(mount, 'em'); // toggle off del más interno

  const strong = mount.querySelector('strong');
  assert.ok(strong, 'el <strong> exterior debe seguir existiendo, todavía pendiente');
  assert.equal(mount.querySelectorAll('em').length, 0, 'el <em> interior debe haber desaparecido');
  assert.ok(isPendingWrapper(strong), 'el <strong> exterior debe seguir siendo un wrapper pendiente válido (con su propio ZWSP)');
});

test('BUG #2: buildTextareaValue NUNCA incluye un wrapper placeholder cuyo único contenido sea un ZWSP sin consumir', () => {
  setupDom();
  const { toggleFormat, buildTextareaValue } = freshModule();

  const mount = document.createElement('div');
  document.body.appendChild(mount);
  collapseCursorAt(mount, 0);

  toggleFormat(mount, 'strong');
  toggleFormat(mount, 'em'); // negrita + cursiva elegidas, nunca se tipeó nada

  const value = buildTextareaValue(mount);
  assert.equal(value, '', 'el placeholder de puro andamiaje UI nunca debe llegar al valor guardado');

  // El DOM EN VIVO del editor conserva el wrapper — si se borrara del
  // mount real, la dueña perdería el cursor/la posición donde estaba a
  // punto de tipear.
  assert.ok(mount.querySelector('strong'), 'el wrapper pendiente debe seguir vivo en el mount real');
});

test('BUG #2: si la dueña efectivamente tipeó después de elegir un formato, ese contenido real SÍ se guarda', () => {
  setupDom();
  const { toggleFormat, buildTextareaValue } = freshModule();

  const mount = document.createElement('div');
  document.body.appendChild(mount);
  collapseCursorAt(mount, 0);

  toggleFormat(mount, 'strong');
  // Simula tipeo real: el navegador inserta el caracter tipeado en el
  // nodo de texto donde está el cursor (que quedó posicionado justo
  // después del ZWSP, adentro del wrapper) — remplaza el ZWSP por
  // contenido real, tal como haría `insertText` nativo del browser.
  const strong = mount.querySelector('strong');
  strong.firstChild.data = 'x';

  const value = buildTextareaValue(mount);
  assert.equal(value, '<strong>x</strong>');
});

test('BUG #2 (requisito de reset del toolbar): collapsedAncestorTags refleja el formato REAL del ancestro en el punto del cursor, no un toggle pendiente de otra posición', () => {
  setupDom();
  const { collapsedAncestorTags } = freshModule();

  const mount = document.createElement('div');
  mount.innerHTML = '<strong>hola</strong> mundo';
  document.body.appendChild(mount);

  const boldText = mount.querySelector('strong').firstChild;
  const plainText = mount.lastChild;

  assert.ok(collapsedAncestorTags(mount, boldText).has('strong'), 'cursor adentro de texto bold real -> activo');
  assert.equal(
    collapsedAncestorTags(mount, plainText).has('strong'),
    false,
    'cursor en texto plano no relacionado -> NO activo, sin importar formato elegido en otra posición antes',
  );
});

// ---------------------------------------------------------------------
// Bug #3: Enter requería 2 pulsaciones para un solo salto de línea.
// La lógica de inserción en sí (`insertLineBreak`) SÍ es testeable con
// jsdom. El pipeline real de eventos de teclado de un browser (keydown ->
// beforeinput -> input nativos, encadenados) NO lo es — jsdom no lo
// implementa — así que la corrección definitiva de "un solo Enter = un
// solo <br> en el browser real" queda como QA manual obligatoria, ver
// reporte de esta ronda.
// ---------------------------------------------------------------------

test('BUG #3: insertLineBreak — una sola invocación inserta EXACTAMENTE un <br>, nunca dos, y el cursor queda justo después', () => {
  setupDom();
  const { insertLineBreak } = freshModule();

  const mount = document.createElement('div');
  mount.textContent = 'hola mundo';
  document.body.appendChild(mount);

  const textNode = mount.firstChild;
  const range = document.createRange();
  range.setStart(textNode, 4); // justo después de "hola"
  range.setEnd(textNode, 4);

  const newRange = insertLineBreak(mount, range);

  assert.equal(mount.querySelectorAll('br').length, 1, 'una sola invocación debe producir EXACTAMENTE un <br>');
  assert.equal(mount.innerHTML, 'hola<br> mundo');
  assert.equal(newRange.collapsed, true);
  assert.equal(newRange.startContainer, mount, 'el cursor debe quedar en el padre, justo después del <br>');
});

test('BUG #3: dos invocaciones independientes de insertLineBreak producen dos <br> distintos (nunca se pisan ni se duplican solos)', () => {
  setupDom();
  const { insertLineBreak } = freshModule();

  const mount = document.createElement('div');
  mount.textContent = 'a';
  document.body.appendChild(mount);

  const textNode = mount.firstChild;
  const range1 = document.createRange();
  range1.setStart(textNode, 1);
  range1.setEnd(textNode, 1);
  const afterFirst = insertLineBreak(mount, range1);

  const range2 = document.createRange();
  range2.setStart(afterFirst.startContainer, afterFirst.startOffset);
  range2.setEnd(afterFirst.startContainer, afterFirst.startOffset);
  insertLineBreak(mount, range2);

  assert.equal(mount.querySelectorAll('br').length, 2);
});

// ---------------------------------------------------------------------
// Selección multi-run / cross-boundary — cobertura adicional del
// algoritmo Selection/Range general (no un bug reportado puntual, pero
// directamente relevante al fix de bug #1).
// ---------------------------------------------------------------------

test('toggleFormat: envolver una selección de texto plano que cruza el borde de un <em> existente no corrompe el <em>', () => {
  setupDom();
  const { toggleFormat } = freshModule();

  const mount = document.createElement('div');
  mount.innerHTML = 'uno <em>dos</em> tres';
  document.body.appendChild(mount);

  // Selecciona desde el medio de "uno " hasta el medio de "dos" (cruza el
  // borde de entrada del <em>).
  const plainBefore = mount.firstChild; // "uno "
  const em = mount.querySelector('em');
  const range = document.createRange();
  range.setStart(plainBefore, 1); // "no "
  range.setEnd(em.firstChild, 2); // "do" de "dos"
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  toggleFormat(mount, 'strong');

  // `extractContents()` puede clonar/partir el <em> en el borde de la
  // selección (comportamiento estándar de Range al cruzar un elemento
  // parcialmente) — no se asume una cantidad exacta de nodos <em>
  // resultantes, solo que el texto plano nunca se altera y que "dos"
  // sigue estando marcado como <em> en algún lado (nunca se pierde el
  // formato original al aplicar uno nuevo encima).
  assert.equal(mount.textContent, 'uno dos tres', 'el texto plano nunca debe alterarse, solo el marcado');
  const emText = Array.from(mount.querySelectorAll('em'))
    .map((el) => el.textContent)
    .join('');
  assert.equal(emText, 'dos', 'el texto que originalmente era <em> sigue estando envuelto en <em> en algún lado');
});

// ---------------------------------------------------------------------
// Ronda 6: "si el cursor está pegado a texto en negrita, desactivar
// Negrita no funciona ni escribiendo afuera, ni separando con espacios o
// Enter — solo seleccionando el texto manualmente." Reproduce el repro
// EXACTO de la dueña a nivel de función, invocando directamente
// `insertTextAtCollapsedRange` (la función que ahora es dueña de la
// inserción de caracteres, disparada desde `beforeinput`/`insertText` en
// el wiring real) en vez de simular tipeo nativo real (jsdom no puede: ver
// comentario de cabecera de este archivo y del archivo fuente).
// ---------------------------------------------------------------------

test('RONDA 6 (crítico, repro exacto de la dueña): tipear con un formato activo cae adentro del tag correspondiente', () => {
  setupDom();
  const { insertTextAtCollapsedRange } = freshModule();

  const mount = document.createElement('div');
  document.body.appendChild(mount);

  const { range } = collapseCursorAt(mount, 0);
  const result = insertTextAtCollapsedRange(mount, range, 'bold', new Set(['strong']));

  assert.equal(mount.innerHTML, '<strong>bold</strong>');
  assert.equal(result.textNode.data, 'bold');
  assert.equal(result.offset, 4);
});

test('RONDA 6 (crítico, repro exacto de la dueña): togglear el formato OFF y seguir tipeando CON EL CURSOR TODAVÍA PEGADO al texto recién tipeado deja el texto nuevo REALMENTE afuera del tag, por construcción', () => {
  setupDom();
  const { insertTextAtCollapsedRange, hasAncestorTag } = freshModule();

  const mount = document.createElement('div');
  document.body.appendChild(mount);

  // 1. Tipear "bold" con negrita activa (equivalente a haber clickeado
  //    Negrita antes de tipear, estado de tipeo = {strong}).
  const first = insertTextAtCollapsedRange(mount, collapseCursorAt(mount, 0).range, 'bold', new Set(['strong']));
  assert.equal(mount.innerHTML, '<strong>bold</strong>');

  // 2. La dueña clickea Negrita para apagarla — el cursor real del DOM NO
  //    se movió ni un pixel, sigue colapsado justo después de "bold",
  //    ADENTRO del <strong> (exactamente lo que reportó: "pegado" al
  //    texto afectado). Se arma ese mismo Range colapsado a mano.
  const stillInsideStrong = document.createRange();
  stillInsideStrong.setStart(first.textNode, first.offset);
  stillInsideStrong.setEnd(first.textNode, first.offset);
  assert.equal(
    hasAncestorTag(mount, stillInsideStrong.startContainer, 'strong'),
    true,
    'precondición del repro: el cursor real sigue estructuralmente adentro del <strong>',
  );

  // 3. Tipea " plano" con el estado de tipeo ya en {} (negrita apagada).
  const second = insertTextAtCollapsedRange(mount, stillInsideStrong, ' plano', new Set());

  assert.equal(mount.querySelectorAll('strong').length, 1, 'el <strong> original con "bold" debe seguir intacto, sin duplicarse ni corromperse');
  assert.equal(mount.querySelector('strong').textContent, 'bold', 'el texto ya tipeado en negrita nunca se toca');
  assert.equal(
    hasAncestorTag(mount, second.textNode, 'strong'),
    false,
    'el texto tipeado DESPUÉS de apagar negrita no debe quedar adentro del <strong>, aunque el cursor estuviera pegado a él',
  );
  assert.equal(mount.textContent, 'bold plano');
  assert.equal(mount.innerHTML, '<strong>bold</strong> plano');
});

test('RONDA 6: separar con un espacio (formato todavía "pegado" en el estado de tipeo) tampoco atrapa el texto siguiente una vez que el estado de tipeo pasó a {}', () => {
  setupDom();
  const { insertTextAtCollapsedRange, hasAncestorTag } = freshModule();

  const mount = document.createElement('div');
  document.body.appendChild(mount);

  const bold = insertTextAtCollapsedRange(mount, collapseCursorAt(mount, 0).range, 'bold', new Set(['strong']));
  const afterBold = document.createRange();
  afterBold.setStart(bold.textNode, bold.offset);
  afterBold.setEnd(bold.textNode, bold.offset);

  // La dueña reportó que ni un espacio de separación alcanzaba a "cortar"
  // el pegoteo — se prueba explícitamente insertando un espacio CON el
  // formato ya apagado, seguido de más texto plano.
  const space = insertTextAtCollapsedRange(mount, afterBold, ' ', new Set());
  const afterSpace = document.createRange();
  afterSpace.setStart(space.textNode, space.offset);
  afterSpace.setEnd(space.textNode, space.offset);
  const plain = insertTextAtCollapsedRange(mount, afterSpace, 'plano', new Set());

  assert.equal(hasAncestorTag(mount, plain.textNode, 'strong'), false);
  assert.equal(mount.innerHTML, '<strong>bold</strong> plano');
});

test('RONDA 6 (bug lateral confirmado): insertLineBreak inserta el <br> AFUERA de cualquier ancestro de formato abierto, nunca atrapado adentro', () => {
  setupDom();
  const { insertTextAtCollapsedRange, insertLineBreak, hasAncestorTag } = freshModule();

  const mount = document.createElement('div');
  document.body.appendChild(mount);

  const bold = insertTextAtCollapsedRange(mount, collapseCursorAt(mount, 0).range, 'bold', new Set(['strong']));
  const atEnd = document.createRange();
  atEnd.setStart(bold.textNode, bold.offset);
  atEnd.setEnd(bold.textNode, bold.offset);

  const afterBr = insertLineBreak(mount, atEnd);
  const br = mount.querySelector('br');
  assert.ok(br, 'debe insertar exactamente un <br>');
  assert.equal(
    hasAncestorTag(mount, br, 'strong'),
    false,
    'el <br> debe quedar AFUERA del <strong> activo en el punto del cursor, nunca atrapado adentro',
  );
  assert.equal(mount.innerHTML, '<strong>bold</strong><br>');

  // Y el texto tipeado DESPUÉS del <br>, con el formato ya apagado, tampoco
  // debe quedar adentro del <strong> — mismo repro que la dueña reportó
  // ("separar con un salto de línea tampoco ayuda").
  const plain = insertTextAtCollapsedRange(mount, afterBr, 'plano', new Set());
  assert.equal(hasAncestorTag(mount, plain.textNode, 'strong'), false);
  assert.equal(mount.innerHTML, '<strong>bold</strong><br>plano');
});

test('RONDA 6: escapePointOutsideFormats parte una cadena anidada de formatos (<strong><em>) hasta llegar afuera de AMBOS, sin perder el contenido existente', () => {
  setupDom();
  const { escapePointOutsideFormats } = freshModule();

  const mount = document.createElement('div');
  mount.innerHTML = '<strong><em>bold-italic</em></strong>';
  document.body.appendChild(mount);

  const emTextNode = mount.querySelector('em').firstChild;
  const point = escapePointOutsideFormats(mount, emTextNode, emTextNode.data.length);

  assert.equal(point.parent, mount, 'el punto de escape debe terminar directamente en mount, afuera de <strong> Y <em>');
  assert.equal(mount.querySelector('strong').textContent, 'bold-italic', 'el contenido original no debe alterarse');
  assert.equal(mount.querySelectorAll('strong').length, 1, 'no debe duplicar el <strong> cuando el cursor está al final (nada que partir del lado derecho)');
});

test('RONDA 6: escapePointOutsideFormats partiendo en el MEDIO de un ancestro de formato conserva ambas mitades como hermanos separados, en el orden correcto', () => {
  setupDom();
  const { escapePointOutsideFormats, insertTextAtCollapsedRange } = freshModule();

  const mount = document.createElement('div');
  mount.innerHTML = '<strong>boldtext</strong>';
  document.body.appendChild(mount);

  const boldTextNode = mount.querySelector('strong').firstChild;
  // Cursor justo en el medio de "boldtext": "bold" | "text".
  const midRange = document.createRange();
  midRange.setStart(boldTextNode, 4);
  midRange.setEnd(boldTextNode, 4);

  const plain = insertTextAtCollapsedRange(mount, midRange, '-plano-', new Set());

  assert.equal(mount.textContent, 'bold-plano-text');
  assert.equal(mount.querySelectorAll('strong').length, 2, 'debe partir el <strong> original en dos mitades');
  const strongs = Array.from(mount.querySelectorAll('strong'));
  assert.equal(strongs[0].textContent, 'bold');
  assert.equal(strongs[1].textContent, 'text');
});
