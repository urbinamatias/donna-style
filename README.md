# Donna Style

## Qué es

Tienda online de indumentaria femenina. Backend Node.js/Express con vistas
EJS renderizadas en servidor, base de datos PostgreSQL sin ORM (SQL crudo
parametrizado con `pg`) y un panel de administración propio para cargar
catálogo, gestionar pedidos y configurar los datos de contacto de la tienda.
No hay checkout con pasarela de pagos: los pedidos se coordinan por
WhatsApp. La fuente de verdad funcional del proyecto es `prompt.md`; las
convenciones técnicas de trabajo diario están en `CLAUDE.md`.

## Stack

Node.js 20+, Express 4, PostgreSQL 15+, EJS, Tailwind CSS (compilado por
CLI, nunca CDN), `sharp` para procesamiento de imágenes (recorte,
redimensionado, WebP), `express-session` + `connect-pg-simple` para
sesiones respaldadas en Postgres, `bcryptjs` para el hash de la contraseña
de administración, `helmet` para los headers de seguridad (CSP sin
`unsafe-inline` ni `unsafe-eval`, ver "Gotchas"). Detalle completo en
`CLAUDE.md` §1.

## Requisitos

- Node.js **20 o superior** (`engines` en `package.json`).
- PostgreSQL **15 o superior**.
- Docker, opcional — solo para levantar Postgres en desarrollo local
  (`docker-compose.yml` no incluye la app, ver "Gotchas").

## Desarrollo local

El flujo de comandos y las reglas de esta terminal (por qué `npm` corre
siempre desde Windows, por qué Docker Compose solo levanta Postgres) están
documentadas en `CLAUDE.md` §5 — no se repiten acá para no duplicar la
fuente de verdad. En resumen: cloná el repo, copiá `.env.example` a `.env`
y completá los valores, levantá Postgres, `npm install`, `npm run
build:css` (o `npm run watch:css` mientras trabajás), `npm run migrate`,
opcionalmente `npm run seed` para datos de ejemplo, `npm run create-admin`
para dar de alta la única cuenta de administración, y `npm run dev`.

## Variables de entorno

Todas las que lee `src/config/env.js`, más las de uso puntual en scripts y
Docker Compose:

| Variable | Obligatoria | Default | Qué rompe si falta |
|---|---|---|---|
| `DATABASE_URL` | Sí, siempre | — | El proceso no arranca (`process.exit(1)` en `src/config/env.js`) |
| `SESSION_SECRET` | Solo si `NODE_ENV=production` | En dev/test se autogenera en memoria con un warning en consola | En producción el proceso no arranca; en dev, las sesiones no sobreviven un reinicio |
| `SITE_URL` | No | `http://localhost:{PORT}` (default **silencioso**) | Los links absolutos (WhatsApp, canonical) apuntan a localhost en producción si no se seteó — no tira error |
| `PORT` | No | `3000` | — |
| `NODE_ENV` | No | `development` | Controla la cookie `secure`, `trust proxy`, y el guard del seed (ver "Gotchas") |
| `NOMBRE_TIENDA` / `WHATSAPP_ADMIN` / `INSTAGRAM` / `EMAIL_CONTACTO` / `CUIT` | No | Valores reales del cliente ya cargados como default | Son el nivel MEDIO de un resolver de 3 niveles: el panel `/admin/configuracion` gana si tiene un valor cargado, después estas variables, después el default |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | No (solo alternativa a flags) | — | Solo los lee `db/scripts/create-admin.js`; sin ellas ni flags `--email/--password`, el script no crea la admin |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `DB_HOST_PORT` | No | `donna` / `donna` / `donna_style` / `5432` | Solo los usa `docker-compose.yml` para levantar Postgres en desarrollo — no afectan al proceso de Node |

## Primer deploy

Checklist de un entorno productivo nuevo, en orden:

1. Cargar las variables de entorno de producción (`DATABASE_URL`,
   `SESSION_SECRET`, `SITE_URL` apuntando al dominio real, `NODE_ENV=production`
   y el resto de la tabla de arriba según corresponda).
2. `npm install` — corrido en la plataforma de destino real (ver "Gotchas",
   `sharp` es un binario nativo).
3. `npm run build:css`.
4. `npm run migrate`.
5. `npm run seed:categories` — siembra ÚNICAMENTE el árbol de 19 categorías
   reales de `prompt.md` §0.1 (pedido expreso de la dueña: son el único dato
   de catálogo que arranca precargado). A diferencia de `npm run seed`, este
   script nunca hace `TRUNCATE`, es seguro en producción, e idempotente — se
   puede correr de nuevo sin duplicar categorías.
6. `npm run create-admin -- --email <email> --password <password>` (o vía
   `ADMIN_EMAIL`/`ADMIN_PASSWORD`) — una sola vez, da de alta la única
   cuenta de administración.
7. Proveer un **volumen persistente** montado en `src/public/uploads/`
   antes de arrancar (ver "Gotchas").
8. `npm start`.
9. Cargar desde el panel de administración (`/admin`) — no hay importador
   ni seed de producción para nada de esto:
   - Catálogo: productos, imágenes, carrusel.
   - **Páginas institucionales** (`/admin/paginas`, `prompt.md` §5.10):
     Envíos y retiros, Cambios y devoluciones, Medios de pago, Contacto,
     Términos y condiciones, Botón de arrepentimiento. Ninguna viene
     precargada — la tabla `pages` arranca vacía a propósito (ver
     "Qué SÍ y qué NO pasa a producción" más abajo). Hasta que se cargue
     al menos una, el ítem "Información" no aparece en el menú ni en el
     footer (principio de ausencia, §4.5).

## Deploys siguientes

Checklist de una actualización sobre un entorno ya provisionado:

1. `git pull` (o el mecanismo de despliegue del hosting elegido).
2. `npm install`.
3. `npm run build:css`.
4. `npm run migrate` — idempotente, corre siempre aunque no haya
   migraciones nuevas.
5. Reiniciar el proceso.

`seed:categories`, `create-admin` y la carga inicial del catálogo (pasos 5,
6 y 9 de "Primer deploy") son de una sola vez — **no se repiten acá**.

## Post-lanzamiento: cómo aplicar un fix o feature nuevo

El proyecto no tiene entorno de staging. Con eso en mente, el flujo para
cualquier cambio detectado después de que la tienda ya está en vivo con
usuarios reales es el mismo de siempre — desarrollo local contra Postgres
de dev, después "Deploys siguientes" de arriba — con dos cuidados
adicionales:

1. **Desarrollar y probar localmente primero**, nunca directo contra
   producción. `npm test` en verde antes de tocar el servidor real.
2. **Si el cambio incluye una migración de esquema** (`db/migrations/`),
   tiene que ser **aditiva**: agregar una columna/tabla nueva, nunca
   `DROP`/`ALTER` destructivo sobre algo que ya tiene datos reales cargados.
   Sin staging, la primera vez que esa migración corre contra datos reales
   es en producción — no hay margen para "probarla y revertir" si algo
   sale mal.
3. **Antes de correr una migración contra la base con datos reales**
   (no aplica a deploys que sean solo código, sin `npm run migrate` nuevo):
   un `pg_dump` manual de esa sesión puntual. Todavía no hay backup
   automatizado (ver "Operación cotidiana"), así que este paso es la única
   red de contención hasta que se defina una estrategia real.
4. Deployar con el checklist de "Deploys siguientes" de arriba. Un fix
   chico y acotado no necesita ciclo SDD completo (proposal → spec →
   design → tasks → apply → verify → archive) — varios ajustes de
   `progress.md` ya se hicieron directo, sin ese ciclo, cuando el cambio
   era pequeño y bien entendido. Reservá el ciclo completo para features
   nuevas de alcance real.
5. **Nunca correr `npm run seed`** contra la base de producción una vez que
   hay datos reales — TRUNCATEa 9 tablas (ver "Gotchas" → "El seed BORRA
   datos"). Si hace falta agregar datos de referencia nuevos en producción
   (por ejemplo, una categoría más), se hace desde `/admin` o con un script
   dedicado nuevo del mismo estilo que `db/seed-categories.js` (nunca
   `TRUNCATE`, siempre idempotente).

## Qué SÍ y qué NO pasa a producción

Decisión explícita de la dueña: de todo lo que hoy vive en la base de
desarrollo, solo dos cosas están pensadas para llegar tal cual a
producción. Todo lo demás es dato de prueba, cargado durante el desarrollo
para poder probar cada fase, y se reemplaza por contenido real desde cero.

| Dato | ¿Pasa a producción? | Cómo |
|---|---|---|
| Árbol de 19 categorías (§0.1) | **Sí** | `npm run seed:categories` (paso 5 de "Primer deploy") |
| Cuenta de administración | **Sí**, con las credenciales reales | `npm run create-admin` con el email/contraseña definitivos (paso 6) — no es una migración de datos, es crearla directo con el valor final |
| Productos, variantes, stock | No — son ~19 productos de prueba | Se cargan de cero desde `/admin/productos` |
| Imágenes de producto | No — son placeholders genéricos | Se suben de cero desde el panel, junto con cada producto |
| Slides del carrusel | No — son de prueba | Se cargan de cero desde `/admin/carrusel` |
| Páginas institucionales | No — la tabla `pages` arranca vacía | Se cargan de cero desde `/admin/paginas` (ver paso 9 de arriba) |
| Pedidos (`orders`) | No, nunca | Son datos de prueba de QA, no pedidos reales |
| Configuración (`site_settings`) | No, salvo lo que la dueña cargue de nuevo en `/admin/configuracion` | El resolver de 3 niveles (panel → `.env` → default) sigue funcionando sin nada cargado ahí — usa las variables de entorno de la tabla de arriba mientras tanto |

**Por eso el primer deploy usa `npm run migrate` + `npm run
seed:categories`, nunca `npm run seed`** — este último mezcla las
categorías reales con los ~19 productos/imágenes/carrusel de prueba y
además hace `TRUNCATE` (ver "Gotchas").

## Operación cotidiana

- El catálogo (productos, categorías, imágenes, slides del carrusel) se
  administra desde `/admin`, no por script ni por consola SQL directa.
- No hay estrategia de backup automatizada implementada todavía. Punto de
  partida sugerido: `pg_dump` sobre `DATABASE_URL`, sin cron ni política de
  retención definida — queda pendiente decidir frecuencia y almacenamiento
  antes de depender de esto en serio.
- **Nunca correr `npm run seed` contra la base de producción real** — ver
  el aviso destacado en "Gotchas".

## Seguridad — checklist de `prompt.md` §8.1

Estado de cada requisito, con dónde vive en el código, para no tener que
volver a auditar esto en cada deploy:

| Requisito | Estado | Dónde |
|---|---|---|
| Queries parametrizadas, cero concatenación SQL | ✅ | todos los `models/*.js` |
| Sin `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` con datos dinámicos | ✅ | `src/public/js/**` |
| `<%- %>` solo en descripción de producto y páginas institucionales (sanitizadas con `sanitize-html`) + JSON embebido (`toScriptJson`) | ✅ | `CLAUDE.md` §3 documenta las excepciones |
| CSRF en todo form que muta estado | ✅ | `src/middleware/csrf.js`, global en `src/app.js` |
| `helmet` con CSP sin `unsafe-inline` ni `unsafe-eval` | ✅ | `src/app.js` — ver "CSP de helmet" en Gotchas para las restricciones que esto impone en código nuevo |
| Rate limiting: login | ✅ | `src/middleware/rate-limit.js` (`loginRateLimit`, 5/15min por IP) |
| Rate limiting: búsqueda | ✅ | `src/middleware/search-rate-limit.js` (30/60s por IP) |
| Rate limiting: creación de pedidos | ✅ | `src/middleware/checkout-rate-limit.js` (10/10min por IP) |
| Validación de MIME real (no extensión) en uploads | ✅ | `src/services/images.js#assertUsable` (magic bytes) |
| Secretos solo por variables de entorno | ✅ | `src/config/env.js`, tabla de arriba |
| Banner de cookies dismissible, persistido en `localStorage` (§5.1) | ✅ | `src/views/partials/cookie-banner.ejs` + `src/public/js/cookie-banner.js` |

## Gotchas

### CSP de helmet: qué asume sobre el código

La CSP (`src/app.js`) es estricta a propósito: `script-src 'self'`,
`style-src 'self'`, sin `unsafe-inline` ni `unsafe-eval` en ninguna de las
dos. Cualquier código nuevo tiene que respetar esto o el navegador lo
bloquea EN SILENCIO (sin error de servidor, mismo patrón de bug que ya
pasó varias veces en el proyecto con Tailwind/`qs`):

- **Nada de `onclick=`/`onsubmit=`/etc. inline en las vistas.** Si hace
  falta confirmar una acción destructiva, usar `data-confirm="mensaje"` +
  `src/public/js/confirm-submit.js` (ya escucha `submit` en todo el
  documento, no hay que tocarlo).
- **Nada de `style="..."` inline.** Usar clases de Tailwind, incluidas las
  arbitrarias con variables CSS (`bg-[var(--brand-gradient)]`, ya usado en
  toda la tienda pública).
- `img-src` incluye `'self'` y `blob:` (este último exclusivamente para el
  preview de recorte de `image-upload.js`, que carga el archivo elegido en
  un `<img>` en memoria vía `URL.createObjectURL` antes de dibujarlo en el
  `<canvas>`). Si se agrega cualquier imagen servida desde otro origen
  (un CDN, por ejemplo), hay que sumar ese host a `img-src` a mano.
- `crossOriginEmbedderPolicy`/`crossOriginResourcePolicy` están
  desactivados a propósito — el preset estricto por default de `helmet`
  rompía la posibilidad de que WhatsApp/Facebook/Instagram traigan
  `og:image` para la vista previa del link compartido (§5.6).

### El seed BORRA datos

> **`npm run seed` hace `TRUNCATE ... RESTART IDENTITY CASCADE` sobre 9
> tablas.** Es una herramienta de desarrollo, no de producción. El propio
> script se niega a correr si `NODE_ENV=production` (guard en
> `db/seed.js`), pero el guard depende de que esa variable esté bien
> seteada en el entorno donde se ejecuta — no depender solo de eso: nunca
> apuntar `DATABASE_URL` de producción a una sesión de terminal donde se
> vaya a correr `npm run seed`.

### `uploads/` es disco local, no versionado

`src/public/uploads/` está en `.gitignore`. Sin un **volumen persistente**
montado ahí, cada redeploy borra las fotos de producto reales que la dueña
subió desde el panel. Es un requisito de infraestructura, no opcional.

### `sharp` se compila en la plataforma de destino

`sharp` usa `libvips`, un binario nativo. Igual que en desarrollo (donde
`npm install` corre siempre desde Windows por este mismo motivo, ver
`CLAUDE.md` §1/§5), en producción `npm install` tiene que correr en la
misma plataforma/arquitectura donde va a vivir el proceso — instalarlo en
un entorno y desplegar el `node_modules` resultante en otro rompe el
procesamiento de imágenes.

### HTTPS es requisito técnico, no preferencia

La cookie de sesión se emite con `secure: true` cuando `NODE_ENV=production`
(`src/app.js`). Sin HTTPS real en producción, el navegador descarta esa
cookie y el login de admin y el carrito no funcionan. No es una
recomendación de seguridad opcional: es un requisito funcional.

### `trust proxy` y el fix de esta fase

Detrás de cualquier proxy que termina TLS (balanceador de un PaaS, Nginx,
etc.), la conexión entre el proxy y el proceso de Node suele ser HTTP
plano — Express ve `req.protocol === 'http'` y, por el punto anterior, se
niega a emitir la cookie `secure`. La solución es decirle explícitamente a
Express que confíe en el header `X-Forwarded-Proto` que pone el proxy:
`app.set('trust proxy', 1)`, condicionado a `NODE_ENV=production`
(`src/app.js`). El valor `1` significa "confío en exactamente UN hop": el
proxy inmediato que toca al proceso. **Si la infraestructura real encadena
más de un proxy** (por ejemplo un CDN delante de un balanceador), ese
número hay que subirlo o el `X-Forwarded-For` del primer hop deja de ser
confiable.

Hallazgo colateral del mismo fix: `src/middleware/rate-limit.js` usa
`req.ip` como clave del balde de intentos de login. Sin `trust proxy`
seteado, Express resuelve `req.ip` a la IP del proxy para TODOS los
visitantes, así que el rate limit termina compartiendo un solo balde entre
cualquiera que pase por ese proxy — el aislamiento por IP real se rompe en
silencio. El fix de esta fase resuelve esto también, sin cambios
adicionales en `rate-limit.js`.

### La migración de sesiones es explícita

`connect-pg-simple` se configura con `createTableIfMissing: false` a
propósito (`src/app.js`) — la tabla `session` la crea la migración
numerada `db/migrations/006_session.sql`, no el auto-create de la
librería. Si se saltea `npm run migrate`, el proceso arranca sin error
visible y recién se rompe en el primer request que toque sesión.

### `docker-compose.yml` levanta solo Postgres

Hoy el `docker-compose.yml` de este repo declara únicamente el servicio
`db` (Postgres). Node corre nativo, no hay contenedor de la app todavía —
la containerización queda para una fase de despliegue futura. Este README
documenta el estado actual, no un plan.

### `output.css` está gitignored

`src/public/css/output.css` no se versiona. Sin correr `npm run
build:css` como parte del deploy, el sitio sale sin estilos.

### `compression()` y el gzip del proxy

La app comprime sus propias respuestas (`compression()` en `src/app.js`,
Fase 7 de performance). Si el hosting final agrega un proxy que ya
comprime (gzip/brotli), sacar ese middleware de la app para no comprimir
dos veces.

## Qué falta decidir antes del primer deploy

- Proveedor de hosting (PaaS o VPS) — este documento no asume ninguno.
- Estrategia de backup real (frecuencia, retención, verificación de
  restore) más allá de `pg_dump` como punto de partida.
- Si la infraestructura final encadena más de un proxy, ajustar el valor
  de `trust proxy` en `src/app.js` (ver "Gotchas").

## Documentación relacionada

- `prompt.md` — fuente de verdad funcional del proyecto.
- `CLAUDE.md` — convenciones técnicas de trabajo diario (stack, estructura
  de carpetas, seguridad, flujo de desarrollo local).
- `progress.md` — historial de fases del proyecto.
