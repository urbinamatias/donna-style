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
| Imágenes | `multer` + `sharp` (a partir de la fase que las necesite) |
| Sesiones | `express-session` + `connect-pg-simple` (a partir de la fase que las necesite) |

## 2. Convenciones del proyecto

- Estructura de carpetas: ver §9 de `prompt.md` (`/src/config`, `/src/db`, `/src/models`, `/src/services`, `/src/routes`, `/src/middleware`, `/src/views`, `/src/public`, `/db/migrations`, `/db/seeds`).
- **Sin ORM.** Todo acceso a datos es SQL crudo con `pg`, siempre parametrizado (`$1, $2...`). Cero concatenación de strings en SQL.
- La lógica de disponibilidad de variantes (§3.2 de `prompt.md`) vive en un único servicio compartido — nunca duplicada entre card, ficha y carrito.
- Principio de ausencia (§4.5): lo que no está cargado no se renderiza vacío, no se renderiza.
- Justificá cada dependencia nueva antes de agregarla.

## 3. Reglas de seguridad

- **EJS: siempre `<%= %>` (escapa).** Nunca `<%- %>`. La única excepción permitida en todo el proyecto es la descripción del producto, y solo después de pasarla por `sanitize-html` con whitelist restrictiva en el servidor.
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
