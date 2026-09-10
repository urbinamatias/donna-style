[English](README.md) · **Español**

# Donna Style

**Sitio en producción: [donnastyle.cc](https://donnastyle.cc)** — desplegado y abierto al público. No hace falta login ni instalación para navegar la tienda: se puede recorrer el catálogo completo, abrir fichas de producto, armar un carrito y llegar al traspaso a checkout tal como lo haría una clienta.

Tienda online de indumentaria femenina hecha para una clienta real. Es una aplicación web renderizada en servidor con panel de administración propio: la dueña carga y gestiona todo el catálogo, el stock, el carrusel de la home, las páginas institucionales y los pedidos desde el navegador, sin depender de un desarrollador una vez lanzado el sitio.

---

## Qué es y qué problema resuelve

La clienta es una comerciante de ropa sin local físico y sin infraestructura de pagos. Vende por Instagram y cierra cada venta hablando con la compradora por WhatsApp, donde acuerda pago y entrega.

El sitio conserva ese modelo de venta y le saca la fricción de encima:

- Las clientas tienen un catálogo real y navegable en vez de scrollear un feed de Instagram: categorías, fichas con variantes de talle y color, stock en vivo, buscador y carrito.
- **El checkout no procesa pagos.** Al finalizar, el pedido queda armado y la clienta es redirigida a WhatsApp con el detalle completo ya escrito en el mensaje. Datos personales, medio de pago y envío se acuerdan en esa conversación, como siempre.
- Cada pedido recibe un link público permanente para consultar su estado más tarde, sin necesidad de cuenta.
- La dueña maneja todo desde `/admin`: productos, categorías, stock, carrusel, páginas institucionales, gestión de pedidos y configuración de la tienda.

No hay cuentas de clienta. El único login del sistema es el de la dueña.

---

## Funcionalidades de producto

**Tienda pública**

- Navegación por categorías de hasta dos niveles, con un mega menú que maneja tanto categorías padre (panel desplegable) como categorías sueltas (link directo). Las categorías padre acumulan los productos de todas sus descendientes.
- Fichas de producto con variantes de talle y color, disponibilidad en tiempo real por eje (un talle queda seleccionable solo si alguna variante con stock lo alcanza), precio con descuento por transferencia/efectivo y estimación de cuotas, y lightbox de imágenes.
- Buscador de productos por nombre, tolerante a acentos, con rate limiting.
- Carrito con edición de cantidades y contador de ítems en vivo en el header.
- Checkout por WhatsApp: el pedido se persiste y luego se envía a la clienta a un mensaje `wa.me` prellenado con el detalle ítem por ítem y un link de vuelta al pedido.
- Página de estado del pedido permanente, accesible por un token público.
- Carrusel de la home con slides programables (fechas de inicio y fin).
- Páginas institucionales (envíos, cambios, medios de pago, términos, etc.) redactadas por la dueña con un editor de texto enriquecido restringido.
- "Principio de ausencia": lo que la dueña no cargó no se renderiza vacío, no se renderiza (no hay bloque de dirección vacío, ni ítem "Información" en el menú hasta que exista una página).

**Panel de administración** (`/admin`, cuenta única de la dueña)

- ABM de productos, variantes, categorías, stock, slides del carrusel y páginas institucionales.
- Listado de pedidos con máquina de estados (pendiente → confirmado → entregado / cancelado).
- Subida de imágenes con procesamiento en servidor (recorte centrado, redimensionado, WebP, borrado de EXIF) y vista previa del recorte en el cliente.
- Configuración de la tienda con un resolver de tres niveles: gana el valor del panel, después la variable de entorno, después un default documentado — así el sitio funciona por completo antes de abrir el panel por primera vez.
- Filtros en vivo por nombre en los listados de productos y stock.
- El reordenamiento se hace con botones de mover explícitos, nunca con drag-and-drop.

---

## Stack tecnológico

| Capa | Elección |
|---|---|
| Runtime | Node.js 20+ |
| Framework HTTP | Express 4 |
| Base de datos | PostgreSQL 15+ |
| Acceso a datos | SQL crudo parametrizado con `pg`. **Sin ORM.** |
| Vistas | EJS, renderizado en servidor |
| Estilos | Tailwind CSS compilado por CLI a un `.css` estático (nunca el CDN) |
| JS de cliente | Vanilla, sin framework |
| Migraciones | Archivos `.sql` numerados + un runner propio (`db/migrate.js`), sin librería de migraciones |
| Sesiones | `express-session` + `connect-pg-simple` (store de sesión en PostgreSQL) |
| Auth | `bcryptjs` (JS puro, 12+ rounds) para la única contraseña de administración |
| Imágenes | `multer` (memory storage) + `sharp` / libvips |
| Headers de seguridad | `helmet` con una CSP estricta — sin `unsafe-inline`, sin `unsafe-eval` |

Las dependencias se mantienen deliberadamente acotadas; cada una está justificada en `CLAUDE.md`.

---

## Arquitectura

Capas clásicas de MVC renderizado en servidor, con las reglas de negocio sacadas de las rutas hacia servicios puros y testeables, y las invariantes empujadas hacia la base de datos.

```
src/
  config/        carga y validación de entorno, config estática
  db/            pool de pg, runner de migraciones
  models/        un módulo por agregado — todo el SQL vive acá, siempre parametrizado
  services/      lógica de negocio pura (disponibilidad, precios, carrito, búsqueda,
                 pipeline de imágenes, resolver de store-config, máquina de estados
                 de pedidos, SEO)
  middleware/    auth, CSRF, rate limiting (login / búsqueda / checkout), upload,
                 deny-list de UI flotante
  routes/        tienda pública + routes/admin/* para el panel
  views/         plantillas EJS (pages/, partials/, layouts/) + views/admin/*
  public/        CSS compilado, JS de cliente, fuentes, imágenes, uploads (volumen en runtime)
db/
  migrations/    001..009 — esquema, trackeado en schema_migrations
  seeds          seed de desarrollo (destructivo) + seed-categories (idempotente, seguro en prod)
test/            ~60 archivos, node:test, corridos contra un PostgreSQL real, en serie
```

### Modelo de datos

Once tablas de dominio (más `schema_migrations` y el store de sesión). Puntos salientes:

- **`categories`** — autorreferencial, limitada a dos niveles por un trigger (un `CHECK` no puede mirar otras filas). Los slugs se congelan al crear, así un link compartido nunca se rompe.
- **`products`** / **`variants`** — una variante es un par (talle, color) con su propio stock y un override de precio opcional. `UNIQUE NULLS NOT DISTINCT (product_id, size, color)` (PG15) para que los productos de variante única no se dupliquen en silencio. `product_categories` es un join N:N simple, que es lo que permite que una promo rotativa "2×1" funcione como categoría.
- **`product_images`** — un `base_key` opaco por fila (sin extensión, sin ancho); toda URL se deriva en el render por un único helper. Un índice único parcial garantiza a lo sumo una imagen primaria por producto.
- **`orders`** / **`order_items`** — las líneas del pedido snapshotean el nombre del producto y el precio unitario, así el historial sobrevive a un borrado posterior de producto o variante (`ON DELETE SET NULL`). Los códigos de pedido (`PED-0001`) los asigna un trigger `BEFORE INSERT`.
- **`session`** — creada por su propia migración numerada en vez del auto-create de la librería, para que quede trackeada como cualquier otra tabla.

### Decisiones de ingeniería a destacar

- **Sin ORM, a propósito.** Todo el SQL es crudo y parametrizado, un módulo de modelo por agregado, cero concatenación de strings. Las invariantes que un ORM aplicaría en código de aplicación viven en el esquema: triggers, índices únicos parciales, `CHECK`, `NULLS NOT DISTINCT`.
- **CSP estricta, cero inline de nada.** `script-src 'self'`, `style-src 'self'`, sin `unsafe-inline`/`unsafe-eval`. Eso descartó `<script>` inline, handlers `onclick=` y atributos `style=` en todas las vistas. Las confirmaciones de acciones destructivas usan un atributo `data-confirm` que levanta un único listener delegado; el estilo dinámico usa valores arbitrarios de Tailwind con variables CSS.
- **Un solo pipeline de imágenes.** Uploads y datos de seed pasan por exactamente la misma ruta de `sharp` — recorte centrado a 3:4, tres anchos, WebP q82, normalización de niveles, borrado de EXIF. Sin rama legacy. Las claves son opacas y generadas en servidor, lo que además cierra el path traversal a nivel de esquema.
- **Servicios puros compartidos.** La disponibilidad de variantes, los precios y el resolver de store-config viven cada uno en un único lugar y se consumen igual desde la card, la ficha y el carrito — nunca reimplementados por vista.
- **Búsqueda tolerante a acentos sin extensión de Postgres**, con folding vía `translate()` en vez de exigir `unaccent` / `CREATE EXTENSION` en el host.
- **Migraciones solo aditivas.** No hay entorno de staging: la primera vez que una migración se encuentra con datos reales es en producción, así que los cambios de esquema agregan columnas/tablas y nunca alteran de forma destructiva algo ya poblado.
- **IP de cliente correcta detrás del proxy.** En producción `trust proxy` se fija en un hop para que `express-session` emita la cookie `secure` y los rate limiters claveen sobre la IP real de la visitante y no la del proxy.
- **Los tests corren contra un PostgreSQL real**, en serie y de forma determinística — sin DB en memoria, sin mockear la capa de datos.

### Despliegue

La aplicación está en vivo en [donnastyle.cc](https://donnastyle.cc), sobre un VPS Linux detrás de un reverse proxy nginx que termina TLS (con HSTS). Un único proceso Node sirve la app y se conecta a PostgreSQL; las imágenes de producto se sirven desde un volumen persistente montado en `public/uploads/`. El Docker Compose del repo levanta únicamente PostgreSQL para desarrollo local — la app corre nativa.

---

## Guía del repositorio para quien revise el código

- `prompt.md` — la fuente de verdad funcional: la especificación de producto original y detallada contra la que se construyó todo el proyecto.
- `CLAUDE.md` — convenciones de ingeniería del día a día (fundamento del stack, reglas de seguridad, estructura de carpetas, flujo local).
- `progress.md` — bitácora de construcción fase por fase, incluidos los fixes de bugs de producción posteriores al lanzamiento.
- `src/models/` y `src/services/` son los mejores puntos de entrada para leer la lógica real; `db/migrations/` documenta el modelo de datos con su justificación inline.
