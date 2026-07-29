# Progreso — Donna Style

> Estado del proyecto respecto de `prompt.md` (fuente de verdad). Este archivo es
> para retomar el trabajo en una sesión futura sin releer todo el historial de
> chat. Actualizalo al cerrar cada sesión de trabajo.

## Fases completadas (SDD: propuesta → diseño → tasks → apply → verify → archive)

### Fase 1 — Fundaciones ✅ cerrada
Scaffolding completo: Docker Compose con solo Postgres, Express + EJS +
Tailwind (tokens de §4.2 como variables CSS + alias en `tailwind.config.js`),
runner de migraciones propio (`db/migrate.js`, sin librería), healthcheck con
`SELECT 1`, `CLAUDE.md` con las convenciones del proyecto.

### Fase 2 — Datos ✅ cerrada
Esquema completo (`db/migrations/002-005`): categorías con trigger de
profundidad máxima 2 niveles (cubre alta y re-parentado — bug encontrado en
review y corregido), productos/variantes con `UNIQUE NULLS NOT DISTINCT`,
pedidos con `order_code` autogenerado por trigger, admin/carrusel/config.
19 categorías reales de §0.1, ~19 productos cubriendo los casos borde
pedidos, servicio de disponibilidad de variantes (`src/services/availability.js`)
hecho con TDD, 13 tests. Seeds idempotentes (`node db/seed.js`, TRUNCATE +
reseed, guarda `NODE_ENV=production`).

### Fase 3 — Catálogo ✅ cerrada
**Lo que está construido y funcionando** (probado en vivo por el usuario,
iterado varias rondas sobre el diseño):

- Rutas públicas (`src/routes/public.js`): `GET /`, `GET /:categorySlug`,
  `GET /:parentSlug/:childSlug` (con rollup de categoría padre → hijas, §0.1
  regla 2), `GET /productos/:slug`.
- Home: banda de marca (wordmark de texto, no imagen — ver más abajo) +
  carrusel (0/1/2+ slides, los 3 estados) + destacados.
- Listado de categoría con filtro de precio + orden + paginación (query
  string, funciona sin JS).
- Card de producto: selectores de talle/color vía `availability.js`, botón
  "Agregar" presente pero `disabled` (Fase 4 solo saca el disabled y conecta
  el POST real).
- Ficha de producto: galería con swap de miniatura (sin lightbox/zoom real
  todavía — diferido a Fase 7 a propósito), breadcrumbs, selectores,
  avisos de stock bajo, cantidad, descripción (sanitizada con
  `sanitize-html`), guía de talles colapsable, compartir, productos
  similares.
- Header/nav/footer, construidos ahora aunque no estaban explícitamente
  asignados a esta fase (nada es navegable sin ellos):
  - **Header**: transparente con difuminado leve (`backdrop-blur-sm` en una
    capa de fondo separada, no en el `<header>` — ver nota técnica abajo),
    ícono de 3 líneas a la izquierda, wordmark "Donna Style" centrado de
    verdad (`absolute left-1/2`).
  - **Drawer lateral** (`nav-drawer.ejs`): abre con click/tap (no hover),
    ocupa toda la altura de la ventana, fondo oscuro que cierra al
    tocarlo (+ tecla Escape), contiene "Inicio" y "Productos". Adentro de
    "Productos" el árbol de categorías es un acordeón animado
    (`mega-menu.ejs` + `menu-animate.js`): clic en "Productos" muestra las
    5 categorías padre en el orden real de §0.1, clic en una con hijos
    despliega sus subcategorías. Sin JS, todo sigue funcionando (toggle
    instantáneo vía `<details>` nativo), solo se pierde la animación.
  - **Barra de anuncios**: ticker en loop horizontal continuo (derecha a
    izquierda, velocidad constante), 3 mensajes en mayúsculas vía CSS
    (`ENVÍOS A TODO EL PAÍS`, `6 CUOTAS SIN INTERÉS`, `30% OFF...`),
    guardados en `site_settings.announcement_bar_text` separados por "•".
  - **Footer**: solo enlaza a rutas que existen, bloque legal (CUIT,
    Defensa del Consumidor, botón de arrepentimiento), sin bloque de
    direcciones (no hay local físico).
- `src/services/format.js`: precios/fechas en formato `es-AR`.
- Placeholders: una imagen de producto genérica (3:4) copiada bajo los 20
  nombres de archivo que `db/seeds/products.js` espera, más 3 imágenes de
  carrusel — **ninguna es foto real**, hay que reemplazarlas cuando la
  clienta mande fotos reales.
- Fuente **Merriweather** auto-hosteada en `src/public/fonts/` (sin CDN de
  terceros), usada en el wordmark de texto.
- Tests nuevos: `test/services/format.test.js`, `test/models/*.test.js`
  (rollup de categoría, ventana de fechas del carrusel, contra la Postgres
  real de dev). Total del proyecto: **20/20 tests pasando**
  (`node --test`).

**Decisiones/cambios de diseño hechos sobre la marcha, fuera de lo que
proponía el plan original de la fase** (a pedido explícito del usuario,
verificado con él en cada paso):

1. **El logo dejó de ser una imagen.** El PNG (`logo.png`) tenía fondo de
   color que contrastaba mal con el fondo blanco del sitio. Se reemplazó en
   TODO el sitio (header, home, footer) por un wordmark de texto: "Donna"
   en negrita + "Style" sin peso extra, tipografía Merriweather, color
   `--text`. El archivo `logo.png` sigue en el repo pero ya no se usa en
   ninguna vista — la dueña va a resolver el logo de imagen más adelante.
   El favicon (`logo-cuadrado.png`) NO cambió, sigue siendo la imagen.
2. **Navegación rediseñada dos veces** durante esta fase: primero un mega
   menú horizontal con hover (como proponía el diseño original), después
   pasó a click/tap con panel vertical anclado al botón, y finalmente a un
   **drawer lateral de ancho completo** disparado por un ícono de
   hamburguesa — el diseño final vigente, no lo que describía la propuesta
   original de la fase. Si se retoma esta fase o se referencia el
   design.md original en Engram, ese documento **no** refleja el estado
   actual del header — confiar en el código, no en el diseño archivado.
3. **`ZONA_DE_ENVIO` cambió de "Córdoba Capital" a "Todo el país"** — dato
   real de negocio, decisión de la dueña, actualizado en `prompt.md` §0 (la
   fuente de verdad) y en todos los textos que lo mencionaban
   (`db/seeds/site-settings.js`, `footer.ejs`).
4. **Bug encontrado y corregido**: el seed nunca pasaba `sort_order` al
   crear categorías, así que el orden cae a alfabético en vez de al orden
   real de §0.1. Corregido en `db/seed.js` (usa el índice del array como
   `sort_order`).

**Nota técnica importante para quien retome esto**: `backdrop-filter` (la
clase `backdrop-blur*` de Tailwind) crea un "containing block" para
cualquier descendiente con `position: fixed`. El panel del drawer es
`fixed`, así que **nunca** hay que ponerle `backdrop-blur` directo a un
ancestro del drawer (como `<header>`) — hay que ponerlo en una capa de
fondo separada (ver `partials/header.ejs`, el `<div class="absolute
inset-0 -z-10 ... backdrop-blur-sm">` que es hermano, no ancestro, del
contenido que incluye el drawer).

**Ciclo SDD cerrado** (2026-07-29): `sdd-verify` corrido sobre el estado
actual del código (no sobre el `design.md` original, desactualizado en los
3 puntos de arriba) — 10/10 tasks completas, reglas de `CLAUDE.md`
verificadas (SQL parametrizado, `<%= %>` salvo descripción sanitizada, sin
`innerHTML`, `availability.js` single-sourced). 20/20 tests confirmados
desde Windows con Postgres levantado. `sdd-archive` corrido después,
engram-only (no hay `openspec/` en este proyecto). Cadena de trazabilidad
en Engram: proposal #332 → design #333 → tasks #334 → apply-progress #335
→ verify-report #336 → archive-report #337.

**Pendiente, no bloqueante**: `design.md` (#333) sigue desactualizado en
logo/nav/zona de envío — solo higiene de documentación, no afecta el
cierre.

**Fuera de alcance de Fase 3, diferido a propósito**:
- Lightbox real con zoom de la ficha de producto → Fase 7 "Pulido".
- Buscador (§5.11) sigue sin fase asignada.

### Fase 4 — Carrito ✅ cerrada

Carrito 100% en sesión (`req.session.cart`, sin tabla `cart`/`cart_items`),
respaldado en Postgres vía `express-session` + `connect-pg-simple` con
tabla `session` propia (migración `006_session.sql`, `createTableIfMissing:
false` — el auto-create de la librería quedaría fuera de
`schema_migrations`), TTL rolling de 30 días, poda automática
(`pruneSessionInterval`). CSRF con synchronizer-token hecho a mano
(`src/middleware/csrf.js`, ~25 líneas, sin dependencia nueva — `csurf` está
deprecado). Selectores de talle/color de card y ficha ahora son
interactivos de verdad (antes estáticos): el servidor precalcula una tabla
de decisión (`availability.buildDecisionTable`) y el cliente
(`variant-selector.js`) solo la lee/renderiza, nunca recalcula — mismo
principio de servicio único que `availability.js`. Cada POST de
agregar/actualizar/eliminar revalida contra la DB viva, nunca confía en lo
que manda el cliente. Drawer de carrito + página `/carrito` completa, con
revalidación de stock automática en cada apertura (ajusta cantidad o saca
la línea si perdió stock, con aviso inline). Ícono de carrito reincorporado
al header. 62/62 tests (`node --test`), corridos contra Postgres real.
Ciclo SDD completo: proposal → spec → design → tasks → apply → verify →
archive, Engram #340-#346.

**Bugs reales encontrados en QA manual post-`apply`, todos corregidos**
(ver `sdd/donna-style-web-phase4-carrito/apply-progress` en Engram para el
detalle completo):
1. `/carrito` reventaba (`menuTree is not defined`) porque `cart.js` nunca
   cargaba el menú/anuncios — esa carga vivía solo en `public.js`, montado
   después. Se subió el middleware a `app.js` para que aplique a ambos
   routers.
2. El manejador de errores de `app.js` no pasaba `csrfToken` de fallback a
   la página 500, causando un doble fallo si el error original ocurría
   antes de que corriera `ensureToken`.
3. **Selectores de variante no respondían al click** (bug bloqueante): la
   tabla de decisión se embebía con `<%= JSON.stringify(...) %>` dentro de
   `<script type="application/json">` — ese tag es "raw text" en HTML, el
   parser nunca decodifica entidades ahí adentro, así que el escape de EJS
   dejaba el JSON roto (`JSON.parse` fallaba en silencio, sin error de
   servidor). Se agregó `toScriptJson()` en `src/services/format.js`
   (neutraliza `<`/`>`/`&` a nivel de JSON, no de entidades HTML) y se
   cambió a `<%- toScriptJson(...) %>`. **Segunda excepción documentada en
   `CLAUDE.md` §3** a la regla de "siempre `<%= %>`" (la primera es la
   descripción del producto vía `sanitize-html`).
4. Animación de fade no deseada al cambiar de talle/color — sacada entera.
5. Los botones de talle/color se achicaban apenas cargaba el JS (el
   render de JS usaba una clase más chica que el render inicial del
   servidor) — unificados a un tamaño con target táctil de 44px.
6. `/carrito` no se actualizaba visualmente al cambiar cantidad (aunque el
   POST funcionaba) — `cart.js` usaba `document.querySelector` (el primero
   que matchea) para contenedores que el drawer y la página `/carrito`
   comparten (`data-cart-lines`, etc.), así que la actualización siempre
   pegaba en el drawer oculto. Corregido a `querySelectorAll` + loop, y
   `cart.ejs` reestructurado para tener siempre ambas ramas (vacío/con
   líneas) en el DOM, alternadas por clase, igual que ya hacía el drawer.
7. Mensajes de validación en inglés (tooltip nativo del navegador para
   `min`/`max` en cantidad) — se agregó `novalidate` a los 3 forms
   afectados, ya que el servidor limita la cantidad al stock vivo en
   silencio.

**También corregido en esta fase, sin relación al carrito**: flake real en
`test/models/carousel-slides.test.js` — comparaba `ends_at` contra el
instante exacto de `now()`, sin margen frente al drift de reloj entre
Node/WSL y el contenedor de Postgres. Se le dio 24-48hs de margen.

**Bug adicional encontrado post-`archive`, en QA mobile** (Fase 4 ya
estaba cerrada en Engram #340-#346 cuando apareció; documentado acá en vez
de reabrir el ciclo SDD):
8. En mobile el panel del carrito ocupa el 100% del ancho (`w-full`, solo
   pasa a `sm:w-[420px]` en desktop), así que el fondo oscuro que cierra al
   tocar afuera quedaba sin área tapable — la única forma de cerrar era
   vaciar el carrito y usar el link "Ver catálogo". A diferencia del drawer
   de navegación (`nav-drawer.ejs`), que sí deja `w-[85vw]` de backdrop
   visible incluso en mobile.
   Arreglado con un botón ✕ visible dentro del panel
   (`cart-drawer.ejs`), enganchado de forma **genérica** en
   `menu-animate.js` vía el atributo `data-menu-close` (nuevo, sumado al
   set ya existente `data-menu-panel/backdrop/drawer`) — cualquier drawer
   futuro que lo necesite solo tiene que agregar un botón con ese atributo
   adentro, sin tocar el JS de nuevo. Sin JS, el botón no hace nada (mismo
   nivel de degradación aceptable que ya tenía el cierre por click-afuera).

### Fase 5 — Checkout por WhatsApp ✅ cerrada

Un solo router nuevo (`src/routes/checkout.js`) con `GET/POST /checkout` +
`GET /pedido/:token`, montado en `app.js` entre `cartRouter` y
`publicRouter` (mismo bug class que `/carrito` en Fase 4: el comodín
`/:parentSlug` de `public.js` lo hubiera capturado si se montaba después).
Servicio puro nuevo `src/services/orders.js` (`buildWhatsappMessage`,
`buildShortMessage`, `buildWaLink`) sin acceso a DB ni a `req`, hecho con
TDD estricto (RED-first, 11 tests) — arma el mensaje de §5.8 con truncado a
encabezado+total+link cuando el pedido supera 15 items o el mensaje
codificado (`encodeURIComponent`, nunca el raw) supera 1500 caracteres.
`ordersModel.findByToken` agregado (2 queries parametrizadas, sin JOIN)
para la lectura pública.

**Regla más estricta que design.md, confirmada por spec**: la revalidación
de stock en el POST bloquea el checkout ENTERO (sin crear `orders`/
`order_items`) si ajustó o quitó CUALQUIER línea — no solo cuando el
carrito queda vacío. El diseño original solo contemplaba el caso vacío;
`tasks.md` lo corrigió antes de `apply` a favor del spec.

**Deviation deliberada de §5.8 paso 4** (documentada desde `proposal`):
nunca hay redirect automático del servidor a `wa.me`. La clienta siempre
aterriza primero en una página de confirmación propia
(`checkout-confirm.ejs`) con el link `wa.me` clickeable y el aviso
explícito de que hay que tocar "Enviar" en WhatsApp — mismo resultado que
el flujo de prompt.md, pero sin arriesgar que ese aviso se pierda detrás de
un salto automático de pestaña.

Snapshot anti-tampering igual que Fase 4: `product_name_snapshot`/`size`/
`color`/`unit_price`/`quantity` de `order_items` salen siempre de
`cart.summarize()` sobre filas vivas (`variantsModel.findByIds`), nunca del
body del POST — el body solo aporta `nombre`/`nota`/`_csrf`, ambos
opcionales. `whatsapp_sent_at` queda `NULL` a propósito (no hay señal
confiable de que la clienta apretó enviar; Fase 6 trata `NULL` como
"pendiente de contacto", no como "no es un pedido real").

`noindex` nuevo en `layouts/main.ejs`, mismo patrón opcional que
`metaDescription`, usado por `/pedido/:token` y la confirmación de
checkout. CTA "Finalizar pedido" conectado en `cart.ejs` y
`cart-drawer.ejs`. 83/83 tests (`node --test`, +21 sobre Fase 4), corridos
contra Postgres real. Tamaño de PR con excepción aceptada
(`size:exception`, ~872 líneas) — mismo criterio que Fase 4.

El `SITE_URL` que arma el link de `/pedido/{token}` en el mensaje de
WhatsApp sale de `config.SITE_URL` (`.env`), nunca hardcodeado — en
desarrollo apunta a `localhost`, en producción solo hay que cambiar esa
variable.

**Flake real encontrado en QA post-`apply`, corregido**: el helper
`addToCart` de `test/routes/checkout.test.js` no drenaba el body de la
respuesta (`await res.json()`) antes de disparar el siguiente POST a la
misma sesión — a diferencia de todos los helpers ya probados en
`cart.test.js`. Sin drenar, dos POSTs seguidos podían pisarse por reuso de
conexión keep-alive de `fetch`, perdiendo la primera línea agregada al
carrito ~30-50% de las veces. Corregido; confirmado con 5 corridas
completas seguidas en verde.

Ciclo SDD completo: proposal → spec → design → tasks → apply → verify →
archive, Engram #349-#355.

## Fases sin empezar

6. **Panel de administración** — auth, CRUD, generación de variantes,
   `sharp` para imágenes (ninguna dependencia de imágenes real instalada
   todavía, ni `multer` ni `sharp`), stock, pedidos, carrusel, config
   (incluida la barra de anuncios, hoy hardcodeada en el seed).
7. **Pulido** — SEO (JSON-LD, sitemap.xml, robots.txt, OG tags — nada de
   esto existe todavía), accesibilidad fina, performance, lightbox/zoom de
   la ficha, páginas de error visualmente pulidas (`404.ejs`/`500.ejs`
   existen pero son básicas), README de despliegue.

## Entorno / recordatorios operativos

- **npm SIEMPRE desde la terminal de Windows, nunca desde WSL** (rompe los
  binarios nativos si se instala cruzado).
- Después de cambiar clases de Tailwind o `input.css`, hay que correr
  `npm run build:css` — el CSS no se recompila solo, y "todo sin estilo" es
  el síntoma clásico de olvidarse este paso.
- `npm install` y `sanitize-html`/`nanoid` ya están instalados a esta
  altura — no hace falta volver a pedirlo salvo que se agregue una
  dependencia nueva.
- Base de datos: `docker compose up -d db`, después `node db/migrate.js` y
  `node db/seed.js` para resetear con datos de prueba (el seed hace
  `TRUNCATE` — nunca corre si `NODE_ENV=production`).
- `.env` real ya existe (copiado de `.env.example`); si se agregan
  variables nuevas hay que sincronizarlo a mano — `.env` está bloqueado
  para edición directa por permisos de seguridad de la sesión.
- Todos los ~19 productos y las imágenes son **datos de prueba**, se
  reemplazan/borran cuando la dueña cargue el catálogo real desde el panel
  (Fase 6).
