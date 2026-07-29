// Textos institucionales en borrador (voseo rioplatense, datos reales del
// cliente — §0), para que la dueña edite en vez de escribir desde cero
// (§10 item 2). Contenido editable desde /admin en la Fase 6.
module.exports = {
  page_envios_y_retiros: `Hacemos envíos a todo el país. Coordinamos el medio de envío y el costo por WhatsApp una vez confirmado tu pedido. Como todavía no tenemos local físico, no hay retiro en punto de venta por ahora.`,

  page_cambios_y_devoluciones: `Si la prenda no te quedó como esperabas, escribinos por WhatsApp dentro de los 10 días de recibida. La prenda tiene que estar sin uso, con etiquetas, en su empaque original. Coordinamos el cambio o la devolución por ese mismo medio.`,

  page_medios_de_pago: `Por ahora coordinamos el medio de pago directamente por WhatsApp al confirmar tu pedido (transferencia, efectivo u otros medios a acordar). Todavía no procesamos pagos online desde la web.`,

  page_contacto: `Escribinos por WhatsApp al 351 750-5083 o seguinos en Instagram @donna_styleok. También podés escribirnos a yesi2682@hotmail.com. Donna Style — Córdoba Capital.`,

  page_terminos_y_condiciones: `Donna Style — CUIT 27-29456245-7. Al realizar un pedido a través de este sitio, aceptás que la compra se confirma y coordina por WhatsApp, sin procesamiento de pagos en la web. Los precios están expresados en pesos argentinos y pueden actualizarse sin previo aviso. Para más información, consultá al organismo de Defensa del Consumidor de tu jurisdicción.`,

  page_boton_de_arrepentimiento: `Tenés derecho a arrepentirte de tu compra dentro de los 10 días corridos desde que la recibiste, sin costo ni obligación de dar motivo (Ley 24.240, art. 34). Para ejercerlo, escribinos por WhatsApp al 351 750-5083 indicando tu número de pedido.`,

  // Barra de anuncios (§5.1): editable/desactivable desde el panel (Fase 6).
  // Varios mensajes separados por " • ", en loop horizontal continuo (ver
  // partials/header.ejs). Guardado en capitalización normal — el mayúsculas
  // se resuelve con CSS (uppercase), mismo criterio que §0.1 regla 4 para
  // categorías. Si esta clave no existiera o quedara vacía, la barra no se
  // renderiza (§4.5, principio de ausencia).
  announcement_bar_text: `Envíos a todo el país • 6 cuotas sin interés • 30% off abonando con efectivo/transferencia bancaria`,
};
