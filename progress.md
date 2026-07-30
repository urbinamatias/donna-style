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

## Fases sin empezar

6d. **Panel: carrusel + configuración** — CRUD de `carousel_slides`
   (hoy solo por seed) con los mismos 3 estados (0/1/2+ imágenes) que ya
   tiene el home. Migración de `WHATSAPP_ADMIN`/`INSTAGRAM`/
   `EMAIL_CONTACTO`/`CUIT` de `.env` a `site_settings` (confirmado esta
   sesión) — `.env` queda solo para secretos/infra
   (`DATABASE_URL`/`SESSION_SECRET`/etc.), el panel pasa a ser la fuente
   de verdad de esos datos de negocio.
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
