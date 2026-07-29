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

### Fase 3 — Catálogo ⚠️ implementada, pendiente cerrar el ciclo SDD
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

**Lo que falta para cerrar formalmente la Fase 3 (SDD)**:
- No se corrió `sdd-verify` ni `sdd-archive` todavía — hubo varias rondas
  de ajustes de UI después del `sdd-apply` original y antes de verificar.
  Recomendado: correr `sdd-verify` sobre el estado actual (no sobre el
  design.md original, que quedó desactualizado en varios puntos de nav —
  ver punto 2 arriba) antes de pasar a Fase 4.
- Falta decidir/implementar el lightbox real con zoom de la ficha de
  producto (diferido a propósito a Fase 7 "Pulido").
- Buscador (§5.11) sigue sin fase asignada — no se tocó en Fase 3, según lo
  acordado en el proposal.

## Fases sin empezar

4. **Carrito** — sesión, drawer (el ícono de carrito fue removido a
   propósito del header en Fase 3, hay que reincorporarlo acá), página
   `/carrito`, revalidación de stock. El botón "Agregar" de card/ficha ya
   está listo visualmente, solo falta sacarle `disabled` y conectar el
   POST real.
5. **Checkout por WhatsApp** — persistencia del pedido, generación del
   mensaje, redirección, página pública `/pedido/{token}`. `nanoid` ya está
   instalado (se agregó en Fase 2, sin uso real todavía).
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
