# CLAUDE.md — Donna Style

Convenciones del proyecto para mantener consistencia entre sesiones. La fuente de verdad funcional es `prompt.md`; este archivo es la guía técnica de trabajo diario.

## 1. Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20+ (LTS) |
| Framework HTTP | Express 4 |
| Base de datos | PostgreSQL 15+ |
| Acceso a datos | SQL crudo con `pg` y queries parametrizadas. **Sin ORM.** |
| Vistas | EJS |
| Estilos | Tailwind CSS compilado por CLI. Nunca CDN en producción. |
| JS de cliente | Vanilla, sin framework |
| Migraciones | Archivos `.sql` numerados en `/db/migrations` + `node db/migrate.js` (runner propio, sin librería de migraciones) |
| Imágenes | `multer` (memoryStorage) + `sharp` (Fase 6b — **primer binario nativo real del proyecto**, ver nota abajo) |
| Sesiones | `express-session` + `connect-pg-simple` (a partir de la fase que las necesite) |
| Contraseñas admin | `bcryptjs` (puro JS, sin binario nativo — ver nota abajo) |

**`bcryptjs` en vez de `bcrypt` nativo (Fase 6a):** mismo motivo que `sharp` obliga a correr `npm install` desde Windows — un binario nativo compilado en un entorno rompe en el otro. `bcryptjs` es una reimplementación en JS puro del mismo algoritmo, sin paso de compilación, así que no tiene ese problema. Costo de hash: 12+ rounds (§6.2 de `prompt.md`).

**`sharp` (Fase 6b) es la instancia MÁS FUERTE de la regla de §5 hasta ahora:** a diferencia de `bcryptjs`, no existe un equivalente puro-JS realista para `sharp` — libvips es la única forma de cumplir §7 (recorte, redimensionado, WebP, normalización, EXIF strip) con la calidad y el throughput que necesita un panel de carga de fotos. Esto significa que **el binario nativo de `sharp` tiene que compilarse/descargarse en la plataforma donde corre `npm run dev` (Windows)** — instalarlo desde WSL rompería el procesamiento de imágenes al levantar el server en Windows, igual que pasaría con `bcrypt` nativo. `npm install` para esta fase (y cualquiera que la siga) sigue corriendo EXCLUSIVAMENTE desde la terminal de Windows.

## 2. Convenciones del proyecto

- Estructura de carpetas: ver §9 de `prompt.md` (`/src/config`, `/src/db`, `/src/models`, `/src/services`, `/src/routes`, `/src/middleware`, `/src/views`, `/src/public`, `/db/migrations`, `/db/seeds`).
- **Sin ORM.** Todo acceso a datos es SQL crudo con `pg`, siempre parametrizado (`$1, $2...`). Cero concatenación de strings en SQL.
- La lógica de disponibilidad de variantes (§3.2 de `prompt.md`) vive en un único servicio compartido — nunca duplicada entre card, ficha y carrito.
- Principio de ausencia (§4.5): lo que no está cargado no se renderiza vacío, no se renderiza.
- Justificá cada dependencia nueva antes de agregarla.

## 3. Reglas de seguridad

- **EJS: siempre `<%= %>` (escapa).** Nunca `<%- %>`, con dos excepciones permitidas en todo el proyecto:
  1. La descripción del producto, y solo después de pasarla por `sanitize-html` con whitelist restrictiva en el servidor.
  2. JSON embebido en `<script type="application/json">` (ej. la tabla de disponibilidad de variantes, Fase 4). Ese elemento es "raw text" en HTML: el parser nunca decodifica entidades ahí adentro, así que `<%= %>` deja el JSON roto (`JSON.parse` falla en silencio, sin error de servidor — ver `src/services/format.js`). Va siempre con `toScriptJson()` de `src/services/format.js`, que en vez de escapar a entidades neutraliza a nivel de JSON las secuencias peligrosas para el tag (`<`, `>`, `&`), nunca con `JSON.stringify` a secas.
- **Prohibido `innerHTML`, `outerHTML`, `insertAdjacentHTML` y `document.write` con datos dinámicos** en cualquier JS de cliente. Usá `textContent`, `createElement`/`append`, o `<template>` + `cloneNode`.
- Queries parametrizadas siempre.
- Tokens CSRF en todo formulario que muta estado (a partir de la fase que tenga formularios de escritura).
- `helmet` con CSP sin `unsafe-inline` (a partir de la fase que sirva HTML con scripts).
- Secretos solo por variables de entorno. `.env.example` documenta las claves necesarias; `.env` nunca se commitea.

## 4. Commits

- Mensajes en español, atómicos, estilo conventional-ish (`feat:`, `fix:`, `chore:`, `docs:`...).
- Un commit por unidad de trabajo coherente, no por archivo.
- **Nunca agregar "Co-Authored-By" ni ningún trailer de atribución a Claude/IA en los commits.**

## 5. Flujo de desarrollo (entorno de esta máquina)

- **`npm` se ejecuta siempre desde la terminal de Windows, nunca desde WSL.** Motivo: binarios nativos (`sharp`) compilados por plataforma; instalar desde Linux sobre la misma carpeta rompe el procesamiento de imágenes en Windows.
- **Docker Compose corre únicamente Postgres** (`docker-compose.yml` declara solo el servicio `db`). Node corre nativo en Windows vía `npm run dev` para reload instantáneo. La containerización de la app queda para la fase de despliegue.
- Comandos típicos (desde Windows):
  1. `npm install`
  2. `npm run build:css` (o `npm run watch:css` en desarrollo activo)
  3. `node db/migrate.js` (o `npm run migrate`)
  4. `npm run dev`
- Si el puerto 5432 está ocupado, mapear `DB_HOST_PORT=5433` y ajustar `DATABASE_URL` en `.env`.
