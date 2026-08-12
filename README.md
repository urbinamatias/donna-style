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
de administración. Detalle completo en `CLAUDE.md` §1.

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
5. `npm run create-admin -- --email <email> --password <password>` (o vía
   `ADMIN_EMAIL`/`ADMIN_PASSWORD`) — una sola vez, da de alta la única
   cuenta de administración.
6. Proveer un **volumen persistente** montado en `src/public/uploads/`
   antes de arrancar (ver "Gotchas").
7. `npm start`.
8. Cargar el catálogo inicial desde el panel de administración
   (`/admin`) — no hay importador ni seed de producción.

## Deploys siguientes

Checklist de una actualización sobre un entorno ya provisionado:

1. `git pull` (o el mecanismo de despliegue del hosting elegido).
2. `npm install`.
3. `npm run build:css`.
4. `npm run migrate` — idempotente, corre siempre aunque no haya
   migraciones nuevas.
5. Reiniciar el proceso.

`create-admin` y la carga inicial del catálogo (pasos 5 y 8 de "Primer
deploy") son de una sola vez — **no se repiten acá**.

## Operación cotidiana

- El catálogo (productos, categorías, imágenes, slides del carrusel) se
  administra desde `/admin`, no por script ni por consola SQL directa.
- No hay estrategia de backup automatizada implementada todavía. Punto de
  partida sugerido: `pg_dump` sobre `DATABASE_URL`, sin cron ni política de
  retención definida — queda pendiente decidir frecuencia y almacenamiento
  antes de depender de esto en serio.
- **Nunca correr `npm run seed` contra la base de producción real** — ver
  el aviso destacado en "Gotchas".

## Gotchas

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
