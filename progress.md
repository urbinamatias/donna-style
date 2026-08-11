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

### Fase 6a — Admin: autenticación + CRUD de productos/categorías ✅ cerrada

**La Fase 6 original se dividió en sub-fases** (decisión de esta sesión,
dado el tamaño): 6a (esta, auth + productos/categorías) → 6b (imágenes,
`sharp`/`multer`) → 6c (stock + pedidos) → 6d (carrusel + configuración).
Cada una con su propio ciclo SDD completo.

Auth con `bcryptjs` (NO el `bcrypt` nativo — mismo motivo que obliga a
correr `npm install` desde Windows para `sharp`: un binario compilado en
un entorno rompe en el otro), cookie de sesión reutilizando la infra de
Fase 4, rate limiting de login **por IP** (no global, para que nadie pueda
bloquear a la única cuenta admin mandándole intentos fallidos a
propósito), con barrido de expiración y tope de 10k claves en el mapa en
memoria. Primer admin se crea con `node db/scripts/create-admin.js
--email ... --password ...` (nunca un formulario público de registro —
hay una sola cuenta).

CRUD completo de categorías (reutiliza el trigger de profundidad máxima 2
de Fase 2, nunca lo duplica en JS) y productos, con generación de
variantes talle×color. `src/services/sizes.js` nuevo: deriva el orden
canónico (XS→XXXL, numéricos ascendentes) — **no existía nada que
reusar de `availability.js`** pese a la suposición inicial del explore;
`availability.js` solo consume `size_order` ya calculado, nunca lo
deriva.

**Decisiones confirmadas esta sesión**:
- Producto sin imágenes se guarda `is_active=false` (borrador) — no puede
  activarse hasta tener al menos una foto real (eso llega en 6b).
- Borrar un producto con pedidos asociados está BLOQUEADO a nivel
  aplicación (`hasOrders()`) — la FK de `order_items.variant_id` es
  `ON DELETE SET NULL`, no `RESTRICT`, así que sin este chequeo explícito
  el borrado se permitiría en silencio.
- Borrar una categoría con productos asignados también está bloqueado
  (`hasProducts()`) — nunca deja productos por debajo del mínimo de 1
  categoría (§3.3).
- El slug del producto queda **congelado** al renombrar — cambiarlo
  requiere tocar el campo a propósito, para no romper links de
  WhatsApp/redes ya compartidos.

**Bugs reales encontrados en QA manual post-`apply`, corregidos**:
1. El filtro de categoría del listado admin exigía match exacto —
   filtrar por una categoría padre (ej. "Abrigos") no traía los productos
   de sus hijas ("Camperas y chaquetas"), a diferencia de "Ver todo en
   Abrigos" del lado cliente. `findAllForAdmin` no tenía ningún test
   (gap real del `apply` original). Corregido con el mismo patrón de
   rollup que `public.js`, + 3 tests nuevos.
2. **El drag-and-drop de talles se sacó por completo**, a pedido
   explícito: no funcionaba en mobile y colgaba la página en desktop.
   El orden de talles ahora es SIEMPRE automático (más chico a más
   grande) — supera la decisión original de diseño ("el reorder manual
   sobrevive a ediciones no relacionadas"), que queda obsoleta.
3. Pasada de diseño visual completa en las 6 vistas del panel: texto más
   grande, secciones con bordes marcados y encabezado propio, "Guardar" y
   "Borrar producto" ahora del mismo tamaño (naranja vs. rojo con texto
   blanco), mismo criterio en categorías y login.

143/143 tests (`node --test`, +37 sobre Fase 5), corridos 2 veces
seguidas contra Postgres real sin flakeo. Tamaño de PR con excepción
aceptada (`size:exception`) — mismo criterio que Fases 4 y 5, pese a que
el diseño ofrecía un split en 3 PRs encadenados.

Ciclo SDD completo: proposal → spec → design → tasks → apply → verify →
archive, Engram #358-#364.

### Fase 6b — Panel: imágenes de producto ✅ cerrada

`sharp` + `multer` (nativo el primero — primera dependencia con binario
real desde el scaffold inicial, `npm install` **siempre desde Windows**).
Pipeline en `src/services/images.js`: recorte centrado 3:4, 3 anchos
(400/800/1400px) en WebP calidad 82, normalización de nivel, strip de
EXIF — mismo pipeline para uploads reales y para el seed (sin rama
legacy). `product_images.filename` pasó a `base_key` (migración 007,
opaco, sin extensión) — toda URL se arma con
`src/services/image-urls.js`, único punto de la app que conoce el
esquema (`product-card.ejs`, `product.ejs` y `cart.js` pasan los tres por
ahí). Validaciones: lado corto ≥1000px, MIME real (magic bytes, nunca
extensión/header declarado), 12MB por archivo, JPEG/PNG/WebP/HEIC (HEIC
porque la dueña saca fotos con iPhone — confirmado que sharp lo soporta
en esta instalación). Reorder de fotos por botones ↑↓ (nunca drag,
mismo criterio que las variantes de 6a). Borrar la última foto de un
producto activo está bloqueado.

**Bug de seguridad real encontrado y corregido en diseño**: el CSRF
global leía `req.body._csrf`, pero en `multipart/form-data` el body
recién existe después de que `multer` lo parsea — sin el fix, CUALQUIER
subida sin JS daría 403 siempre. `csrfProtection` ahora difiere la
verificación en requests multipart; las rutas de imágenes la hacen ellas
mismas después de `multer` (`verifyToken(req)`, exportado desde
`csrf.js`). Con test que fija el bug real (RED confirmado antes del fix).

**QA extensa en dos rondas, con cambios reales de comportamiento**
(documentados en detalle en Engram, `apply-progress` #371):
1. **Bug grande**: la sección "Imágenes" vivía anidada DENTRO del
   `<form>` principal del producto — HTML inválido. El navegador cierra
   el form principal apenas encuentra el primer `</form>` interno, así
   que Categorías/Visibilidad/Variantes y el botón "Guardar" de abajo
   quedaban fuera de cualquier form (no hacían nada al click), y el
   "Guardar" del texto alternativo mandaba `_csrf` duplicado (array, no
   string → CSRF inválido). Corregido moviendo Imágenes afuera de
   `#product-form`, con test de regresión que escanea la página en busca
   de forms anidados.
2. **Bug real**: `parseVariantsFromBody` descartaba en silencio la
   variante de productos de un solo SKU sin talle ni color ("Sin talle")
   — el filtro exigía talle O color presente.
3. **Bug real**: el hover de la card apagaba la foto principal sin
   chequear si había una segunda para reemplazarla — en productos de una
   sola imagen, la foto "parpadeaba" al pasar el mouse.
4. **Decisión revertida de Fase 4, a pedido explícito**: pedir más
   cantidad que el stock disponible ahora se **rechaza** (400, mensaje
   claro) en `/carrito/agregar` y `/carrito/actualizar`, en vez de
   cappear en silencio como decidía Fase 4 originalmente.
5. **Cambio de alcance grande, a pedido explícito (dos veces)**: `/nuevo`
   y `/editar` eran experiencias distintas porque subir fotos requería
   que el producto ya existiera. Ahora `POST /admin/productos` (crear)
   acepta `multipart/form-data` y procesa las fotos en la MISMA
   transacción que crea el producto — si hay fotos y "Activo" está
   tildado, el producto queda activo de una. `uploadImagesForProduct()`
   se extrajo como función compartida entre crear y agregar-fotos-a-un-
   producto-existente, para no duplicar el pipeline.
6. Selector de talle/color con una única combinación: **no** se resuelve
   con texto plano (primer intento, incorrecto) sino mostrando el mismo
   selector interactivo de siempre — con un solo botón por eje, ya
   seleccionado, sin opción de elegir otra cosa porque no existe.
7. "Generar grilla" con Talle y Color vacíos ahora requiere al menos un
   eje cargado, salvo que se tilde a propósito el checkbox "Este
   producto no tiene talles ni colores (SKU único)".
8. Texto alternativo de cada foto ya no tiene su propio botón "Guardar"
   — se edita junto con el resto del producto (input fuera de
   `#product-form` en el DOM, pero asociado vía el atributo HTML5
   `form="product-form"`).
9. Sistema de avisos de éxito/error (`adminNotice`, mismo patrón que los
   avisos del carrito) — crear/editar/borrar producto o categoría ahora
   confirma qué pasó. Editar vuelve al listado; crear también (ya no
   hace falta ir a "Editar" después).
10. Stock disponible visible como texto simple en la ficha ("Stock
    disponible: N"), siempre que hay una variante determinada.

187/187 tests (`node --test`, confirmado por la dueña desde Windows).
Tamaño de PR con excepción aceptada (`size:exception`) — el diseño
original ofrecía split en 3 PRs, se mantuvo el mismo criterio de fases
anteriores.

Ciclo SDD completo: proposal → spec → design → tasks → apply → verify →
archive, Engram #367-#373.

### Fase 6c — Panel: stock + pedidos ✅ cerrada

Tabla de stock (`/admin/stock`) filtrable por producto y por stock bajo
(umbral fijo `stock <= 2`, mismo concepto que "Quedan 2"/"¡Es el último!"
de la ficha pública — centralizado en `src/services/orders-status.js`,
`LOW_STOCK_THRESHOLD`), edición en lote en una sola transacción
(`variantsModel.updateStockBulk`). Listado/detalle de pedidos
(`/admin/pedidos`) con cambio de estado
(pendiente/confirmado/entregado/cancelado). Máquina de transiciones única
fuente de verdad en `orders-status.js` (`TRANSITIONS`): pendiente→confirmado
o cancelado; confirmado→entregado o cancelado; cancelado→pendiente
(reabrir); entregado terminal. `pendiente→entregado` directo bloqueado a
propósito, para garantizar que el stock siempre se descuenta antes de
entregar.

**Únicas dos transiciones que mueven stock** (confirmado esta fase):
pasar a "confirmado" descuenta stock de cada variante del pedido; pasar de
"confirmado" a "cancelado" lo repone. Todo vía `withTransaction` con CAS
(`SELECT ... FOR UPDATE` + `UPDATE orders ... WHERE status = <leído>`) para
que dos confirmaciones o cancelaciones simultáneas nunca muevan stock dos
veces, y descuento guardado (`UPDATE variants ... WHERE stock >= $1` +
assertion de `rowCount`) para que confirmar con stock insuficiente rechace
TODA la transacción con mensaje claro, en vez de reventar el CHECK de la
DB. Items con `variant_id NULL` (variante borrada) se saltean, nunca
rompen. Dashboard completado con las 3 métricas reales: pedidos
pendientes, productos sin stock (TODAS las variantes en 0, no "alguna"),
productos activos — las tres con link funcional a su vista filtrada.

**QA extensa post-apply, con bugs reales de datos encontrados y
corregidos** (no solo estética, documentados en detalle en Engram
`sdd/donna-style-web-fase6c-stock-pedidos/verify-report` #383):

1. **Bug crítico, mismo patrón que el de `image_alt` de Fase 6b**: `qs`
   (usado por `express.urlencoded({extended:true})`) interpreta un
   bracket-key puramente numérico (`stock[<id>]`, `original[<id>]`) como
   índice de array, no clave de objeto, cuando el id es <= su `arrayLimit`
   (20) — y compacta arrays dispersos, perdiendo los ids reales. En Stock
   era peor que en `image_alt`: al haber MUCHOS ids en un solo submit
   (toda la tabla), se mezclaban entre filas — explica el síntoma
   reportado en QA ("a veces resetea a 0", "0 variantes actualizadas",
   inconsistente según qué producto"). Fix: prefijo `v_` en las claves,
   igual criterio que `image_alt[img_<id>]`. **Regla de proyecto
   confirmada dos veces ya**: cualquier `name="algo[<id_numerico>]"` bajo
   `express.urlencoded({extended:true})` necesita un prefijo no-numérico.
2. Mensaje de error de stock inválido identifica producto + talle/color
   (vía `variantsModel.findByIds`), no el id interno — inservible para la
   dueña con varias filas editadas a la vez.
3. Dashboard "Productos sin stock" enlazaba al filtro de stock bajo de
   variante (`/admin/stock?bajo=1`) en vez de "todas las variantes en 0"
   a nivel producto — filtro real nuevo `estado=sin_stock` en
   `/admin/productos` (`productsModel.findAllForAdmin({ outOfStock })`).
   "Productos activos" no tenía link, ahora sí.
4. "Stock disponible"/"Quedan N" en la ficha pública eran texto estático
   calculado una vez en el server — nunca se actualizaban al cambiar de
   talle/color (bug real, no solo cosmético). `variant-selector.js` ahora
   los sincroniza (`data-stock-available`/`data-stock-warning`) igual que
   ya hacía con el máximo de cantidad.
5. SKU pasó de campo editable "opcional" en la grilla de variantes a
   100% automático (`variantsModel.autoSku`, formato
   `SKU-<productId>-<TALLE>-<COLOR>`) — decisión explícita: "la dueña no
   sabe qué es un SKU y no tiene por qué saberlo". Sacado de
   `variant-grid.js` y de la tabla de Stock.
6. Bug de build, no de código: `tailwind.config.js` no escaneaba
   `src/services/`, así que las clases de color que arman
   `orders-status.js` (badges de estado, `transitionButtonClass`) nunca
   se generaban en el CSS final — el botón "Confirmar" salía transparente,
   "Pendiente"/"Confirmado" sin relleno, sin ningún error visible. Se
   agregó `./src/services/**/*.js` al `content` de Tailwind.
7. Parpadeo de hover en las cards del catálogo (persistía pese a dos
   intentos de arreglo — `loading="lazy"` en la segunda foto,
   `will-change: opacity` para forzar capa de composición — incluso con
   dos fotos idénticas): decisión explícita de sacar la reacción al hover
   del todo. La card ya no tiene segunda imagen ni crossfade, solo
   reacciona al click.
8. Diseño: botón "Guardar" de Stock movido a la barra de filtros (antes
   al final de la tabla), botón "Volver al listado" en detalle de pedido,
   badges de estado con color de fondo (pendiente ámbar, confirmado azul,
   entregado verde, cancelado rojo) y botones de transición coloreados
   por semántica, todo con una sola fuente de verdad en
   `orders-status.js`.
9. **Desvío de diseño confirmado a propósito**: `design.md` original
   especificaba `containerClass: 'max-w-5xl'` (ancho de escritorio) para
   Stock/Pedidos. A pedido explícito de la dueña, se revirtió: ambas
   vistas usan el mismo ancho por defecto (`max-w-2xl`) que
   Dashboard/Categorías/Productos, para que el panel se vea uniforme.
   Las tablas mantienen su propio scroll horizontal (`overflow-x-auto`)
   para no romper contenido en pantallas angostas.

247/247 tests (`node --test`, confirmado por la dueña desde Windows, dos
veces tras las rondas de QA). Sin migraciones nuevas — el esquema de
`variants`/`orders`/`order_items` ya cubría todo.

Ciclo SDD completo: proposal → spec → design → tasks → apply → verify →
archive, Engram #376-#384.

### Fase 6d — Panel: carrusel + configuración ✅ cerrada

CRUD de `carousel_slides` (`/admin/carrusel`): alta desde una sola foto,
edición de metadata (alt text, link, ventana de vigencia `starts_at`/
`ends_at`) sin volver a subir imagen, reorder ↑/↓, borrado real (fila +
archivos). Mismos 3 estados del home ya establecidos (0 slides → nada;
1 → fijo sin JS; 2+ → carrusel con rotación). Migración de
`WHATSAPP_ADMIN`/`INSTAGRAM`/`EMAIL_CONTACTO`/`CUIT` de `.env` a
`site_settings` vía un resolver de 3 niveles
(`src/services/store-config.js`: panel → `.env` → default), con whitelist
explícita de lo que llega a las vistas (`.env` completo se filtraba antes,
exponiendo `SESSION_SECRET`/`DATABASE_URL` a cualquier página pública — cerrado
esta fase). Validación de WhatsApp/CUIT (mod-11, aviso no bloqueante) y
`normalizeLinkUrl` (bloquea XSS vía `javascript:` en el link de cada slide).
Migración 008: `carousel_slides.image_desktop` → `base_key` opaco, mismo
patrón que la 007 de Fase 6b.

**Cambio de diseño grande a mitad de QA, confirmado por la dueña**: el
diseño original (y la propuesta que lo justificaba) asumía que los slides
eran FOTOS, forzando un recorte a relación de aspecto fija (2.5:1
desktop / 4:5 mobile) vía `sharp`, con un derivado mobile separado. Al
probarlo, la dueña aclaró que los slides son piezas de diseño ya armadas
(banners de Canva/similar sobre promociones) — recortarlas cortaba texto y
logos. Se revirtió a un único perfil `carousel` sin recorte
(`aspectRatio: null` → `fit: 'inside'`, preserva la proporción original),
sin derivado mobile: una sola imagen sirve para cualquier pantalla. El
contenedor público mantiene alto fijo (para que el carrusel no cambie de
tamaño al rotar entre slides de proporciones distintas) pero con
`object-contain` y fondo detrás — la imagen se ve siempre completa, nunca
recortada. `spec.md`/`design.md` de esta fase quedan desactualizados a
propósito (describen el diseño con recorte); el verify-report (Engram
#393) es el registro autoritativo del diseño final.

**QA con bugs reales encontrados y corregidos**:
1. Crear un slide fallaba siempre ("Subí una foto para crear el slide")
   — el atributo `enctype="multipart/form-data"` se armaba como string
   dentro de un output EJS escapado, que convertía las comillas en
   entidades HTML y rompía el atributo; el navegador caía al enctype por
   defecto, que no puede llevar archivos.
2. El fix del bug anterior rompió Editar (CSRF inválido) al dejar el
   enctype siempre presente — la ruta de editar no tiene `multer`, así
   que con Content-Type multipart nadie parseaba `req.body._csrf`. Fix
   correcto: el atributo va condicional de nuevo, pero como bloque de
   control de EJS, nunca como string interpolado.
3. Vaciar Instagram/mail en Configuración no los sacaba del footer — el
   resolver de 3 niveles no distinguía "nunca se guardó nada" de "se
   guardó vacío a propósito": ambos caían al fallback de `.env`. Fix: si
   hay fila en `site_settings` (la dueña guardó Configuración), el panel
   gana siempre, incluso vacío.
4. **Bug real de Fase 3/4, expuesto recién ahora**: talle y color se
   restringían mutuamente en el selector de variantes — con combinaciones
   parciales (ej. solo S/Rojo y L/Azul en stock), elegir un color ocultaba
   el talle que no combinaba con él, dejando a la clienta sin poder
   alcanzar la otra combinación. La regla correcta (ya documentada en
   `prompt.md` §3.2 pero nunca implementada así): talle es siempre el eje
   maestro, visible completo; color se recalcula según el talle elegido
   — asimétrico, no mutuo.

251/251 tests no dependientes de `sharp` corridos también desde WSL como
segunda evidencia; suite completa confirmada en verde por la dueña desde
Windows tras cada ronda de QA.

Ciclo SDD completo: proposal → spec → design → tasks → apply → verify →
archive, Engram #387-#394.

### Fase 7 — Pulido: SEO ✅ cerrada

Slice de Fase 7 (de las varias que componen "Pulido", ver más abajo).
Alcance: title/meta description/Open Graph por página, JSON-LD `Product` en
ficha reflejando stock real, `sitemap.xml` y `robots.txt` dinámicos
(§10.4 de `prompt.md`).

**Decisiones tomadas**:
1. `STORE_DESCRIPTION` (fallback de meta description cuando no hay
   descripción propia, home incluida): *"Donna Style — moda femenina
   online. Encontrá tu talle, elegí tu color y comprá fácil: coordinamos
   todo por WhatsApp."* — excepción deliberada al "principio de ausencia"
   (§4.5), confirmada por la dueña: mejor tener siempre description que
   omitirla.
2. Imagen OG/JSON-LD por defecto sin foto propia: `logo-cuadrado.png`
   existente (no hay asset dedicado 1200×630 todavía).
3. Moneda fija `ARS` vía constante `CURRENCY` en `format.js` (consolida
   los dos hardcodes que ya existían en `format.js` y `cart.js`; el de
   `cart.js` queda como literal con comentario — es JS de cliente sin
   módulos, no puede importar la constante).
4. `SITE_URL` sigue viniendo de `config/env.js` tal cual, sin dominio
   hardcodeado — hoy default `localhost`. **Pendiente**: definir el
   dominio real de producción en `.env` antes de deploy; toda URL
   absoluta (OG, canonical, JSON-LD, `<loc>` del sitemap) depende de eso.
5. **Deuda preexistente encontrada, no de esta fase**: `helmet`/CSP no
   están instalados en el proyecto pese a que `CLAUDE.md` §3 los da por
   sentados "a partir de la fase que sirva HTML con scripts" (esa fase ya
   pasó). El JSON-LD quedó preparado con un `nonce` opcional
   (`res.locals.cspNonce`) para cuando se agregue esa capa, pero agregar
   CSP en sí queda fuera de este slice.

**Implementado** (services/seo.js nuevo, wiring en public.js/cart.js/
checkout.js, sitemap.js nuevo montado en app.js antes del router público,
`findAllActiveSlugs` en el modelo de productos, slots de `<head>` en
`main.ejs` vía `toScriptJson()` — mismo patrón seguro que la
disponibilidad de variantes de Fase 4). Todos los tests en verde
(`node --test` desde Windows, con `node db/migrate.js` + `node
db/seed.js` corridos — el seed YA sembraba `whatsapp_admin`/`instagram`/
`email_contacto`/`cuit`, un fallo intermitente reportado en QA era solo
por DB sin sembrar, no bug de código). Un segundo fallo visto en una
corrida (`countWithoutStock` con delta antes/después) desapareció al
re-correr: flakiness preexistente por tests de archivos distintos
compitiendo sobre la misma tabla `products` en Postgres real, agravado
(no causado) por sumar 3 archivos de test nuevos en esta fase — no se
tocó la función.

**QA manual de la dueña, completado esta sesión** (checklist de 7 puntos:
home, categoría, ficha de producto, carrito/checkout/pedido, sitemap,
robots.txt, compartir en redes):
1-6. Verificados en `localhost`, todos correctos: title/meta description/
   canonical/OG por tipo de página, `noindex` en páginas privadas sin
   OG/canonical, `/sitemap.xml` y `/robots.txt` con el contenido esperado.
   JSON-LD `Product` validado en el Rich Results Test de Google (pestaña
   "Code", HTML completo pegado — la pestaña "URL" no sirve con
   `localhost`): 1 elemento válido detectado ("Buzo Oversize"), con 2
   advertencias no críticas (`aggregateRating`/`review` faltantes, ambos
   opcionales) — resultado esperado y correcto: la tienda no tiene sistema
   de reseñas, así que no hay dato real que emitir ahí (mismo "principio
   de ausencia" del resto del proyecto — nunca simular un rating falso).
7. **Pendiente, documentado, no bloqueante para el cierre de esta fase**:
   compartir en redes/WhatsApp (Facebook Sharing Debugger u equivalente)
   no se pudo probar porque requiere una URL pública — con `SITE_URL`
   apuntando a `localhost` los previsualizadores externos no pueden
   traer la imagen. Queda para cuando haya dominio real o un túnel
   (`ngrok`) antes del deploy — mismo punto ya anotado más arriba sobre
   `SITE_URL`.

`sdd-verify` corrido (Engram #402): 0 críticos, 2 advertencias — ambas
resueltas o ya documentadas como aceptadas (ver abajo). 38/39 tasks
completas (la única pendiente es el punto 7, diferido a propósito).
Suite completa confirmada por la dueña desde Windows tras el verify:
**368/368 tests en verde** (`node --test`, 34.2s) — cierra la advertencia
que había quedado abierta sobre las suites de rutas (`sitemap`/`public`/
`cart`/`checkout`) nunca ejecutadas de verdad en WSL por el bloqueo de
`sharp` (§1 de `CLAUDE.md`); el verify ya las había validado por lectura
estática, ahora hay evidencia de ejecución real también.

Commiteado en `main` (`153c9ad`, 20 archivos, ~936 líneas — excepción de
tamaño de PR aceptada por la dueña, un solo commit).

Ciclo SDD completo: proposal → spec → design → tasks → apply → verify →
archive, Engram #396-#403.

### Fase 7 (continuación) — Catálogo: card informativa + transferencia/cuotas ✅ cerrada

Cambio de diseño pedido por la dueña: la card de catálogo (home, categoría
con filtros, relacionados) deja de permitir elegir talle/color y agregar al
carrito inline — ese flujo queda exclusivamente en la ficha de producto
(`product.ejs`, sin cambios). En su lugar, la card muestra:

- Botón "Ver producto" (siempre navegable, incluso sin stock).
- Precio con transferencia/efectivo: `base_price * 0.7` redondeado, con
  aclaración textual del 30% OFF.
- 6 cuotas sin interés: `base_price / 6` redondeado — sobre el precio SIN
  el descuento de transferencia (son dos incentivos independientes).

Servicio puro nuevo `src/services/pricing.js` (`computeTransferPrice`,
`computeInstallmentValue`), mismo patrón sin DB que `availability.js`/
`format.js`, expuesto vía `app.locals` en `src/app.js`. El badge "% OFF"
preexistente (`compare_at_price`) no se tocó — es un concepto de negocio
distinto (promoción cargada por la dueña) y convive, diferenciado
visualmente, con el bloque nuevo.

**Decisión de negocio confirmada**: `product.base_price` es el "Precio
base" del panel admin — el precio de venta actual (post-promo), no un
precio "pre-variante". El cálculo del 30%/cuotas siempre usa `base_price`,
nunca `effectivePrice`/`price_override` de variante (evita ofrecer un
incentivo atado a una variante que ya no se puede elegir desde la card).

Tests: `test/services/pricing.test.js` (11 tests unitarios) +
`test/routes/public.test.js` (2 tests de integración nuevos). Suite
completa corrida por la dueña desde Windows: 380/381 en verde. El único
fallo (`admin-settings.test.js`, preview de `wa.me` en
`/admin/configuracion`) NO es un bug de código — es de estado de la DB:
el propio `test.after` de ese archivo borra las filas de
`whatsapp_admin`/`instagram`/`email_contacto`/`cuit` de `site_settings`
al terminar, así que si corrés la suite sin resembrar, el siguiente `GET`
arranca sin valor para mostrar el preview. Se soluciona con `node
db/seed.js` antes de `node --test` (mismo síntoma intermitente que ya se
había documentado en el cierre de Fase 7 SEO). No hace falta tocar
código.

**Ajuste visual tras QA de la dueña**: precio de lista pasa a `text-xl`
(protagonista de la card, antes tenía el mismo tamaño que el precio de
transferencia); el bloque de cuotas pasa de `text-xs` a `text-sm`
(levemente más chico que el de transferencia, no minúsculo); el copy del
bloque de transferencia se simplifica de "Precio con transferencia o
efectivo (30% OFF)" a "Efectivo/Transferencia" (decisión de la dueña,
prioriza el número grande sobre la aclaración textual del porcentaje).

**Extensión a la ficha de producto**: la dueña pidió la misma información
(precio efectivo/transferencia + cuotas) en `src/views/pages/product.ejs`
— es donde se decide agregar al carrito, tiene que verse lo mismo que en
el listado. Reutiliza `computeTransferPrice`/`computeInstallmentValue`
(ya en `app.locals`) sobre `product.base_price`, mismo criterio D3 que la
card. No se creó ningún servicio nuevo.

**Fix de infraestructura de tests** (no relacionado al feature en sí):
`package.json` script `test` pasa a `node --test --test-concurrency=1` —
`countWithoutStock` mide un delta antes/después contra `products` en
Postgres real, y con archivos de test corriendo en paralelo (default de
`node --test`) otro archivo podía crear/borrar productos sin stock en el
medio y romper el conteo. Correr con `npm test` (no `node --test` a
secas) para que aplique el flag.

Suite completa confirmada por la dueña desde Windows tras `node
db/seed.js` + `npm run build:css` + `npm test`: **382/382 en verde**.

Ciclo SDD completo: proposal → spec → design → tasks → apply, Engram
#404-#412 (con una lección aprendida en el camino: reusar el mismo
`topic_key` de un artefacto existente para guardar una decisión posterior
lo sobrescribe en vez de agregarlo — hay que usar un topic_key propio
para notas nuevas, o releer y reescribir el documento completo).

### Fase 7 (continuación) — Buscador, CTA de WhatsApp, color de marca plano ✅ cerrada

Cierra el TODO "buscador → sin fase asignada" que venía arrastrándose desde
Fase 3 (§5.11). Ciclo SDD completo (proposal → spec → design → tasks →
apply, Engram #413-#418), 4 commits atómicos directos en `main` (a pedido
explícito del usuario, en vez del split en 4 PRs que sugería `tasks.md`):

1. `bdcc8be` — Color de marca pasa de gradiente a plano `#F5AB56`
   (`text-brandInk` en vez de dos tonos), con contraste AA verificado en
   botones sólidos. Toca `input.css`/`tailwind.config.js` (se saca
   `brandTo`) + 6 vistas admin.
2. `549f1e2` — Middleware `floating-ui.js` nuevo: flag `hideFloatingUI` en
   `res.locals` para ocultar buscador y FAB de WhatsApp en rutas donde no
   corresponden (admin, checkout, etc.), TDD estricto.
3. `9a4469e` — CTA flotante de WhatsApp (`whatsapp-fab.ejs`), número desde
   `store-config.js` (`waDigits`, mismo resolver de 3 niveles de Fase 6d).
4. `a511125` — Buscador `GET /buscar`: `escapeLikeLiteral`/
   `searchActiveByName` en `models/products.js`, `normalizeTerm`/
   `searchProductsByName` en `services/search.js` (tolerante a acentos,
   trata `%`/`_`/`\` como texto literal, nunca wildcard), rate limit
   dedicado (`search-rate-limit.js`, reusa `fixedWindowRateLimit` extendido
   de `rate-limit.js`), ícono en el header (`search-toggle.ejs`). Ruta
   agregada a `Disallow` de `robots.txt`.

**QA post-`apply`, bugs reales corregidos** (`7f03596`):
- El panel de búsqueda del header no cerraba con click/touch afuera ni
  Escape — se enganchó al mismo mecanismo genérico ya usado por el drawer
  de navegación (`menu-animate.js`).
- El FAB de WhatsApp usaba un ícono SVG genérico — reemplazado por el logo
  real (`logo/whatsapp.png`), con `drop-shadow` sobre la imagen en vez de
  sombra de caja, para que siga el contorno real del ícono.
- Precio de cuotas no estaba en negrita (inconsistente con precio de lista
  y de efectivo/transferencia) en card de catálogo y ficha de producto —
  unificado.
- Bug de test (no de producto): el cleanup de `checkout.test.js` borraba
  la fila `whatsapp_admin` de `site_settings` en vez de restaurar el valor
  previo, rompiendo el seed para `admin-settings.test.js` si corría después
  en la misma suite.

**Deuda de infraestructura de tests, no bloqueante**: los 13 archivos de
`test/routes/*.test.js` + `test/services/images.test.js` siguen sin poder
correr desde WSL (requieren `app.js` → `adminRouter` → `sharp`, mismo
límite documentado en `CLAUDE.md` §1/§5). Confirmado sin regresiones: 225
tests corren limpio en WSL fuera de esos 13 archivos; la suite completa
(342/342 incluyendo esos archivos) requiere confirmación desde Windows.

### Fase 7 (continuación) — Panel admin: filtro en vivo por nombre ✅ cerrada

Follow-on directo de la sesión anterior, sin ciclo SDD propio (cambio
chico, mismo criterio ya usado para ajustes puntuales de QA). Commit
`49c55eb`:

- Textbox de búsqueda por nombre en `/admin/productos` (junto a los
  combobox de Estado/Categoría) y en `/admin/stock` — en Stock reemplaza
  el combobox de productos por id (sin orden, confuso) por texto libre.
- Se saca el botón "Filtrar" de ambas pantallas: el form se auto-envía al
  cambiar cualquier combobox/checkbox, con debounce de 350ms mientras se
  tipea (`live-filter.js`, nuevo). Fallback `<noscript>` si el JS no carga.
- El escapeo LIKE + tolerancia a acentos del buscador público se extrajo a
  `src/services/text-search.js` (antes vivía solo en `models/products.js`)
  para reusarlo también en `models/variants.js` sin generar un ciclo de
  imports entre ambos modelos.
- `findAllForAdmin` de productos y variantes suman el filtro `q`,
  parametrizado, combinable con los filtros existentes.
- `live-filter.js` restaura el foco del textbox tras el reload (incluso
  con el campo vacío) vía un flag en `sessionStorage`, sin devolverlo si
  quien disparó el envío fue un combobox.
- Mismo fix de test de `checkout.test.js` reforzado: `admin-settings.test.js`
  ahora siembra su propio dato de `whatsapp_admin` en vez de depender de un
  seed externo previo.

Confirmado desde Windows en sesión posterior: suite completa (`npm run
build:css` + `npm test` con Postgres levantado) en verde, sin regresiones.

### Fase 7 (continuación) — Páginas de error 404/500 pulidas ✅ cerrada

Primero de 5 ciclos SDD independientes que cubren el resto de "Pulido"
(páginas de error → performance → accesibilidad → lightbox → README, orden
decidido en la exploración conjunta `sdd/fase7-pulido-final/explore`).
Ciclo SDD completo: proposal → spec → design → tasks → apply → verify →
archive, Engram #421-#427.

Rediseño puramente visual, sin dependencias nuevas: número de estado
grande en Merriweather como elemento decorativo (`aria-hidden="true"`,
NUNCA el `<h1>` — el encabezado accesible sigue siendo el mensaje humano,
"No encontramos esa página" / "Algo salió mal"), un solo CTA ("Volver al
inicio"), FAB de WhatsApp visible en ambas. `noindex: true` agregado al
handler de la 500 en `src/app.js` (3 líneas, aditivo — el slot ya existía
en `main.ejs`, mismo mecanismo que usan checkout/pedido; la 404 ya lo
tenía vía `buildPrivateSeo`).

**Decisiones de producto confirmadas por la dueña** (todas la opción
recomendada en la ronda de propuesta): sin buscador/categorías en la 404
(solo el CTA único, no depende de `menuTree`); ilustración tipográfica sin
asset gráfico nuevo; FAB visible en errores; `noindex` autorizado en la
500 pese a ser un cambio marginalmente fuera del alcance visual estricto.

**Hallazgo colateral, documentado, no corregido en este ciclo** (fuera de
alcance): la clase `border-border-strong`, ya usada en `cart.ejs` y
`checkout-confirm.ejs` entre otras vistas, no compila CSS real —
`tailwind.config.js` declara la key como `borderStrong` y la utility
generada es `.border-borderStrong`, no `.border-border-strong`. Este
ciclo usó `text-borderStrong` (la clase correcta) para el número
decorativo, pero el bug preexistente en las otras vistas sigue sin
tocar.

TDD estricto en `test/routes/error-pages.test.js`: suite de render
aislado (`ejs.renderFile`, corre limpio en WSL, 2/2 verde) + suite HTTP de
la 404 (bloqueada en WSL por el límite conocido de `sharp`/`adminRouter`,
`t.skip()` explícito en vez de tumbar el archivo). 345/345 tests
confirmados en verde desde Windows (incluida la suite HTTP), sin
regresiones sobre la baseline.

**QA manual de la dueña**: 404 confirmada correcta en vivo. La 500 no se
pudo forzar en el intento (parar Postgres localmente) — warning no
bloqueante en el verify, mismo criterio de precedentes del proyecto
(ej. compartir en redes diferido en el cierre de Fase 7 SEO). Mitigado por
el test de render aislado en verde + un harness temporal de humo corrido
durante `apply` que sí ejercitó un 500 real con Postgres caído.

### Fase 7 (continuación) — Performance: cache headers, N+1, compression ✅ cerrada

Segundo de 5 ciclos SDD independientes de "Pulido". Ciclo SDD completo:
proposal → spec → design → tasks → apply → verify → archive, Engram
#428-#433 (+archive-report).

**Cache headers** en `express.static` (`src/app.js`), un solo mount con
`setHeaders` que decide `Cache-Control` por prefijo de path (nuevo
`src/services/cache-headers.js`, servicio puro sin DB, mismo patrón que
`availability.js`): `/uploads/**` y `/fonts/**` → `max-age=1 año,
immutable` (nombre de archivo opaco/fijo — reemplazar una fuente exige
RENOMBRAR el archivo, nunca sobrescribirlo, o queda cache stale sin error
visible); `/css/output.css`, `/js/*.js` y el resto (`/img/**`) →
`max-age=300` (5 min), sin `immutable`.

**Bug de plataforma encontrado y corregido en diseño, antes de escribir
código**: `setHeaders(res, filePath)` recibe la ruta ABSOLUTA con el
separador nativo del SO — en Windows (donde corre `npm run dev`) viene con
`\`. Sin normalizar (`path.relative` + reemplazo de separador a `/`),
NINGÚN prefijo matchea en el entorno real y todos los assets caen al
bucket por defecto, en silencio, sin error. `normalizeRelPath` lo resuelve
con el separador inyectable como parámetro, lo que permitió reproducir el
caso Windows determinísticamente en un test corrido desde WSL.

**`compression()`** agregada como dependencia nueva y primer middleware de
la cadena (antes de `express.static`, si no los estáticos salen sin
comprimir). Nota de mantenimiento documentada en el código: si el hosting
final trae un reverse proxy con gzip/brotli propio, sacar esta línea para
no comprimir dos veces — decisión pendiente hasta que el frente de README
de despliegue defina el hosting real.

**N+1 real corregido** en `attachCardData()` (`src/routes/public.js`, 4
call sites: home/relacionados/búsqueda/categoría): de hasta 48
round-trips a Postgres por página (2 queries × N productos) a 2 queries
fijas siempre, vía `findByProductIds` nuevo en `product-images.js` y
`variants.js` (mismo patrón `WHERE product_id = ANY($1::bigint[])` ya
usado por `variantsModel.findByIds` desde Fase 4), agrupado en
`Map<number, row[]>`.

**Bug crítico de tipos, prevenido antes de implementar (no llegó a
producción)**: `product_id` es `BIGINT` en Postgres, así que `pg` lo
devuelve como STRING. Agrupar el batch con la clave cruda contra
`product.id` (number) hubiera fallado el lookup SIEMPRE, en silencio —
cada card habría renderizado `images: []`/`variants: []`, todo "sin
stock", sin ningún error de servidor. Ambas funciones nuevas castean con
`Number()` tanto al construir el `Map` como en el lookup del lado
llamador (`src/routes/public.js`), con test dedicado que verifica que
`map.get(String(id))` falla y `map.get(Number(id))` no.

**QA post-`apply`, troubleshooting real de la dueña** (documentado, no
bugs de código):
1. Primer chequeo en DevTools no mostraba `Content-Encoding` — resultó ser
   caché del navegador sirviendo una respuesta vieja; se resolvió con
   "Disable cache" + hard reload.
2. `curl -I` (HEAD) mostraba `Vary` pero sin `Content-Encoding` — correcto
   y esperado, un HEAD no tiene body que comprimir.
3. **Hallazgo no bloqueante**: la respuesta comprimida llega como
   `Content-Encoding: br` (Brotli), no `gzip` — la versión de
   `compression` instalada (`^1.7.4` resolvió a 1.8.1) negocia Brotli
   cuando el cliente lo acepta (Chrome lo prefiere sobre gzip), y lo hace
   correctamente vía `Vary: Accept-Encoding`. No es un bug, es mejor
   resultado que el gzip que mencionaban spec/design como ejemplo
   ilustrativo — anotado para no asumir "siempre gzip" en el futuro README
   de despliegue o config de reverse proxy.

360/360 tests confirmados en verde desde Windows (`npm install` +
`npm test`), sin regresiones. SQL parametrizado verificado en ambas
funciones nuevas (`ANY($1::bigint[])`, sin concatenación).

### Fase 7 (continuación) — Accesibilidad fina (sitio público) ✅ cerrada

Tercero de 5 ciclos SDD independientes de "Pulido". Alcance acotado a
propósito al sitio público (el panel admin lo usa solo la dueña). Ciclo
SDD completo: proposal → spec → design → tasks → apply → verify → archive,
Engram #435-#441.

**6 unidades implementadas**:
1. **Focus trap real** en los drawers (nav + carrito), antes ausente —
   `Tab` podía escaparse hacia el contenido de atrás.
2. **Contraste AA de indicadores**: `--brand` (#F5AB56, 1.94:1, insuficiente
   como único indicador) → `--brand-ink` (#6B3800, 9.58:1) en 18 anillos de
   foco + bordes de selección de talle/color/miniatura/paginación.
3. **Botón de pausa/play del carrusel** (antes autoplay sin forma de
   detenerlo permanentemente).
4. **Targets táctiles del carrusel**: dots de 10px → 24px.
5. **Targets táctiles del carrito**: botones "Actualizar"/"Quitar" ~16px →
   ≥24px, en los DOS orígenes (`cart.ejs` y el `<template>` de
   `cart-drawer.ejs`).
6. **Nombre accesible** del link-imagen de la card cuando `alt_text` viene
   vacío (fallback a `product.name` + `sr-only` en la rama sin imagen).

**Bug real de focus trap encontrado en QA en vivo, corregido por el
orquestador tras el `apply`**: la primera versión de `computeNextFocusIndex`
(`menu-animate.js`) solo interceptaba `Tab` en los bordes (primer/último
foco) y dejaba el resto al comportamiento nativo del navegador, asumiendo
que el próximo focusable nativo coincidía con el próximo de la lista
calculada. Falso en la práctica: `nav-drawer.ejs` es hermano DOM directo de
`search-toggle.ejs` (mismo contenedor en `header.ejs`), así que el `Tab`
podía escaparse del drawer de navegación hacia el buscador — reproducible
en PC y responsive, confirmado por la dueña. Fix: la función ahora SIEMPRE
devuelve un índice explícito (nunca `null`) y el handler de `keydown`
SIEMPRE controla el foco a mano (nunca delega al navegador) — mismo
patrón que usan las librerías de focus trap establecidas.

**Ajuste de UX confirmado por la dueña, no bug de accesibilidad**: el foco
solo vuelve al botón que abrió el drawer (hamburguesa/carrito) cuando se
cierra con **Escape** — no con click en el backdrop ni en el botón ✕
(cerrar con mouse ya demuestra que el usuario no depende del foco de
teclado; forzarlo ahí sería una sorpresa, no una ayuda).

**2 ajustes visuales de QA, aplicados**: dots del carrusel de
`--brand-ink`/`bg-surface` a `bg-black`/`bg-white` (con borde para que el
dot blanco se vea sobre fondos claros) — pedido explícito, más simple y
con mejor contraste que la propuesta original; espaciado de los botones
"Actualizar"/"Quitar" del carrito reducido en ambos orígenes (drawer y
página `/carrito`), se veían muy separados en desktop.

**Hallazgo cerrado SIN cambio de código**: el espacio sobrante del
carrusel con `object-contain` resultó ser la imagen de PRUEBA (4:3) siendo
muy distinta a la proporción del contenedor (2.5:1 desktop) — no un bug,
es la decisión deliberada de Fase 6d de nunca recortar piezas de diseño.
Con las imágenes reales que suba la dueña (pensadas como banners
horizontales) el espacio va a ser mínimo o imperceptible.

**Decisión de testing**: sin `jsdom` en el proyecto (regla de no agregar
dependencias sin justificar) — el focus trap y el guard de pausa del
carrusel se testean vía funciones puras extraídas (`computeNextFocusIndex`,
`shouldStartAutoplay`), mismo patrón que `availability.js`/`format.js`. El
wiring real a DOM queda cubierto por QA manual en navegador.

374 tests (360 pasan, 13 fallos preexistentes de `sharp`/WSL, sin
relación), confirmados sin regresiones. `npm test` completo + QA visual
confirmados por la dueña desde Windows tras las dos rondas de fixes.

## Fases sin empezar (resto de "Pulido")

7 (continuación). Lightbox/zoom de la ficha, README de despliegue.

## Entorno / recordatorios operativos

- **npm SIEMPRE desde la terminal de Windows, nunca desde WSL** (rompe los
  binarios nativos si se instala cruzado).
- Después de cambiar clases de Tailwind o `input.css`, hay que correr
  `npm run build:css` — el CSS no se recompila solo, y "todo sin estilo" es
  el síntoma clásico de olvidarse este paso.
- Antes de correr la suite completa, resembrar con `node db/seed.js` si
  ya se corrió antes: `test/routes/admin-settings.test.js` borra
  `whatsapp_admin`/`instagram`/`email_contacto`/`cuit` de `site_settings`
  en su `test.after`, y sin resembrar el test de preview de `wa.me` falla
  (no es un bug de código, es estado de la DB).
- **Correr los tests con `npm test`, no con `node --test` a secas.** El
  script (`package.json`) fija `--test-concurrency=1`: varios archivos de
  test escriben sobre las mismas tablas (`products`, `variants`) en el
  mismo Postgres real, y algunos tests miden un delta ("cuántos productos
  sin stock había antes vs. después") — con archivos corriendo en paralelo
  (default de `node --test`), otro archivo puede crear/borrar productos
  sin stock en el medio y romper ese conteo (`countWithoutStock`, visto
  en QA). Correr serial es más lento pero determinístico; no se tocó la
  lógica de los tests ni del modelo, el bug era de concurrencia de la
  suite, no de código productivo.
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
