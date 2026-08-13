// Editor de texto enriquecido acotado (design.md "Rich-text editor
// contract"): progresiva mejora sobre un <textarea> real (funciona sin JS,
// texto plano se guarda igual). Nunca usa innerHTML/outerHTML/
// insertAdjacentHTML/document.write con datos dinámicos (CLAUDE.md §3) — el
// toolbar se arma con createElement/append, y el ÚNICO HTML que entra al
// contenteditable en el arranque ya vino sanitizado del server
// (`sanitizeInline`, form.ejs) — el editor nunca vuelve a sanitizar, ese
// límite de seguridad es exclusivamente server-side (design.md D5/D6,
// spec constrained-rich-text "client editor is a convenience, never the
// security boundary").
//
// Ronda 3 de QA manual (post fase 7): `document.execCommand` quedó
// completamente eliminado de este archivo. Motivo — es una API deprecada
// cuyo estado interno ("typing style" fantasma, mutuamente-exclusividad
// espuria entre comandos, ambigüedad en los bordes de un run formateado)
// resultó estructuralmente no confiable, no un bug puntual parcheable. El
// reemplazo manipula directamente `Selection`/`Range`, sin depender de
// ningún estado de formato rastreado por el browser.
//
// Ronda 4 de QA manual — 4 bugs nuevos sobre esa base de Selection/Range:
//   1. (crítico) Negrita quedaba pegada para siempre y no se podía
//      desactivar. Causa raíz real (comprobada con jsdom, ver
//      test/public/rich-text-editor.dom.test.js): al togglear formato
//      sobre una selección que cubre EXACTAMENTE todo el texto de un
//      <strong>, `range.extractContents()` deja el <strong> original
//      VACÍO en el DOM (la selección estaba adentro del texto, no
//      "afuera" del elemento) y el range colapsado que devuelve sigue
//      apuntando ADENTRO de ese <strong> vacío. `unwrapTagInFragment` no
//      encuentra ningún <strong> en el fragmento extraído (el <strong> se
//      quedó atrás, vacío, no viajó con el contenido) y hace un no-op; el
//      texto plano recién "desenvuelto" termina reinsertándose adentro del
//      mismo <strong> vacío que quedó de residuo, reconstruyéndolo. Fix:
//      `escapeEmptyAncestor` detecta ese ancestro vacío del mismo tag justo
//      después de extraer y lo remueve, reposicionando el punto de
//      inserción afuera, ANTES de reinsertar el contenido desenvuelto.
//   2. Los botones del toolbar ya no se deshabilitan sin selección — se
//      habilita el flujo "elegir formato antes de tipear" (estilo Word) vía
//      un wrapper vacío con un espacio de ancho cero (ZWSP, `​`) en el
//      punto del cursor; el tipeo nativo cae naturalmente adentro de ese
//      wrapper porque ahí quedó posicionado el cursor. Nunca se vuelve a
//      rastrear "estilo de tipeo" fuera del DOM real — el propio wrapper
//      ES el estado, no una bandera en JS.
//   3. Enter requería 2 pulsaciones para un solo salto de línea. La
//      inserción manual de <br> se movió de `keydown` (que solo puede
//      prevenir el evento de teclado, no necesariamente todo el pipeline
//      nativo de mutación de un contenteditable) a `beforeinput` con
//      `inputType: 'insertParagraph'/'insertLineBreak'` — el evento
//      correcto del pipeline de Input Events Level 2 para cancelar
//      confiablemente la mutación nativa antes de que ocurra.
//   4. Bug de accesibilidad de label, esta vez en "Título" (ver form.ejs):
//      mismo problema que Descripción en ronda 3, mismo fix.
//
// Ronda 6 de QA manual (navegador real, después de que ronda 5 dejó los 574
// tests automatizados en verde) — bug recurrente: "si el cursor está pegado
// a texto afectado por un formato, no se puede desactivar ni tipeando fuera
// de ese texto, ni siquiera separando con espacios o Enter; SOLO
// seleccionando el texto manualmente se puede desactivar". Causa raíz real
// (misma clase de problema que motivó ronda 3, resurgiendo por una vía
// distinta): rondas 4/5 solo interceptan `beforeinput` para Enter
// (`insertParagraph`/`insertLineBreak`) — el TIPEO normal de caracteres
// nunca se interceptó en ningún lado, lo maneja 100% el pipeline nativo del
// browser. Eso significa que es el propio browser, con su heurística
// interna (y notoriamente inconsistente entre motores) de "adentro/afuera
// de un límite de tag" en el punto del cursor colapsado, quien decide en
// qué elemento cae cada caracter tipeado — nuestro estado de formato
// rastreado en JS (el wrapper pendiente de ronda 4) nunca tuvo ninguna
// influencia sobre texto tipeado NATIVAMENTE una vez que ya hay contenido
// real (no ZWSP) en el punto del cursor. Clickear "Negrita" para
// desactivarla con el cursor pegado al final del texto recién tipeado en
// negrita no cambia en nada la posición real del cursor nativo, que sigue
// "adentro" del `<strong>` a ojos del browser — de ahí que ni un espacio ni
// un `<br>` (si el `<br>` mismo queda insertado ADENTRO del `<strong>`, ver
// más abajo) alcancen para escapar.
//
// Fix: se extiende la intercepción de `beforeinput` para manejar TAMBIÉN
// `inputType: 'insertText'`/`'insertReplacementText'` con selección
// colapsada — `event.preventDefault()`, se lee `event.data` (el/los
// caracter(es) a insertar) y se construye la inserción a mano con Range
// APIs, envolviendo el texto en los tags que indique el estado de formato
// RASTREADO explícitamente por el wiring (`typingFormatState`, ver más
// abajo — nunca leído del ancestro DOM en el punto del cursor, que es
// precisamente la fuente de la inconsistencia). `escapePointOutsideFormats`
// es la pieza nueva clave: dado un punto de cursor colapsado, parte
// (`Text.splitText`) y escala hacia afuera CUALQUIER ancestro de formato
// (`TAG_LIST`) hasta `mount`, devolviendo un punto de inserción que
// estructuralmente NUNCA queda adentro de un tag de formato que no esté en
// el set de tags pedido — por construcción, no por adivinar el estado
// interno del browser. `insertLineBreak` (bug lateral confirmado: el
// `<br>` manual de ronda 4 SÍ quedaba insertado adentro de cualquier
// ancestro de formato abierto, porque `Range.insertNode()` inserta en el
// mismo padre del container sin escalar hacia afuera) se actualiza para
// usar el mismo `escapePointOutsideFormats` — ahora recibe `mount` como
// primer parámetro (cambio de contrato intencional, mismo criterio que el
// cambio de `toolbarButtonPressedState` en ronda 4).
//
// Composición IME (`insertCompositionText`) queda explícitamente FUERA de
// alcance de este fix — sigue cayendo al pipeline nativo sin interceptar,
// riesgo ya señalado en rondas previas y que se reitera acá: tipeo por IME
// puede seguir teniendo el mismo problema de "límite de tag" que este
// fix resuelve para tipeo directo de teclado/`insertText`. QA manual
// pendiente de la dueña para confirmar tipeo real de teclado (jsdom no
// puede simular el pipeline nativo `beforeinput`→mutación real de un
// browser, solo la lógica de inserción en sí — mismo límite ya documentado
// en ronda 4 para Enter).
//
// Mismo criterio pragmático que carousel.js/menu-animate.js: las funciones
// puras viven FUERA del guard de `document` — se referencian `document`/
// `window`/`Node`/`NodeFilter` solo DENTRO del cuerpo de cada función (en
// tiempo de llamada, no de carga del módulo), así el archivo se puede
// requerir sin explotar en un `node --test` sin DOM. A partir de ronda 4
// estas funciones ya NO dependen de un `mount` cerrado por clausura: reciben
// `mount` como parámetro explícito, precisamente para poder testearlas con
// jsdom (test/public/rich-text-editor.dom.test.js) construyendo un
// `mount` de prueba sin tener que levantar el wiring completo de
// `querySelectorAll('[data-rich-text-source]')`.

// Mapeo comando→tag: los ÚNICOS 4 tags que este editor puede crear o
// remover (allowlist del server en rich-text.js). Los formatos combinan
// por anidamiento (bold+italic = <strong><em>...</em></strong> o al
// revés, ambos órdenes son válidos y el server los acepta igual).
const TAG_BY_COMMAND = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strikeThrough: 's',
};

const TAG_LIST = Object.values(TAG_BY_COMMAND);

// Carácter usado como contenido "placeholder" de un wrapper de formato
// elegido ANTES de tipear (ronda 4, bug #2) — invisible mismo en el
// contenteditable real, pero ocupa un nodo de texto real donde el cursor
// puede posicionarse (un elemento inline totalmente vacío no es un lugar
// válido para colapsar una Selection en la mayoría de los motores).
const ZERO_WIDTH_SPACE = '​';

const TOOLBAR_BUTTONS = [
  { command: 'bold', label: 'Negrita', glyph: 'B' },
  { command: 'italic', label: 'Cursiva', glyph: 'I' },
  { command: 'underline', label: 'Subrayado', glyph: 'U' },
  { command: 'strikeThrough', label: 'Tachado', glyph: 'S' },
];

// Extrae SOLO texto plano del portapapeles — nunca HTML/RTF pegado (spec
// constrained-rich-text "Paste from Word or Google Docs": todo formato
// ajeno al allowlist debe desaparecer, nunca colarse en el DOM del editor).
function extractPastedText(dataTransfer) {
  if (!dataTransfer || typeof dataTransfer.getData !== 'function') return '';
  return dataTransfer.getData('text/plain') || '';
}

function buildToolbarButtons() {
  return TOOLBAR_BUTTONS.slice();
}

// Clases Tailwind que marcan un botón del toolbar como "activo" en el
// cursor actual (bug de QA manual #2 rondas 2-4: sin feedback visual, el
// formato "on" queda invisible y se filtra a texto que se tipea/pega
// después sin que la dueña lo note). Función pura para poder testearla sin
// DOM real.
const TOOLBAR_ACTIVE_CLASSES = ['bg-brand', 'text-white', 'border-brand'];

// Ronda 4: los botones YA NO se deshabilitan sin selección (bug #2 — la
// dueña debe poder elegir un formato antes de tipear, estilo Word). El
// contrato de esta función pura se simplifica: ya no existe un estado
// "disabled" independiente, solo "activo en el punto/selección actual"
// (aplica igual a una selección real con texto en negrita que a un cursor
// colapsado adentro de un wrapper de formato recién elegido, ver
// `collapsedAncestorTags`).
function toolbarButtonPressedState(active) {
  return {
    toggleClasses: TOOLBAR_ACTIVE_CLASSES.slice(),
    active: Boolean(active),
    ariaPressed: active ? 'true' : 'false',
  };
}

// Altura mínima del mount contenteditable derivada de `rows` del textarea
// original (bug de QA manual #3 ronda 2: un <div> vacío sin altura mínima
// se achica a una línea y gran parte del área "de texto" deja de ser
// clickeable/no se siente como un input de texto normal). Función pura,
// testeable sin DOM.
function computeMountMinHeight(rows) {
  const safeRows = Number.isFinite(rows) && rows > 0 ? rows : 4;
  return `${safeRows * 1.5}em`;
}

// Determina si TODO el texto no-vacío intersectado por `range` está
// envuelto en un ancestro `tagName` (dentro de `mount`) — única fuente de
// verdad tanto para el estado visual "activo" del toolbar (con selección
// real, no colapsada) como para decidir si un click envuelve o desenvuelve.
function hasAncestorTag(mount, node, tagName) {
  let el = node.parentElement;
  while (el && el !== mount) {
    if (el.tagName && el.tagName.toLowerCase() === tagName) return true;
    el = el.parentElement;
  }
  return false;
}

function collectIntersectingTextNodes(mount, range) {
  const root = range.commonAncestorContainer;
  const walkRoot = root.nodeType === Node.TEXT_NODE ? root.parentNode : root;
  if (!walkRoot) return [];
  const walker = document.createTreeWalker(walkRoot, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let current = walker.nextNode();
  while (current) {
    if (range.intersectsNode(current) && current.textContent.trim() !== '') {
      nodes.push(current);
    }
    current = walker.nextNode();
  }
  return nodes;
}

function isFormatActive(mount, range, tagName) {
  const nodes = collectIntersectingTextNodes(mount, range);
  if (nodes.length === 0) return false;
  return nodes.every((node) => hasAncestorTag(mount, node, tagName));
}

// Quita SOLO el tag `tagName` de un DocumentFragment ya extraído,
// reemplazando cada elemento por sus hijos (unwrap) — deja intacto
// cualquier otro tag anidado (ej. un <em> dentro del <strong> que se está
// quitando).
function unwrapTagInFragment(fragment, tagName) {
  Array.from(fragment.querySelectorAll(tagName)).forEach((el) => {
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  return fragment;
}

// `el` no tiene NINGÚN contenido real — ni hijos, ni texto. Nota clave
// (comprobada con jsdom, no asumida): cuando `Range.extractContents()`
// extrae TODO el contenido de un nodo de texto (offset 0 hasta su longitud
// completa), el spec de DOM NO elimina ese nodo de texto del árbol — lo
// deja en su lugar con `data` vacío (`replaceData`, no `removeChild`). Un
// chequeo ingenuo de `childNodes.length === 0` nunca detecta ese caso (el
// ancestro sigue teniendo 1 hijo: un nodo de texto vacío), que es
// exactamente el escenario del bug crítico #1 ("Negrita queda pegada para
// siempre" — seleccionar TODO el texto de un <strong> y togglear).
function isAncestorEmptyOfContent(el) {
  for (let i = 0; i < el.childNodes.length; i += 1) {
    const child = el.childNodes[i];
    if (child.nodeType !== Node.TEXT_NODE || child.data !== '') return false;
  }
  return true;
}

// Ronda 4, fix del bug crítico #1 ("Negrita queda pegada para siempre"):
// después de `range.extractContents()`, el range queda colapsado en el
// punto donde estaba el contenido extraído. Si ESE punto sigue adentro de
// un ancestro `tagName` que quedó sin ningún contenido real (porque la
// selección cubría exactamente todo su texto, no el elemento en sí), hay
// que removerlo y reposicionar el punto de inserción afuera — si no, el
// contenido recién desenvuelto se reinserta adentro del mismo tag vacío,
// reconstruyéndolo, y el formato nunca se puede quitar.
function escapeEmptyAncestor(mount, range, tagName) {
  if (!range.collapsed) return;
  const container = range.startContainer;
  let el = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
  while (el && el !== mount) {
    if (el.tagName && el.tagName.toLowerCase() === tagName && isAncestorEmptyOfContent(el)) {
      const parent = el.parentNode;
      const index = Array.prototype.indexOf.call(parent.childNodes, el);
      parent.removeChild(el);
      range.setStart(parent, index);
      range.setEnd(parent, index);
      return;
    }
    el = el.parentElement;
  }
}

// Ronda 4, bug #2: un wrapper de formato "elegido antes de tipear" es
// puro andamiaje de UI mientras su único contenido siga siendo el ZWSP sin
// consumir — recursivo porque una cadena anidada (Negrita → Cursiva sin
// tipear nada en el medio) solo tiene el ZWSP real en el eslabón más
// interno; los eslabones exteriores tienen como único hijo al siguiente
// wrapper, no texto.
function isPendingWrapper(el) {
  if (!el || !el.childNodes || el.childNodes.length !== 1) return false;
  const child = el.firstChild;
  if (child.nodeType === Node.TEXT_NODE) return child.data === ZERO_WIDTH_SPACE;
  if (child.nodeType === Node.ELEMENT_NODE) return isPendingWrapper(child);
  return false;
}

// Busca, subiendo desde `node`, el ancestro `tagName` (dentro de `mount`)
// que sea un wrapper pendiente — es el que se remueve al togglear OFF el
// mismo formato con el cursor todavía colapsado adentro suyo, sin haber
// tipeado nada.
function findPendingAncestor(mount, node, tagName) {
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== mount) {
    if (el.tagName && el.tagName.toLowerCase() === tagName && isPendingWrapper(el)) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

// Formato(s) activo(s) en un punto de cursor COLAPSADO — a diferencia de
// `isFormatActive` (que evalúa un rango no colapsado sobre texto real),
// esta función mira directamente la cadena de ancestros del nodo donde
// está el cursor. Sirve tanto para texto ya formateado (bold real, con
// contenido) como para un wrapper pendiente (ZWSP, sin tipear todavía) —
// ambos son, estructuralmente, "el cursor está dentro de un <strong>", que
// es exactamente lo que el toolbar necesita reflejar al moverse el cursor
// (ronda 4, requisito de reset del estado del toolbar).
function collapsedAncestorTags(mount, node) {
  const tags = new Set();
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== mount) {
    if (el.tagName) {
      const tag = el.tagName.toLowerCase();
      if (TAG_LIST.includes(tag)) tags.add(tag);
    }
    el = el.parentElement;
  }
  return tags;
}

// Togglea formato con la Selection COLAPSADA (cursor sin texto
// seleccionado) — ronda 4, bug #2. Si el cursor ya está adentro de un
// wrapper pendiente del mismo tag, lo desenvuelve (toggle off, sin haber
// tipeado nada). Si no, crea un wrapper nuevo con un ZWSP y deja el cursor
// adentro, listo para que el tipeo nativo caiga ahí; si el cursor ya
// estaba adentro de OTRO wrapper pendiente (encadenar formatos antes de
// tipear, ej. Negrita → Cursiva), el nuevo wrapper se anida DENTRO de ese
// en vez de crear un hermano suelto.
function toggleCollapsedFormat(mount, selection, range, tagName) {
  const container = range.startContainer;
  const pending = findPendingAncestor(mount, container, tagName);

  if (pending) {
    const parent = pending.parentNode;
    const index = Array.prototype.indexOf.call(parent.childNodes, pending);
    parent.removeChild(pending);

    // Si el padre resultante quedó totalmente vacío y también es él mismo
    // un tag de formato dentro de `mount` (cadena anidada: se togglea off
    // el eslabón más interno pero el/los exterior(es) seguían pendientes),
    // se le repone un ZWSP propio — invariante: todo wrapper "pendiente"
    // sin contenido tipeado real siempre termina en exactamente un nodo de
    // texto ZWSP, nunca queda un elemento totalmente vacío suelto.
    let cursorHost = parent;
    let cursorOffset = index;
    if (
      parent !== mount &&
      parent.tagName &&
      TAG_LIST.includes(parent.tagName.toLowerCase()) &&
      parent.childNodes.length === 0
    ) {
      const zwsp = document.createTextNode(ZERO_WIDTH_SPACE);
      parent.appendChild(zwsp);
      cursorHost = zwsp;
      cursorOffset = zwsp.data.length;
    }

    const newRange = document.createRange();
    newRange.setStart(cursorHost, cursorOffset);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);
    return;
  }

  const immediateParent = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
  const nestInsidePending =
    immediateParent && immediateParent !== mount && immediateParent.tagName && isPendingWrapper(immediateParent);

  const wrapper = document.createElement(tagName);
  const zwsp = document.createTextNode(ZERO_WIDTH_SPACE);
  wrapper.appendChild(zwsp);

  if (nestInsidePending) {
    // Reemplaza el ZWSP suelto del wrapper pendiente existente por el
    // nuevo wrapper anidado — nunca coexisten un ZWSP de texto y un
    // elemento hijo en el mismo padre (mantiene `isPendingWrapper`
    // recursivo consistente en toda la cadena).
    immediateParent.textContent = '';
    immediateParent.appendChild(wrapper);
  } else {
    range.deleteContents();
    range.insertNode(wrapper);
  }

  const newRange = document.createRange();
  newRange.setStart(zwsp, zwsp.data.length);
  newRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(newRange);
}

// Envuelve/desenvuelve el `tagName` correspondiente sobre la selección
// actual (colapsada o no). Reemplaza por completo a `document.execCommand`:
// con selección real, `extractContents()` ya resuelve la partición de
// elementos que cruzan el borde de la selección; con selección colapsada,
// delega en `toggleCollapsedFormat` (ronda 4, bug #2). No llama a
// `syncTextarea`/actualiza el toolbar — eso es responsabilidad del wiring
// que la invoca (mantiene esta función pura y testeable con jsdom sin
// necesitar armar el toolbar completo).
function toggleFormat(mount, tagName) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!mount.contains(range.commonAncestorContainer)) return;

  if (range.collapsed) {
    toggleCollapsedFormat(mount, selection, range, tagName);
    return;
  }

  const active = isFormatActive(mount, range, tagName);
  const fragment = range.extractContents();
  // Ronda 4, fix del bug crítico #1: ver `escapeEmptyAncestor` — debe
  // correr ANTES de reinsertar, mientras el range todavía apunta al punto
  // exacto que dejó `extractContents()`.
  escapeEmptyAncestor(mount, range, tagName);

  let firstNode;
  let lastNode;

  if (active) {
    unwrapTagInFragment(fragment, tagName);
    firstNode = fragment.firstChild;
    lastNode = fragment.lastChild;
    range.insertNode(fragment);
  } else {
    const wrapper = document.createElement(tagName);
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
    firstNode = wrapper;
    lastNode = wrapper;
  }

  // Ronda 5, fix del bug crítico #1 recurrente ("una vez desactivada,
  // Negrita no se puede volver a activar sobre la misma selección"): a
  // diferencia del ancestro ELEMENTO vacío que ya cubre `escapeEmptyAncestor`
  // (ronda 4), `Range.extractContents()` sobre una selección que cubre
  // EXACTAMENTE todo un nodo de texto (offset 0 a `data.length`) no borra
  // ese nodo de texto del árbol — lo deja en el lugar con `data === ''`
  // (`deleteData`, no `removeChild`, mismo comportamiento de spec ya
  // documentado en `isAncestorEmptyOfContent`). Ese nodo de texto vacío
  // residual queda como HERMANO suelto en `mount` (no adentro de ningún
  // ancestro `tagName`, así que `escapeEmptyAncestor` nunca lo toca) y
  // fragmenta lo que antes era un único run de texto en varios nodos de
  // texto adyacentes (comprobado con jsdom: "hola mundo" -> ["", "hola",
  // " mundo"] tras un ciclo on->off). `mount.normalize()` fusiona nodos de
  // texto adyacentes y elimina los vacíos — se corre siempre después de
  // reinsertar, restaurando la selección DESPUÉS de normalizar para que los
  // límites (`setStartBefore`/`setEndAfter`) apunten a nodos que sigan
  // vivos en el árbol ya normalizado.
  mount.normalize();

  // Restaura la selección visual sobre el contenido recién reinsertado,
  // así el highlight de la dueña no colapsa/salta — necesario para poder
  // aplicar un segundo formato (ej. negrita y después cursiva) sobre el
  // mismo texto todavía seleccionado.
  const newRange = document.createRange();
  if (firstNode && lastNode) {
    newRange.setStartBefore(firstNode);
    newRange.setEndAfter(lastNode);
  } else {
    newRange.setStart(range.startContainer, range.startOffset);
    newRange.collapse(true);
  }
  selection.removeAllRanges();
  selection.addRange(newRange);
}

// Ronda 4, bug #2 (última parte): quita de `root` cualquier wrapper de
// formato que sea puro andamiaje de UI (`isPendingWrapper`) — la dueña
// activó un formato pero nunca llegó a tipear nada antes de guardar. Solo
// remueve el wrapper MÁS EXTERNO de una cadena anidada (si su padre
// inmediato también es un wrapper pendiente, ese padre ya se encarga de
// desaparecer solo, evita tocar nodos que un paso previo ya desconectó).
function stripPendingPlaceholders(root) {
  TAG_LIST.forEach((tag) => {
    Array.from(root.querySelectorAll(tag)).forEach((el) => {
      if (!root.contains(el)) return;
      if (!isPendingWrapper(el)) return;
      const parentTag = el.parentElement && el.parentElement.tagName && el.parentElement.tagName.toLowerCase();
      const parentIsPending = parentTag && TAG_LIST.includes(parentTag) && isPendingWrapper(el.parentElement);
      if (!parentIsPending) el.remove();
    });
  });
  return root;
}

// Serializa `mount` para el <textarea> real/el guardado — SIEMPRE sobre un
// clon, nunca mutando el DOM en vivo del editor: si se borrara el wrapper
// pendiente directamente de `mount`, el cursor de la dueña (que puede estar
// posicionado adentro de ese wrapper, a la espera de que tipee algo) se
// perdería en cada sync (`syncTextarea` corre en cada mutación, no solo al
// guardar).
function buildTextareaValue(mount) {
  const clone = mount.cloneNode(true);
  stripPendingPlaceholders(clone);
  return clone.innerHTML;
}

// Ronda 6: dado un punto de cursor COLAPSADO (`container`/`offset`, misma
// convención que un Range colapsado: `startContainer`/`startOffset`),
// devuelve `{ parent, offset }` — un punto de inserción en el árbol DOM que
// NUNCA queda adentro de ningún ancestro `TAG_LIST` (`<strong>`/`<em>`/
// `<u>`/`<s>`) entre el punto original y `mount`, partiendo (`splitText`,
// y el mismo split "mitad izquierda queda, mitad derecha se clona a un
// hermano nuevo" para elementos) cada ancestro de formato que haga falta en
// vez de simplemente saltar afuera de golpe — así nunca se pierde ni se
// reordena contenido que estaba antes/después del cursor dentro de ese
// ancestro. Es la pieza estructural que reemplaza la heurística interna
// (inconsistente) del browser sobre "el cursor está adentro o afuera de
// este tag": acá la respuesta siempre es explícita, calculada por
// construcción a partir del árbol real.
function escapePointOutsideFormats(mount, container, offset) {
  let node = container;
  let childOffset = offset;

  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentNode;
    let index = Array.prototype.indexOf.call(parent.childNodes, node);
    if (childOffset > 0 && childOffset < node.data.length) {
      // El cursor está en el MEDIO del nodo de texto: se parte en dos, el
      // punto de inserción queda justo entre ambas mitades.
      node.splitText(childOffset);
      index += 1;
    } else if (childOffset >= node.data.length) {
      // Cursor al final del nodo de texto: el punto de inserción es
      // después de él, sin partir nada.
      index += 1;
    }
    // childOffset === 0 -> el punto de inserción es ANTES del nodo de
    // texto completo, `index` ya apunta ahí sin modificar.
    node = parent;
    childOffset = index;
  }

  while (node && node !== mount && node.tagName && TAG_LIST.includes(node.tagName.toLowerCase())) {
    const parent = node.parentNode;
    const nodeIndex = Array.prototype.indexOf.call(parent.childNodes, node);

    // Clona el mismo tag como hermano nuevo y le mueve (no copia: `append`
    // real, `appendChild` desconecta el hijo de `node`) todos los hijos
    // desde `childOffset` en adelante — la mitad "derecha" del ancestro que
    // se está partiendo.
    const rightSibling = document.createElement(node.tagName);
    while (node.childNodes.length > childOffset) {
      rightSibling.appendChild(node.childNodes[childOffset]);
    }

    let insertionIndex = nodeIndex + 1;
    if (rightSibling.childNodes.length > 0) {
      parent.insertBefore(rightSibling, node.nextSibling);
    }
    if (node.childNodes.length === 0) {
      // La mitad "izquierda" quedó vacía (el cursor estaba al principio de
      // todo el contenido de este ancestro) — se remueve en vez de dejar un
      // elemento vacío suelto, y el punto de inserción pasa a ser el lugar
      // donde ese elemento vacío solía estar.
      parent.removeChild(node);
      insertionIndex = nodeIndex;
    }

    node = parent;
    childOffset = insertionIndex;
  }

  return { parent: node, offset: childOffset };
}

// Ronda 6: construye el nodo (de texto plano, o envuelto en la cadena de
// tags de `tags`) que representa `text` recién tipeado con el estado de
// formato activo indicado. Orden de anidamiento SIEMPRE canónico según
// `TAG_LIST` (bold afuera, ..., tachado adentro), sin importar en qué orden
// la dueña haya clickeado los botones — decisión de diseño ronda 6: a
// diferencia de `toggleCollapsedFormat` (que anida según el orden real de
// clicks para el flujo "elegir formato antes de tipear" existente desde
// ronda 4), acá no hay ninguna razón funcional para variar el orden, y uno
// fijo simplifica el razonamiento sobre el HTML resultante.
function buildFormattedNode(text, tags) {
  const textNode = document.createTextNode(text);
  let root = textNode;
  TAG_LIST.slice()
    .reverse()
    .forEach((tag) => {
      if (tags && tags.has(tag)) {
        const wrapper = document.createElement(tag);
        wrapper.appendChild(root);
        root = wrapper;
      }
    });
  return { root, textNode };
}

// Ronda 6, corazón del fix del bug crítico "el formato desactivado sigue
// pegado al tipear": inserta `text` en el punto colapsado de `range`,
// envuelto EXACTAMENTE en `tags` (un Set de nombres de tag de `TAG_LIST`,
// puede estar vacío) — nunca en lo que el ancestro DOM del cursor "parezca"
// tener. Usa `escapePointOutsideFormats` para garantizar por construcción
// que el contenido nuevo nunca queda atrapado dentro de un tag que no está
// en `tags`. Con `tags` vacío, en vez de crear siempre un nodo de texto
// nuevo suelto, reutiliza/extiende un nodo de texto plano ya adyacente si
// existe — evita fragmentar el árbol desde el vamos (mismo espíritu que el
// `mount.normalize()` de ronda 5, aplicado preventivamente acá en vez de
// correctivamente). Devuelve `{ textNode, offset }` — el nodo de texto y el
// offset donde debe quedar el cursor después de tipear, para que quien
// llama arme el Range/Selection final.
function insertTextAtCollapsedRange(mount, range, text, tags) {
  const point = escapePointOutsideFormats(mount, range.startContainer, range.startOffset);
  const { parent } = point;
  let result;

  if (!tags || tags.size === 0) {
    const before = parent.childNodes[point.offset - 1];
    const after = parent.childNodes[point.offset];
    if (before && before.nodeType === Node.TEXT_NODE) {
      before.data += text;
      result = { textNode: before, offset: before.data.length };
    } else if (after && after.nodeType === Node.TEXT_NODE) {
      after.data = text + after.data;
      result = { textNode: after, offset: text.length };
    } else {
      const textNode = document.createTextNode(text);
      parent.insertBefore(textNode, after || null);
      result = { textNode, offset: text.length };
    }
  } else {
    const { root, textNode } = buildFormattedNode(text, tags);
    parent.insertBefore(root, parent.childNodes[point.offset] || null);
    result = { textNode, offset: text.length };
  }

  // Mismo patrón que ronda 5 (ver `toggleFormat`): siempre normalizar
  // después de cirugía de Range/DOM manual, defensa adicional contra
  // fragmentación de nodos de texto adyacentes en cualquier otra parte del
  // mount. Seguro para el nodo devuelto en `result`: en la rama sin tags se
  // reutiliza un nodo con contenido real (nunca el vacío que `normalize()`
  // podría eliminar, mismo razonamiento ya validado en ronda 5); en la rama
  // con tags, el nodo de texto vive solo dentro de un elemento recién
  // creado sin hermanos de texto, así que `normalize()` no lo toca.
  mount.normalize();
  return result;
}

// Inserta un único <br> en el punto indicado por `range` y devuelve un
// nuevo Range colapsado justo después — función nombrada y testeable
// (ronda 4, bug #3: "Enter requiere 2 pulsaciones") para poder afirmar con
// jsdom que UNA sola invocación produce EXACTAMENTE un <br>, sin depender
// de simular el pipeline de eventos de teclado real de un browser (jsdom no
// lo implementa).
//
// Ronda 6: recibe `mount` como primer parámetro (cambio de contrato
// intencional) y usa `escapePointOutsideFormats` para insertar el <br>
// SIEMPRE afuera de cualquier ancestro de formato abierto en el punto del
// cursor — bug lateral confirmado del reporte de la dueña ("separar con
// Enter tampoco ayuda"): antes, `range.insertNode(br)` insertaba el <br> en
// el mismo padre que `range.startContainer`, que con el cursor pegado al
// final de texto en negrita seguía siendo el propio `<strong>` — el <br>
// quedaba atrapado adentro (`<strong>bold<br></strong>`) en vez de romper
// la línea de verdad afuera del formato.
function insertLineBreak(mount, range) {
  if (!range.collapsed) range.deleteContents();
  const point = escapePointOutsideFormats(mount, range.startContainer, range.startOffset);
  const br = document.createElement('br');
  const referenceNode = point.parent.childNodes[point.offset] || null;
  point.parent.insertBefore(br, referenceNode);
  const newRange = document.createRange();
  newRange.setStartAfter(br);
  newRange.collapse(true);
  return newRange;
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-rich-text-source]').forEach((textarea) => {
    const mount = document.createElement('div');
    mount.setAttribute('contenteditable', 'true');
    mount.setAttribute('data-rich-text', '');
    mount.className = textarea.className;
    // Bug de QA manual #3 (ronda 2): el mount hereda las clases del
    // textarea, pero eso no garantiza cursor de texto ni una altura mínima
    // clickeable (un contenteditable vacío colapsa a una sola línea). Se
    // agregan explícitamente después de heredar, así nunca quedan pisadas
    // por ninguna clase del textarea de origen. El área clickeable del
    // mount es exactamente su propio box con borde (mismas clases de
    // padding/border que el textarea que reemplaza) — no hay overflow ni
    // posicionamiento que la extienda más allá de su propio borde.
    mount.classList.add('cursor-text');
    mount.style.minHeight = computeMountMinHeight(textarea.rows);
    // El contenido inicial ya vino sanitizado del server (form.ejs:
    // `<%- sanitizeInline(page.description_html) %>` en un <template>
    // hermano) — se copia UNA sola vez acá vía innerHTML del <template>
    // (nodo estático generado por el server, nunca por el cliente) hacia el
    // contenteditable real; el editor no vuelve a construir HTML dinámico
    // desde ahí en adelante.
    const sourceTemplate = textarea.parentElement.querySelector('[data-rich-text-initial]');
    if (sourceTemplate) {
      mount.append(sourceTemplate.content.cloneNode(true));
    }

    // Bug de accesibilidad de label (form.ejs, rondas 3 y 4): el <label>
    // ya no envuelve el mount, así que este copia `aria-labelledby` del
    // textarea de origen para seguir asociado a su texto visible.
    if (textarea.hasAttribute('aria-labelledby')) {
      mount.setAttribute('aria-labelledby', textarea.getAttribute('aria-labelledby'));
    }

    const toolbar = document.createElement('div');
    toolbar.setAttribute('data-rich-text-toolbar', '');
    toolbar.className = 'flex gap-1 mb-1';

    // Ronda 4, bug #2: los botones ya NO se deshabilitan sin selección —
    // siempre están activos, así la dueña puede elegir un formato antes de
    // tipear (estilo Word). El estado "activo/pulsado" se recalcula on
    // demand en `updateToolbarState`.
    const toolbarButtonRefs = [];

    // Ronda 6: estado de formato "para el próximo caracter tipeado",
    // rastreado EXPLÍCITAMENTE acá en el wiring (no en el módulo, no en el
    // DOM) — `null` significa "sin override todavío, usar lo que diga el
    // ancestro DOM real del cursor" (`collapsedAncestorTags`, mismo criterio
    // que ronda 4). Se resincroniza desde el DOM cada vez que el cursor se
    // mueve por una razón REAL (click/mouseup/keyup/selectionchange) — así
    // nunca arrastra un override viejo a una posición no relacionada, mismo
    // requisito que ya regía `collapsedAncestorTags` desde ronda 4. Clickear
    // un botón del toolbar con el cursor colapsado es la ÚNICA vía que lo
    // pone a un valor que puede DIVERGIR del ancestro DOM real — precisamente
    // el mecanismo que permite desactivar un formato "pegado" sin que la
    // heurística de límites de tag del browser lo pise.
    let typingFormatState = null;

    function currentTypingTags(range) {
      if (typingFormatState) return typingFormatState;
      return collapsedAncestorTags(mount, range.startContainer);
    }

    function syncTypingStateFromCursor() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!mount.contains(range.commonAncestorContainer)) return;
      typingFormatState = range.collapsed ? collapsedAncestorTags(mount, range.startContainer) : null;
    }

    buildToolbarButtons().forEach(({ command, label, glyph }) => {
      const tagName = TAG_BY_COMMAND[command];
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', 'false');
      button.className = 'rounded border border-border px-2 py-1 text-xs font-semibold';
      button.textContent = glyph;
      // Evita que el botón robe el foco del mount en mousedown — si el
      // mount pierde el foco antes del click, el browser puede colapsar o
      // mover la selección/el cursor antes de que corra el handler de
      // click, y se pierde tanto el texto seleccionado como la posición
      // exacta del cursor colapsado.
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      button.addEventListener('click', () => {
        const selection = window.getSelection();
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        const collapsedInMount = Boolean(range && range.collapsed && mount.contains(range.commonAncestorContainer));

        if (collapsedInMount) {
          // Ronda 6: siempre actualiza el estado de tipeo RASTREADO,
          // independiente de si hay o no un wrapper pendiente en el DOM en
          // ese punto — esta es la corrección del bug crítico.
          const nextTags = new Set(currentTypingTags(range));
          if (nextTags.has(tagName)) nextTags.delete(tagName);
          else nextTags.add(tagName);
          typingFormatState = nextTags;

          // El mecanismo de wrapper pendiente con ZWSP de ronda 4 (mutación
          // de DOM vía `toggleFormat`) sigue corriendo SOLO cuando tiene
          // sentido: creando/quitando un wrapper vacío para dar feedback
          // visual antes de tipear. Si el cursor ya está adentro de texto
          // REAL (no un wrapper pendiente) del mismo tag, `toggleFormat`
          // insertaría un wrapper vacío anidado ADENTRO de ese texto real
          // (ronda 4 nunca contempló togglear off sobre contenido real con
          // cursor colapsado, solo sobre un wrapper pendiente sin tipear) —
          // se salta esa mutación de DOM y se deja que el estado de tipeo
          // rastreado gobierne, por sí solo, el próximo caracter (ver
          // `insertTextAtCollapsedRange`, disparado desde `beforeinput`).
          const insideRealFormat =
            !findPendingAncestor(mount, range.startContainer, tagName) &&
            collapsedAncestorTags(mount, range.startContainer).has(tagName);
          if (!insideRealFormat) {
            toggleFormat(mount, tagName);
          }
        } else {
          toggleFormat(mount, tagName);
        }

        syncTextarea();
        updateToolbarState();
      });
      toolbarButtonRefs.push({ tagName, button });
      toolbar.append(button);
    });

    function updateToolbarState() {
      const selection = window.getSelection();
      const hasSelection = Boolean(
        selection && selection.rangeCount > 0 && mount.contains(selection.getRangeAt(0).commonAncestorContainer),
      );
      const range = hasSelection ? selection.getRangeAt(0) : null;

      toolbarButtonRefs.forEach(({ tagName, button }) => {
        let active = false;
        if (range) {
          // Ronda 6: con el cursor colapsado, "activo" refleja el estado de
          // tipeo RASTREADO (`currentTypingTags`, con fallback al ancestro
          // DOM real solo cuando todavía no hay ningún override) — ya no el
          // ancestro DOM directo a secas, precisamente porque ese ancestro
          // puede seguir diciendo "negrita" un instante después de que la
          // dueña clickeó Negrita para apagarla (el cursor real del browser
          // no se movió). Con selección real (no colapsada) no cambia nada:
          // sigue siendo el propio texto seleccionado la única fuente de
          // verdad, vía `isFormatActive`.
          active = range.collapsed ? currentTypingTags(range).has(tagName) : isFormatActive(mount, range, tagName);
        }
        const state = toolbarButtonPressedState(active);
        state.toggleClasses.forEach((cls) => button.classList.toggle(cls, state.active));
        button.setAttribute('aria-pressed', state.ariaPressed);
      });
    }

    function syncTextarea() {
      textarea.value = buildTextareaValue(mount);
    }

    mount.addEventListener('paste', (event) => {
      event.preventDefault();
      const text = extractPastedText(event.clipboardData);
      if (!text) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!mount.contains(range.commonAncestorContainer)) return;

      range.deleteContents();
      const lines = text.split('\n');
      let lastNode = null;
      lines.forEach((line, index) => {
        const textNode = document.createTextNode(line);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        lastNode = textNode;
        if (index < lines.length - 1) {
          const br = document.createElement('br');
          range.insertNode(br);
          range.setStartAfter(br);
          range.collapse(true);
          lastNode = br;
        }
      });

      if (lastNode) {
        const newRange = document.createRange();
        newRange.setStartAfter(lastNode);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }

      syncTextarea();
      updateToolbarState();
    });

    // Ronda 4, fix del bug #3 (Enter requería 2 pulsaciones): se
    // reemplaza por completo el viejo handler de `keydown` para Enter por
    // uno de `beforeinput`, el evento correcto del pipeline de Input
    // Events Level 2 para cancelar confiablemente la inserción nativa de
    // párrafo/salto de línea de un contenteditable ANTES de que mute el
    // DOM — `keydown.preventDefault()` por sí solo no lo garantiza en
    // todos los motores (hipótesis de la dueña, ver apply-progress ronda
    // 4), lo que dejaba un estado intermedio inconsistente que recién se
    // "arreglaba" visualmente con un segundo Enter.
    mount.addEventListener('beforeinput', (event) => {
      if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
        event.preventDefault();
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        if (!mount.contains(range.commonAncestorContainer)) return;

        const newRange = insertLineBreak(mount, range);
        selection.removeAllRanges();
        selection.addRange(newRange);

        syncTextarea();
        return;
      }

      // Ronda 6, fix del bug crítico "el formato desactivado sigue pegado
      // al tipear": se intercepta TAMBIÉN el tipeo normal de caracteres —
      // antes de esta ronda, `insertText` nunca se interceptaba en ningún
      // lado y el pipeline nativo del browser decidía, con su propia
      // heurística de límites de tag, en qué elemento caía cada caracter.
      // Solo se maneja el caso de selección COLAPSADA: reemplazar una
      // selección real tipeando encima (`!range.collapsed`) queda fuera de
      // alcance de esta ronda (no fue parte del reporte de la dueña, y
      // seleccionar texto real ya usa `toggleFormat` correctamente, sólida
      // desde rondas 1/5). Composición IME (`insertCompositionText`) queda
      // deliberadamente sin interceptar — ver comentario de cabecera del
      // archivo.
      if (event.inputType === 'insertText' || event.inputType === 'insertReplacementText') {
        const text = event.data;
        if (!text) return;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        if (!mount.contains(range.commonAncestorContainer)) return;
        if (!range.collapsed) return;

        event.preventDefault();
        const tags = currentTypingTags(range);
        const { textNode, offset } = insertTextAtCollapsedRange(mount, range, text, tags);
        typingFormatState = new Set(tags);

        const newRange = document.createRange();
        newRange.setStart(textNode, offset);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        syncTextarea();
      }
    });

    mount.addEventListener('input', syncTextarea);
    mount.addEventListener('keyup', () => {
      syncTypingStateFromCursor();
      updateToolbarState();
    });
    mount.addEventListener('mouseup', () => {
      syncTypingStateFromCursor();
      updateToolbarState();
    });
    mount.addEventListener('click', () => {
      syncTypingStateFromCursor();
      updateToolbarState();
    });
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === mount) {
        syncTypingStateFromCursor();
        updateToolbarState();
      }
    });

    const form = textarea.closest('form');
    if (form) {
      form.addEventListener('submit', syncTextarea);
    }

    textarea.classList.add('hidden');
    textarea.removeAttribute('required');
    textarea.parentElement.insertBefore(toolbar, textarea);
    textarea.parentElement.insertBefore(mount, textarea);
    syncTextarea();
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractPastedText,
    buildToolbarButtons,
    TOOLBAR_BUTTONS,
    TAG_BY_COMMAND,
    TAG_LIST,
    ZERO_WIDTH_SPACE,
    toolbarButtonPressedState,
    computeMountMinHeight,
    hasAncestorTag,
    isFormatActive,
    unwrapTagInFragment,
    isAncestorEmptyOfContent,
    escapeEmptyAncestor,
    isPendingWrapper,
    findPendingAncestor,
    collapsedAncestorTags,
    toggleCollapsedFormat,
    toggleFormat,
    stripPendingPlaceholders,
    buildTextareaValue,
    escapePointOutsideFormats,
    buildFormattedNode,
    insertTextAtCollapsedRange,
    insertLineBreak,
  };
}
