# Tienda online de indumentaria femenina — Especificación para Claude Code

> **Cómo usar este documento:** este archivo es la única fuente de verdad del proyecto. Si algo no está acá, preguntá antes de asumir.

---

## 0. DATOS DEL CLIENTE

```
NOMBRE_TIENDA:        Donna Style
WHATSAPP_ADMIN:       5493517505083
INSTAGRAM:            @donna_styleok
EMAIL_CONTACTO:       yesi2682@hotmail.com
DIRECCIONES:          (no tiene local físico)
CUIT:                 27-29456245-7
ZONA_DE_ENVIO:        Todo el país
```

Todos estos valores van en variables de entorno con estos nombres, nunca hardcodeados en las vistas. Sumá también:

```
SITE_URL              # base para construir el link del pedido en el mensaje de WhatsApp.
                      # En desarrollo: http://localhost:3000
                      # El dominio definitivo todavía no está comprado.
```

Como no hay local físico, el bloque de direcciones del footer no se renderiza (§4.5). El pie legal sí lleva el CUIT, el link a Defensa del Consumidor y el botón de arrepentimiento.

## 0.1 ESTRUCTURA DE CATEGORÍAS

Dos niveles. Tres categorías padre con hijas, y dos categorías de primer nivel sin hijas:

```
PARTES DE ARRIBA
  ├─ Remeras y musculosas
  ├─ Remerones
  ├─ Bodys
  ├─ Tops
  └─ Blusas y camisas
PARTES DE ABAJO
  ├─ Pantalones
  ├─ Polleras y shorts
  ├─ Bermudas
  └─ Jeans
ABRIGOS
  ├─ Camperas y chaquetas
  ├─ Chalecos
  ├─ Blazer
  ├─ Buzos y sweaters
  └─ Sacos
NOCHE                    (sin subcategorías)
2x1                      (sin subcategorías)
```

Cuatro reglas que salen de esta estructura:

1. **"Ver todo en {categoría}" no es una fila en `categories`.** Es un elemento del mega menú que enlaza a la categoría padre. Si se creara como registro, la dueña tendría que asignar cada prenda dos veces y tarde o temprano se desincronizarían. Generalo en la vista, no en la base.

2. **Las categorías padre son navegables y acumulan sus descendientes.** Una prenda asignada solo a "Bodys" tiene que aparecer también en "Partes de arriba". La query de listado incluye los productos de la categoría y de todas sus hijas. Sin esto, la dueña carga en la subcategoría y la categoría padre le sale vacía.

3. **El mega menú maneja los dos casos.** Una categoría con hijas abre panel desplegable; una sin hijas (NOCHE, 2x1) es un link directo, sin flecha ni panel.

4. **Guardá los nombres con capitalización normal** ("Partes de arriba"), no en mayúsculas. El display en mayúsculas se resuelve con `text-transform: uppercase` en CSS. Si se guardan gritados, los `<title>`, los breadcrumbs y el Open Graph quedan feos y perjudican el SEO.

Sobre **2x1**: funciona como categoría pero es en realidad una promoción rotativa. El modelo N:N ya lo soporta — una remera puede estar en "Remeras y musculosas" y en "2x1" al mismo tiempo. Cuando la promo termine, la dueña vacía la categoría y esta desaparece sola del menú (§5.4).

`PRODUCTOS` es la etiqueta del ítem de navegación que abre el mega menú, no una categoría.

## 0.2 ASSETS que provee el desarrollador

Los logos ya están en el equipo, en `logo/` dentro de la raíz del proyecto (`C:\Users\matia\Desktop\Donna\web\logo`). Copialos a `src/public/img/` durante la fase 1 y referencialos desde ahí; dejá la carpeta original intacta como fuente.

- `logo.png` — logo de la marca, fondo transparente
- `logo-cuadrado.png` — versión cuadrada, para favicon y Open Graph
- Imágenes del carrusel: todavía no hay. Usá placeholders con las medidas de §5.3.

## 0.3 ENTORNO DE DESARROLLO

Configuración específica de esta máquina. Respetala: no propongas migrar el proyecto ni cambiar dónde corre cada cosa.

- **Sistema:** Windows con WSL2.
- **Ubicación del proyecto:** filesystem de Windows. Vos accedés por `/mnt/c/...` desde WSL.
- **npm se ejecuta siempre desde la terminal de Windows**, nunca desde WSL. Esto es obligatorio: `sharp` trae binarios nativos compilados por plataforma, y una instalación desde Linux sobre la misma carpeta pisa los de Windows y rompe el procesamiento de imágenes. Si necesitás que se instale algo, indicá el comando para que lo corra yo desde Windows; no lo ejecutes vos.
- **Docker Desktop** con integración WSL activada. En el contenedor va **solo PostgreSQL**; Node corre nativo en Windows con `npm run dev`, para tener reload instantáneo.
- Si el puerto 5432 estuviera ocupado por una instalación previa de Postgres, mapeá a `5433:5432` y ajustá `DATABASE_URL`.

El `docker-compose.yml` de esta etapa declara un único servicio (`db`). La containerización de la app queda para la fase de despliegue, que no es parte de este documento.

---

## 1. OBJETIVO

Tienda online de ropa femenina: catálogo navegable por categorías, fichas de producto con variantes de talle y color, carrito, y un **checkout que no procesa pagos**. Al finalizar, la clienta es redirigida a WhatsApp con el detalle del pedido ya armado. Los datos personales, el medio de pago y la entrega se acuerdan en esa conversación.

Dos usuarios, dos capacidades distintas:

| | Puede |
|---|---|
| **Clienta** | Navegar el catálogo, filtrar, ver fichas, agregar al carrito, generar un pedido, ir a WhatsApp, y consultar su pedido por un link permanente |
| **Dueña** | Todo lo anterior más: cargar y editar productos, categorías, stock, carrusel, textos y configuración; ver y gestionar todos los pedidos |

No hay cuentas de usuario para clientas. El único login del sistema es el de la dueña.

---

## 2. STACK OBLIGATORIO

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20+ (LTS) |
| Framework HTTP | Express 4 |
| Base de datos | PostgreSQL 15+ |
| Acceso a datos | SQL crudo con `pg` y queries parametrizadas. **Sin ORM.** |
| Vistas | EJS (HTML renderizado en servidor) |
| Estilos | Tailwind CSS compilado por CLI a un `.css` estático. **Nunca el CDN en producción.** |
| JS de cliente | Vanilla, sin framework. Progressive enhancement. |
| Migraciones | Archivos `.sql` numerados en `/db/migrations` + `npm run migrate` |
| Imágenes | `multer` para upload, `sharp` para procesamiento |
| Sesiones | `express-session` + `connect-pg-simple` |
| Desarrollo local | Docker Compose con Node + PostgreSQL |

**Restricciones:** sin React, Vue ni Next. Sin pasarelas de pago. Sin ORM. Sin analytics ni scripts de terceros salvo pedido explícito. Justificá cada dependencia que agregues.

---

## 3. MODELO DE DATOS

El núcleo del modelo: un producto tiene **variantes**, y el stock vive en la variante, no en el producto.

```sql
categories          -- id, name, slug, parent_id (autoreferencia, máx 2 niveles),
                    --   sort_order, is_active

products            -- id, name, slug,
                    --   description TEXT NULL,                 -- HTML sanitizado, opcional
                    --   size_guide TEXT NULL,                  -- opcional
                    --   base_price NUMERIC(12,2) NOT NULL,
                    --   compare_at_price NUMERIC(12,2) NULL,   -- precio tachado, opcional
                    --   is_featured, is_active, free_shipping,
                    --   created_at, updated_at

product_categories  -- product_id, category_id  (N:N)

product_images      -- id, product_id, filename, alt_text, sort_order, is_primary

variants            -- id, product_id,
                    --   size TEXT NULL, size_order INTEGER NOT NULL DEFAULT 0,
                    --   color TEXT NULL, color_hex TEXT NULL,
                    --   sku TEXT NULL,
                    --   stock INTEGER NOT NULL DEFAULT 0,
                    --   price_override NUMERIC(12,2) NULL,
                    --   UNIQUE (product_id, size, color)

orders              -- id,
                    --   order_code TEXT UNIQUE,    -- "PED-0042", secuencial, para hablar
                    --   public_token TEXT UNIQUE,  -- aleatorio, 12+ chars, para la URL
                    --   customer_name TEXT NULL, customer_note TEXT NULL,
                    --   subtotal NUMERIC(12,2), items_count INTEGER,
                    --   status TEXT,               -- pendiente|confirmado|entregado|cancelado
                    --   whatsapp_sent_at, created_at, updated_at

order_items         -- id, order_id, variant_id NULL,
                    --   product_name_snapshot, size, color,
                    --   unit_price NUMERIC(12,2), quantity

admin_users         -- id, email, password_hash (bcrypt 12+ rounds), created_at

carousel_slides     -- id, image_desktop, image_mobile NULL, alt_text,
                    --   link_url NULL, sort_order, is_active,
                    --   starts_at TIMESTAMP NULL, ends_at TIMESTAMP NULL

site_settings       -- key TEXT PRIMARY KEY, value TEXT
```

### 3.1 Reglas de negocio

- Un producto puede tener variantes de talle, de color, de ambos, o una única variante sin atributos.
- Precio efectivo = `variants.price_override ?? products.base_price`.
- `order_items` guarda snapshot de nombre y precio: los pedidos históricos no cambian si después se edita el producto.
- **`public_token` debe ser aleatorio** (nanoid o UUID), nunca derivado del id. Si fuera secuencial, cualquiera podría enumerar y leer pedidos ajenos.
- **El stock no se reserva al generar el pedido.** Se descuenta cuando la dueña pasa el pedido a `confirmado` desde el panel; si vuelve a `cancelado`, se repone. Es una decisión deliberada: dos clientas pueden pedir el último talle M y la dueña lo resuelve por WhatsApp.

### 3.2 Disponibilidad de variantes — regla central

Las opciones agotadas **desaparecen de la vista de la clienta**. No se muestran deshabilitadas, tachadas ni grisadas: una clienta nueva no debe poder saber que antes existió ese talle.

Reglas exactas:

1. **Un valor de un eje desaparece solo cuando ninguna variante con ese valor tiene stock.** Si existen `M/Negro`, `M/Blanco` y `L/Negro`, y se agota `M/Negro`: el talle M sigue visible (queda en Blanco) y el color Negro también (queda en L). Lo que desaparece es la combinación, no el valor.

2. **Al elegir un valor del primer eje, el segundo eje se recalcula** y muestra únicamente los valores que tienen stock con esa elección. En el ejemplo: elegir L deja visible solo Negro; elegir M deja visible solo Blanco. La clienta nunca puede armar una combinación inexistente.

3. **Selección por defecto: el talle disponible más chico**, según `size_order`, no orden alfabético. Ordenar strings alfabéticamente da L, M, S, XL, XS, que no sirve. Si el producto no tiene talles, el criterio por defecto es el primer color por `id`.

4. **Si un eje queda con un único valor disponible, igual se muestra** (informa qué talle es), pero sin controles para alternar.

5. **Si ninguna variante del producto tiene stock**, el producto sigue publicado y visible. No se renderizan selectores; se muestra el estado "Sin stock" y el botón de agregar al carrito no existe. La dueña puede reponer stock y el producto vuelve a estar comprable sin volver a cargarlo.

6. Esta lógica aplica a cualquier eje de variante que exista, no solo a talle y color.

### 3.3 Campos obligatorios y opcionales

**Obligatorios:** nombre, precio base, al menos una imagen, al menos una categoría, al menos una variante.

**Opcionales:** descripción, guía de talles, precio comparativo, SKU, `color_hex`, envío gratis, destacado, link y fechas de los slides.

---

## 4. SISTEMA DE DISEÑO

Esta sección no es negociable. Definila como variables CSS y usalas en todo el proyecto.

### 4.1 Concepto visual

Página predominantemente blanca, tipo editorial, con la ropa como única fuente de color fuerte. El gradiente de marca vive en el logo y en acentos puntuales; no pinta la interfaz. Mucho aire, tipografía con carácter, fotos grandes, cero adornos.

### 4.2 Tokens de color

```css
:root {
  /* Marca — solo en logo, botones de acción, bordes activos y barra de anuncios */
  --brand:          #fa9825;
  --brand-to:       #c8b174;
  --brand-gradient: linear-gradient(135deg, #fa9825, #c8b174);
  --brand-ink:      #8a4a00;   /* naranja oscurecido: única versión válida como
                                  texto sobre blanco (6,9:1) */

  /* Neutros cálidos — el 90% de la interfaz */
  --bg:             #fdfbf7;   /* fondo de página, blanco cálido */
  --surface:        #ffffff;   /* cards y paneles */
  --border:         #e8e2d6;
  --border-strong:  #a8a196;
  --text-muted:     #6b6459;
  --text:           #1c1917;   /* casi negro cálido */

  /* Semánticos */
  --success:        #15803d;
  --error:          #b91c1c;
}
```

**Reglas de contraste, verificadas:**

- Sobre `--brand` y sobre `--brand-to` va **texto `--text` casi negro**. Blanco sobre esos colores da 2,2:1 y 2,1:1 — ilegible, sobre todo con el celular al sol. Nunca texto blanco sobre la marca.
- `--brand` **no sirve como color de texto sobre blanco** (2,2:1). Para links o precios destacados usá `--brand-ink`.
- El rojo de error tiene que leerse claramente distinto del naranja de marca. **No uses ámbar ni naranja para advertencias**: ese rango ya está ocupado por la identidad.
- Los grises son cálidos, no azulados. Si usás la escala de Tailwind, usá `stone`, nunca `gray` ni `slate`.

**Dónde aparece el naranja y dónde no:**

| Sí | No |
|---|---|
| Logo | Fondos de sección |
| Botón principal de cada pantalla | Encabezados |
| Bordes de estado activo (input enfocado, filtro seleccionado, slide actual) | Texto de párrafo |
| Subrayado del link activo en el menú | Cards de producto |
| Barra de anuncios | Badges de descuento |

**El badge de descuento va en negro sólido con texto claro**, no en naranja. Si todo es naranja, el "30% OFF" deja de destacar.

### 4.3 Movimiento

| Elemento | Entrada | Salida |
|---|---|---|
| Hover, focus, cambios de estado | 140ms | 120ms |
| Toast | 220ms | 160ms |
| Drawer del carrito / menú mobile | 280ms | 220ms |
| Modal / lightbox | 200ms | 160ms |

- Curva de entrada: `cubic-bezier(0.16, 1, 0.3, 1)`. Curva de salida: `ease-in`. **Nunca `linear`.**
- Las cosas entran más lento de lo que salen: al entrar el ojo tiene que registrarlas, al salir la usuaria ya decidió.
- **Animá exclusivamente `transform` y `opacity`.** Nunca `width`, `height`, `top` ni `left`: provocan recálculo de layout y se ven a los tirones.
- El toast entra con `translateY(10px)` + fade, no deslizándose desde fuera de pantalla.
- Toast de éxito: 3s. De error: 5s o hasta cerrarlo a mano.
- Posición: abajo en mobile (alcance del pulgar), abajo a la derecha en desktop.
- **No hagas toast y drawer a la vez al agregar al carrito.** El drawer ya es la confirmación. El toast queda para errores y acciones secundarias.
- Cuando un eje de variante se recalcula y cambian las opciones visibles, la transición es un fade corto (140ms), no un salto seco.
- Respetá `prefers-reduced-motion: reduce` desactivando transiciones y autoplay del carrusel.

### 4.4 Responsive

Mobile-first como metodología: estilos base para pantalla chica, breakpoints hacia arriba. Pero el sitio tiene que ser **igual de bueno en notebook**.

- Grilla de productos: 2 columnas en mobile → 3 en tablet → 4 en desktop
- Ancho máximo de contenido: 1400px, centrado
- Navegación: mega menú en desktop, drawer con acordeones en mobile
- Drawer del carrito: casi ancho completo en mobile, panel de ~420px a la derecha en desktop
- Todos los efectos hover van dentro de `@media (hover: hover)`. Sin eso, en táctil el estado hover queda pegado después de tocar
- Punto de prueba obligatorio: 360px de ancho

### 4.5 Principio de ausencia — aplica a todo el sitio

**Lo que no está cargado no se renderiza vacío: no se renderiza.** Nada de secciones con títulos huérfanos, contenedores vacíos ni textos de relleno tipo "Sin descripción disponible". El bloque desaparece y el layout se cierra solo, ocupando ese espacio con lo que siga.

Casos concretos:

| Si no hay… | Entonces… |
|---|---|
| Descripción | La sección de descripción no existe en la ficha |
| Guía de talles | El acordeón no aparece |
| `compare_at_price` | Sin precio tachado y sin badge de descuento |
| Slides activos en el carrusel | El carrusel no se renderiza; la home arranca con lo que sigue |
| Barra de anuncios configurada | La barra no se renderiza; el header sube |
| Productos destacados | La sección de destacados no aparece en la home |
| Segunda foto del producto | No hay cambio de imagen en hover |
| Productos similares | La sección no aparece en la ficha |
| Nombre o nota en el pedido | Esas líneas no van en el mensaje de WhatsApp |
| Banner secundario | No se renderiza |
| Productos activos en una categoría | La categoría no aparece en el menú ni en el mega menú |
| Local físico cargado | El bloque de direcciones del footer no se renderiza |

La dueña puede cargar cualquiera de esos campos después y el bloque aparece solo, sin intervención de desarrollo.

---

## 5. SITIO PÚBLICO

### 5.1 Layout global

- **Barra de anuncios** superior: texto en loop horizontal, fondo `--brand-gradient`, texto `--text`. Editable y desactivable desde el panel. Si no hay texto configurado o está desactivada, no se renderiza.
- **Header sticky**: logo, navegación con mega menú, buscador, ícono de carrito con contador.
- **Mega menú**: el ítem "Productos" abre el panel con las categorías. Una categoría con hijas muestra su listado encabezado por un link "Ver todo en {categoría}" que apunta a la categoría padre; ese link es interfaz, no un registro de `categories`. Una categoría sin hijas es un link directo, sin flecha ni panel. Las categorías sin productos activos no se listan. En mobile el mismo árbol se muestra como drawer con acordeones.
- **Footer**: links institucionales, WhatsApp, Instagram, mail, y el bloque legal argentino obligatorio (CUIT, link a Defensa del Consumidor y botón de arrepentimiento). El bloque de direcciones solo aparece si hay local cargado.
- **Banner de cookies** dismissible, persistido en `localStorage`.

### 5.2 Home

Orden vertical, saltando lo que no exista:

1. **Banda de marca**: logo centrado sobre fondo blanco. Compacta — máximo 200px de alto en mobile, 260px en desktop. Es presentación, no pantalla completa: los productos tienen que aparecer con poco scroll.
2. **Carrusel de promociones** (§5.3), solo si hay al menos un slide activo
3. **Grilla de destacados**, solo si hay productos marcados como destacados
4. **Banner secundario**, solo si está cargado

### 5.3 Carrusel

Cada slide es una imagen subida por la dueña, con dos versiones por relación de aspecto:

| | Medida | Proporción | Obligatoria |
|---|---|---|---|
| Desktop | 1920 × 760 | ~2,5:1 | Sí |
| Mobile | 1080 × 1350 | 4:5 vertical | No |

Si no se sube la versión mobile, recortá la desktop al centro. Nunca bloquees la carga por falta de la mobile.

**Comportamiento según cantidad de slides activos:**

- **0 slides**: el carrusel no se renderiza. No dejes contenedor, altura reservada ni espacio en blanco: la home pasa directo de la banda de marca a la sección siguiente.
- **1 slide**: imagen fija. Sin puntitos, sin flechas, sin autoplay, sin swipe. No cargues el JS del carrusel.
- **2 o más**: puntitos indicadores, autoplay cada 6 segundos, pausa al hover y al focus, swipe táctil, flechas solo en desktop. El indicador activo usa `--brand`.

Un slide cuenta como activo si `is_active` es verdadero **y** la fecha actual está dentro de `starts_at` / `ends_at` cuando esos campos estén cargados.

**Cada slide tiene:** imagen desktop, imagen mobile opcional, alt text, link destino opcional, orden, interruptor activo/inactivo, y fechas opcionales desde/hasta.

El interruptor permite apagar una promo sin borrarla y reactivarla el año siguiente.

**Performance:** el carrusel es el elemento LCP de la home. La primera imagen carga con `fetchpriority="high"` y sin lazy; las demás lazy. El contenedor reserva su altura con `aspect-ratio` para evitar salto de layout.

### 5.4 Listado de categoría

Breadcrumbs, grilla responsive, y:

- **Filtro**: por rango de precio. **No implementar filtro por color** en esta etapa, ni en el sitio público ni en el panel.
- **Orden**: precio ascendente/descendente, A-Z, Z-A, más nuevo, más viejo
- Filtros y orden viven en la query string, para que la URL sea compartible
- Sin filtros aplicados la página debe funcionar con JS deshabilitado
- Paginación de 24 productos
- **Una categoría padre acumula los productos de todas sus hijas.** Una prenda asignada solo a "Bodys" aparece también en "Partes de arriba". La query resuelve la jerarquía; no depende de que la dueña asigne dos veces
- Una categoría sin productos activos no aparece en el menú (§4.5). Si se llega por URL directa, mostrá un estado vacío con enlace al catálogo general — nunca una grilla en blanco ni un 404

### 5.5 Card de producto

Tiene que permitir agregar al carrito **sin entrar a la ficha**:

- Imagen con cambio a la segunda foto en hover, solo si existe segunda foto y solo en desktop
- Badges: `% OFF` en negro (solo si hay `compare_at_price`), `Envío gratis` (solo si está marcado), `Sin stock`
- Selectores de talle y color inline, aplicando las reglas de §3.2: solo se muestran valores con stock, y el segundo eje se recalcula al elegir el primero
- Si el producto tiene una sola variante disponible, no se muestran selectores
- Botón con estados: normal → "Agregando…" → "¡Listo!"
- Precio, precio tachado si corresponde
- **Altura de card uniforme en toda la grilla.** No es estético: disimula la variación entre fotos amateur y es lo que hace que el catálogo se vea prolijo

### 5.6 Ficha de producto

- Galería con miniaturas y lightbox con zoom
- Breadcrumbs de categoría
- Selectores de variante según §3.2: **las opciones sin stock desaparecen, no se deshabilitan**; el talle más chico disponible viene preseleccionado; el segundo eje se recalcula con cada cambio del primero
- Aviso cuando el stock de la variante seleccionada es `<= 2`: "Quedan 2" / "¡Es el último!"
- Selector de cantidad limitado al stock de la variante seleccionada
- Descripción, solo si está cargada
- Guía de talles colapsable, solo si está cargada
- Compartir por WhatsApp, Instagram y copiar link
- "Productos similares": misma categoría, excluyendo el actual, solo si hay al menos uno
- Si ninguna variante tiene stock: sin selectores, sin selector de cantidad, sin botón de compra, con el estado "Sin stock" visible

### 5.7 Carrito

- **Drawer lateral** que se abre solo al agregar un producto
- Página `/carrito` completa como alternativa
- Editar cantidades, eliminar items, subtotal
- Carrito en sesión del servidor, no solo `localStorage`, para poder revalidar stock
- Revalidación de stock antes de habilitar el botón de finalizar. Si una variante se agotó mientras el carrito estaba armado, avisá con claridad y ajustá el item

### 5.8 Checkout por WhatsApp

Flujo:

1. La clienta toca "Finalizar pedido".
2. Formulario mínimo, ambos campos opcionales: nombre y nota.
3. El servidor revalida stock, crea el pedido en estado `pendiente`, genera `order_code` y `public_token`, y construye el mensaje.
4. Redirección a `https://wa.me/{WHATSAPP_ADMIN}?text={mensaje encodeado}`.
5. El carrito se vacía después de la redirección.
6. La pestaña original queda en una pantalla de confirmación que dice explícitamente que **hay que tocar enviar en WhatsApp** para que el pedido llegue, con el `order_code` visible y el link a `/pedido/{public_token}`.

**El link `wa.me` precarga el mensaje pero no lo envía**: la clienta tiene que apretar enviar. Sin el paso 6, muchas van a ver el chat abierto con el texto escrito, asumir que ya se mandó, y cerrar. El pedido queda en la base como `pendiente` y la dueña nunca se entera. Por eso la pantalla de confirmación no es opcional, y por eso el panel lista todos los pedidos pendientes aunque `whatsapp_sent_at` esté vacío: son pedidos reales que la dueña puede recuperar.

**Formato del mensaje** (usar `encodeURIComponent`):

```
¡Hola {NOMBRE_TIENDA}! Quiero hacer este pedido:

Pedido: PED-0042

• REMERA TAYLOR
  Talle M / Negro
  2 x $31.990,00 = $63.980,00

• JEAN CROP CLASSIC
  Talle 38 / Azul
  1 x $70.700,00 = $70.700,00

Total: $134.680,00 (3 productos)

Ver pedido: https://{DOMINIO}/pedido/{public_token}
```

**Las líneas `Nombre:` y `Nota:` se agregan antes del link solo si esos campos fueron cargados.** Si no, no aparecen — ni la etiqueta ni una línea en blanco. Lo mismo con los atributos de cada item: si una prenda no tiene talle, la línea dice solo el color; si no tiene ninguno, esa línea no existe.

Si el pedido supera ~15 items o el mensaje pasa los ~1500 caracteres, mandá solo encabezado, total y link: los deep links de WhatsApp tienen límite práctico de longitud de URL.

### 5.9 Página pública de pedido — `/pedido/{public_token}`

Accesible sin login, mediante el token aleatorio. Muestra: código del pedido, fecha, prendas con talle, color, cantidad y precio, total, y estado actual.

El link queda para siempre en el chat de WhatsApp de la clienta. No hacen falta cuentas ni historial: la conversación es el historial.

No muestres datos personales más allá del nombre que ella misma cargó. La página lleva `noindex`.

### 5.10 Páginas institucionales

Envíos y retiros, Cambios y devoluciones, Medios de pago, Contacto, Términos y condiciones, Botón de arrepentimiento. Contenido editable desde el panel, sanitizado en el servidor. Una página institucional sin contenido cargado no aparece en el menú.

### 5.11 Buscador

Por nombre y descripción, con `pg_trgm` o `tsvector` en español. Resultados con la misma grilla del catálogo, y estado vacío diseñado cuando no hay coincidencias.

---

## 6. PANEL DE ADMINISTRACIÓN — `/admin`

### 6.1 Restricción de diseño más importante

**La dueña va a usar este panel desde el celular.** Va a sacar la foto con el teléfono, parada en el local, y va a querer cargar la prenda en ese momento. Si el panel solo es cómodo en escritorio, no lo va a usar, el catálogo va a quedar desactualizado y el proyecto fracasa aunque el código sea impecable.

El panel es mobile-first igual que la tienda. Las únicas vistas que pueden priorizar escritorio son la tabla de stock masivo y el listado de pedidos, pero tienen que seguir siendo usables en 360px.

### 6.2 Autenticación

Email y contraseña con bcrypt (12+ rounds). Cookie de sesión `httpOnly`, `secure`, `sameSite: 'lax'`. Rate limiting en el login.

### 6.3 Secciones

- **Dashboard**: pedidos pendientes, productos sin stock, total de productos activos.
- **Productos**: CRUD completo. Alta con múltiples imágenes reordenables por drag & drop, asignación a categorías, generación de variantes en grilla, destacado, activo/inactivo. Los campos opcionales están claramente marcados como tales, con una nota de que si quedan vacíos no se muestran en la tienda.
- **Generación de variantes**: la dueña elige los talles y los colores, y el sistema arma la matriz de combinaciones para que cargue stock y SKU. Al elegir talles, el panel los ordena solo y completa `size_order`: orden canónico para letras (XS, S, M, L, XL, XXL, XXXL) y numérico ascendente para números. Si la dueña usa una nomenclatura propia, puede reordenar a mano arrastrando.
- **Categorías**: CRUD con jerarquía y orden.
- **Stock**: tabla editable de todas las variantes, filtrable por producto y por stock bajo.
- **Pedidos**: listado, detalle, cambio de estado. Al pasar a `confirmado` se descuenta stock; al pasar de `confirmado` a `cancelado` se repone.
- **Carrusel**: subir slides, reordenar, activar/desactivar, programar fechas, editar link y alt text. Indicá visiblemente cuántos slides están activos y qué comportamiento va a tener el carrusel con esa cantidad (fijo o rotativo).
- **Configuración**: barra de anuncios, WhatsApp, redes, datos de contacto, textos institucionales.

---

## 7. MANEJO DE IMÁGENES DE PRODUCTO

Las fotos las saca la dueña con el celular, sin equipo profesional. El sistema compensa lo que puede y avisa lo que no.

**Procesamiento en el servidor con `sharp`:**

- Recorte automático a **3:4 vertical** (estándar de indumentaria), centrado
- Tres tamaños: 400px, 800px y 1400px de ancho
- Conversión a WebP calidad 82
- Normalización de niveles para emparejar exposiciones dispares
- Strip de metadatos EXIF

**Validaciones en el upload:**

- Rechazar imágenes con lado corto menor a 1000px, con mensaje claro
- Validar MIME real, no solo la extensión
- Límite de tamaño por archivo
- **Preview del recorte antes de guardar**, para que la dueña vea qué queda afuera

**Almacenamiento:** `/public/uploads`, gitignored, organizadas por id de producto.

---

## 8. REQUISITOS NO FUNCIONALES

**Formato regional**

- Precios en ARS con formato `es-AR`: `$18.700,00` — punto para miles, coma para decimales
- Fechas `dd/mm/aaaa`
- Todos los textos de interfaz en español rioplatense con voseo: "Agregá al carrito", "Elegí tu talle", "Comprá ahora"

**Performance**

- WebP con `srcset` en todas las imágenes
- `loading="lazy"` abajo del pliegue, excepto el primer slide del carrusel
- CSS purgado en el build
- Objetivo: LCP bajo 2,5s en 4G

**SEO**

- Slugs legibles: `/productos/remera-taylor`, `/partes-de-arriba/bodys`
- Title, meta description y Open Graph por página
- JSON-LD `Product` con precio y disponibilidad en cada ficha, reflejando el stock real
- `sitemap.xml` y `robots.txt` dinámicos

**Accesibilidad**

- HTML semántico, jerarquía de headings correcta
- Alt text en todas las imágenes, editable desde el panel
- Navegación completa por teclado, incluidos drawers y lightbox
- Focus visible usando `--brand` como color del anillo
- Contraste mínimo AA en todo el sitio
- Cuando las opciones de un eje de variante cambian al recalcularse, anunciá el cambio con `aria-live="polite"`

### 8.1 Seguridad

- Queries parametrizadas siempre. Cero concatenación de strings en SQL.
- **Prohibido `innerHTML`, `outerHTML`, `insertAdjacentHTML` y `document.write` con datos dinámicos.** Para texto usá `textContent`; para estructura, `createElement` + `append` o un `<template>` clonado con `cloneNode`. El motivo: el navegador parsea esa cadena como HTML y ejecuta lo que encuentre. Un `<script>` inyectado por `innerHTML` efectivamente no se ejecuta, y por eso mucha gente lo cree seguro, pero un `<img src=x onerror="...">` sí se ejecuta. Si en algún caso puntual creés que hace falta, planteámelo antes con la justificación.
- **En EJS, `<%= %>` escapa y `<%- %>` no.** Usá siempre `<%= %>`. La única excepción permitida es la descripción del producto, y solo después de pasarla por `sanitize-html` con whitelist restrictiva en el servidor.
- Tokens CSRF en todo formulario que muta estado.
- `helmet` con CSP sin `unsafe-inline`. Si algún script inline resulta imprescindible, usá nonce.
- Rate limiting en login, búsqueda y creación de pedidos.
- Validación de MIME real y tamaño en uploads.
- Secretos solo por variables de entorno. Incluir `.env.example`, nunca commitear `.env`.

---

## 9. ESTRUCTURA DEL PROYECTO

```
/src
  /config        conexión a BD, variables de entorno
  /db            pool, helpers de query
  /models        acceso a datos por entidad (SQL crudo)
  /services      carrito, mensaje de WhatsApp, disponibilidad de variantes,
                 stock, procesamiento de imágenes
  /routes        públicas y de admin, separadas
  /middleware    auth, csrf, upload, manejo de errores
  /views
    /layouts
    /partials    header, footer, card de producto, drawer de carrito, carrusel
    /pages
    /admin
  /public
    /css         salida de Tailwind
    /js          JS de cliente
    /img         logo y assets estáticos
    /uploads     imágenes de productos (gitignored)
/db
  /migrations    001_init.sql, 002_..., numeradas
  /seeds         datos de ejemplo para desarrollo
docker-compose.yml
.env.example
CLAUDE.md
README.md
```

La lógica de disponibilidad de variantes (§3.2) vive en un único servicio, compartido entre la card, la ficha y la validación del carrito. No la dupliques en tres lugares.

---

## 10. PLAN DE TRABAJO

Ejecutá en orden y **pará al final de cada fase para que la revise**:

1. **Fundaciones** — scaffolding, Docker Compose con Node y Postgres, Express, Tailwind con los tokens de §4.2, migraciones corriendo, layout base, healthcheck.
2. **Datos** — esquema completo, migraciones, y seeds con:
   - El árbol de categorías real de §0.1, exactamente como está ahí
   - ~20 productos con variantes reales, cubriendo los casos borde: sin descripción, sin stock en ninguna variante, de variante única, con stock parcial por combinación, y al menos uno asignado a dos categorías a la vez (para probar 2x1)
   - Una categoría vacía, para verificar que desaparece del menú
   - Textos institucionales en borrador, para que la dueña los edite en vez de escribirlos desde cero
   - El servicio de disponibilidad de §3.2, con tests que cubran los casos de dos ejes
3. **Catálogo** — home con banda de marca y carrusel, listado de categoría con filtro de precio y orden, card de producto, ficha con selectores de variante.
4. **Carrito** — sesión, drawer, página de carrito, revalidación de stock.
5. **Checkout WhatsApp** — persistencia del pedido, generación del mensaje, redirección, página pública `/pedido/{token}`.
6. **Panel de administración** — auth, CRUD de productos y categorías, generación de variantes con `size_order`, procesamiento de imágenes, stock, pedidos, carrusel, configuración.
7. **Pulido** — SEO, accesibilidad, performance, movimiento según §4.3, páginas de error, estados vacíos, README de despliegue.

---

## 11. CRITERIOS DE ACEPTACIÓN

- [ ] Se agrega un producto al carrito desde la card, sin entrar a la ficha
- [ ] Con `M/Negro`, `M/Blanco` y `L/Negro` cargados, al agotarse `M/Negro`: M sigue visible, Negro sigue visible, y elegir L deja visible solo Negro
- [ ] Una opción agotada desaparece por completo: no queda deshabilitada, tachada ni grisada en ningún lado del HTML
- [ ] El talle preseleccionado es el más chico disponible, con talles S/M/L y con talles 36/38/40
- [ ] Un producto sin descripción no renderiza ningún contenedor ni título de descripción
- [ ] Una prenda asignada solo a "Bodys" aparece al entrar a "Partes de arriba"
- [ ] El mega menú muestra "Ver todo en Partes de arriba" encabezando las subcategorías, y ese link lleva a `/partes-de-arriba/` — pero no existe como fila en la tabla `categories`
- [ ] "Noche" y "2x1" son links directos en el menú, sin panel desplegable
- [ ] Una categoría sin productos activos no aparece en el menú, y por URL directa muestra estado vacío, no 404
- [ ] Con cero slides activos, la home no deja hueco donde iría el carrusel
- [ ] Con un solo slide activo, el carrusel no muestra controles ni rota
- [ ] Un pedido sin nombre ni nota genera un mensaje de WhatsApp sin esas líneas ni líneas en blanco sobrantes
- [ ] `/pedido/{token}` muestra el pedido; el token no es adivinable ni enumerable
- [ ] La dueña carga un producto completo con fotos **desde un celular de 360px**, sin fricción
- [ ] Al confirmar un pedido desde el panel, el stock se descuenta correctamente
- [ ] `grep -rn "innerHTML\|insertAdjacentHTML\|document.write" src/public/js` no devuelve resultados
- [ ] No hay `<%- %>` en las vistas salvo en la descripción del producto ya sanitizada
- [ ] Ningún texto blanco aparece sobre `--brand` ni sobre `--brand-to`
- [ ] Todas las animaciones usan solo `transform` y `opacity`
- [ ] Los precios se muestran en formato argentino en todas las vistas
- [ ] Ningún secreto está hardcodeado
- [ ] `docker compose up` levanta el proyecto en limpio siguiendo el README

---

## 12. RESTRICCIONES EXPLÍCITAS

- **No** integres ningún medio de pago, ni siquiera "preparado para el futuro".
- **No** copies assets, fotos, textos ni CSS de ningún sitio existente. Los patrones de UX de e-commerce son de uso general; el contenido y la identidad visual son del cliente.
- **No** implementes cuentas de usuario para clientas.
- **No** implementes filtro por color. El color sigue existiendo como atributo de la variante, pero no se filtra por él.
- **No** muestres opciones de variante sin stock en ningún estado visual.
- **No** rendericen bloques vacíos, placeholders de texto ni mensajes de "sin contenido" para campos opcionales no cargados.
- **No** agregues analytics, pixels ni scripts de terceros.
- **No** uses un ORM.
- **No** uses `localStorage` para el carrito como única fuente: la sesión del servidor manda.
- **No** pongas un selector de color libre en el panel. La paleta de §4.2 es fija.

---

## 13. CÓMO QUIERO QUE TRABAJES

- Leé este documento completo antes de escribir código y **decime qué decisiones de arquitectura te parecen discutibles** y qué información falta. No arranques si hay ambigüedad importante.
- Creá un `CLAUDE.md` en la raíz con las convenciones del proyecto, para mantener consistencia entre sesiones.
- Commits atómicos con mensajes descriptivos en español.
- Comentarios solo donde el "por qué" no sea obvio.
- Si una decisión tiene trade-offs reales, planteámelos en lugar de elegir por tu cuenta.
- Al terminar cada fase, resumen corto de lo hecho y lo que quedó pendiente.
