// Servicio puro de semántica de estado de pedidos (Fase 6c, design.md D1).
// Sin acceso a DB: transición, efecto de stock y badge viven juntos acá para
// que el badge nunca pueda desincronizarse de la máquina de estados — mismo
// patrón que availability.js/format.js (funciones puras, sin `req`/pool).

// Umbral fijo de stock bajo (decisión de negocio confirmada, sin env var):
// coincide con el concepto ya usado en la ficha pública, pero vive acá como
// fuente de verdad para el panel de stock/dashboard — no se toca
// src/views/pages/product.ejs:143, fuera de alcance de esta fase.
const LOW_STOCK_THRESHOLD = 2;

// Única tabla de transiciones válidas — usada tanto para renderizar los
// controles disponibles en la vista de detalle como para autorizar el POST
// (design.md: "single shared source of truth").
const TRANSITIONS = {
  pendiente: ['confirmado', 'cancelado'],
  confirmado: ['entregado', 'cancelado'],
  entregado: [],
  cancelado: ['pendiente'],
};

function canTransition(from, to) {
  if (!from || !to) return false;
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

// Stock se mueve en exactamente dos transiciones (spec "Stock effects of
// transitions"): confirmar descuenta, cancelar-desde-confirmado repone. Todo
// lo demás, incluido pendiente->entregado (que canTransition ya bloquea) y
// cualquier par inválido, es 'none'.
function stockEffect(from, to) {
  if (from === 'pendiente' && to === 'confirmado') return 'decrement';
  if (from === 'confirmado' && to === 'cancelado') return 'restore';
  return 'none';
}

// Colores con relleno (QA fase 6c: los badges "border + texto" sin fondo se
// veían todos iguales de lejos — la dueña pidió distinguirlos de un vistazo,
// mismo criterio de "amarillo claro"/"verde"/"rojo" que ya usa `error` para
// "Borrar" en Productos/Categorías).
// `confirmado` en azul (no en `brand`, que es naranja): el color de marca ya
// se usa en toda la app para acciones/CTAs (+Nuevo, Guardar, etc.) y queda
// demasiado parecido al amarillo de `pendiente` — un azul da a los 4 estados
// el máximo contraste entre sí de un vistazo.
const BADGES = {
  pendiente: { label: 'Pendiente', className: 'border-amber-300 bg-amber-50 text-amber-600' },
  confirmado: { label: 'Confirmado', className: 'border-blue-600 bg-blue-100 text-blue-950' },
  entregado: { label: 'Entregado', className: 'border-success bg-success/10 text-success' },
  cancelado: { label: 'Cancelado', className: 'border-error bg-error/10 text-error' },
};

const UNKNOWN_BADGE = { label: 'Desconocido', className: 'border-border bg-surface text-textMuted' };

// Nunca lanza ante un status inesperado (defensivo: un dato corrupto no debe
// tirar abajo la vista) — devuelve un badge neutro en vez de un valor vacío.
function statusBadge(status) {
  return BADGES[status] || UNKNOWN_BADGE;
}

// Estilo de los botones de acción del detalle de pedido, por estado destino
// (QA fase 6c: todos los botones se veían iguales — "Confirmar" y "Cancelar"
// deben distinguirse igual que un "Borrar" en rojo en el resto del panel).
// Única fuente de verdad, igual que TRANSITIONS/stockEffect: la vista nunca
// decide el color a mano.
const TRANSITION_BUTTON_CLASSES = {
  confirmado: 'bg-success text-white',
  cancelado: 'bg-error text-white',
  entregado: 'bg-brand text-white',
  // "Marcar como Pendiente" (reabrir desde cancelado) quedaba como único
  // botón sin relleno (QA fase 6c) — mismo criterio ámbar que su badge, en
  // versión sólida para que se vea como una acción real, no un placeholder.
  pendiente: 'bg-amber-500 text-white',
};

function transitionButtonClass(to) {
  return TRANSITION_BUTTON_CLASSES[to] || 'bg-amber-500 text-white';
}

module.exports = {
  LOW_STOCK_THRESHOLD,
  TRANSITIONS,
  canTransition,
  stockEffect,
  statusBadge,
  transitionButtonClass,
};
