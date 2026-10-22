**English** · [Español](README.es.md)

# Donna Style

**Live production site: [donnastyle.cc](https://donnastyle.cc)** — deployed and open to the public. No login or setup is needed to browse the storefront; you can walk the full catalog, open product pages, build a cart and reach the checkout hand-off exactly as a customer would.

An online women's clothing store built for a real client. It is a server-rendered web application with its own admin panel: the shop owner loads and manages the whole catalog, stock, homepage carousel, institutional pages and orders from the browser, with no developer in the loop after launch.

---

## What it is and the problem it solves

The client is a small clothing retailer with no physical store and no payment infrastructure. She sells through Instagram and closes every sale by chatting with the customer on WhatsApp, agreeing on payment and delivery there.

The site keeps that sales model and removes the friction around it:

- Customers get a real, navigable catalog instead of scrolling an Instagram feed — categories, product pages with size/color variants, live stock, search and a cart.
- **Checkout does not process payments.** When the customer finishes, the order is built and she is redirected to WhatsApp with the full order detail already written into the message. Personal data, payment method and shipping are settled in that conversation, as they always were.
- Every order gets a permanent public link so the customer can check its status later without an account.
- The owner runs everything herself from `/admin`: products, categories, stock, carousel, institutional pages, order management and store settings.

There are no customer accounts. The only login in the system is the owner's.

---

## Product features

**Storefront**

- Category navigation up to two levels, with a mega-menu that handles both parent categories (dropdown panel) and standalone categories (direct link). Parent categories aggregate the products of all their descendants.
- Product pages with size and color variants, real-time availability per axis (a size stays selectable only if some in-stock variant reaches it), price with bank-transfer/cash discount and installment estimate, and an image lightbox.
- Product search by name, accent-tolerant, rate-limited.
- Cart with quantity editing and a live item count in the header.
- WhatsApp checkout: the order is persisted, then the customer is sent to a prefilled `wa.me` message with the itemized detail and a link back to the order.
- Permanent per-order status page reachable by a public token.
- Homepage carousel with scheduled slides (start/end dates).
- Institutional pages (shipping, returns, payment methods, terms, etc.) authored by the owner with a restricted rich-text editor.
- "Absence principle": anything the owner has not loaded is not rendered empty — it is not rendered at all (no empty address block, no "Information" menu entry until a page exists).

**Admin panel** (`/admin`, single owner account)

- CRUD for products, variants, categories, stock, carousel slides and institutional pages.
- Order list with a status machine (pending → confirmed → delivered / cancelled).
- Image upload with server-side processing (center crop, resize, WebP, EXIF strip) and a client-side crop preview.
- Store settings with a three-level resolver: panel value wins, then environment variable, then a documented default — so the site is fully functional before the panel is ever opened.
- Live name filters on the product and stock lists.
- Reordering is done with explicit move buttons, never drag-and-drop.

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20+ |
| HTTP framework | Express 4 |
| Database | PostgreSQL 15+ |
| Data access | Raw parameterized SQL with `pg`. **No ORM.** |
| Views | EJS, server-side rendered |
| Styles | Tailwind CSS compiled by CLI to a static stylesheet (never the CDN) |
| Client JS | Vanilla, no framework |
| Migrations | Numbered `.sql` files + a hand-written runner (`db/migrate.js`), no migration library |
| Sessions | `express-session` + `connect-pg-simple` (session store in PostgreSQL) |
| Auth | `bcryptjs` (pure-JS, 12+ rounds) for the single admin password |
| Images | `multer` (memory storage) + `sharp` / libvips |
| Security headers | `helmet` with a strict CSP — no `unsafe-inline`, no `unsafe-eval` |

Dependencies are kept deliberately small; each one is justified in `CLAUDE.md`.

---

## Architecture

Classic server-rendered MVC-ish layering, with business rules pulled out of the routes into pure, testable services and invariants pushed down into the database.

```
src/
  config/        environment loading and validation, static config
  db/            pg pool, migration runner
  models/        one module per aggregate — all SQL lives here, always parameterized
  services/      pure business logic (availability, pricing, cart, search, image
                 pipeline, store-config resolver, order status machine, SEO)
  middleware/    auth, CSRF, rate limiting (login / search / checkout), upload,
                 floating-UI deny-list
  routes/        public storefront + routes/admin/* for the panel
  views/         EJS templates (pages/, partials/, layouts/) + views/admin/*
  public/        compiled CSS, client JS, fonts, images, uploads (runtime volume)
db/
  migrations/    001..009 — schema, tracked in schema_migrations
  seeds          dev seed (destructive) + seed-categories (idempotent, prod-safe)
test/            ~60 files, node:test, run against a real PostgreSQL, serially
```

### Data model

Eleven domain tables (plus `schema_migrations` and the session store). Highlights:

- **`categories`** — self-referential, capped at two levels by a trigger (a `CHECK` cannot see other rows). Slugs are frozen on creation so shared links never break.
- **`products`** / **`variants`** — a variant is a (size, color) pair with its own stock and optional price override. `UNIQUE NULLS NOT DISTINCT (product_id, size, color)` (PG15) so single-variant products can't silently duplicate. `product_categories` is a plain N:N join, which is what lets a rotating "2×1" promo work as a category.
- **`product_images`** — an opaque `base_key` per row (no extension, no width); every URL is derived at render time by a single helper. A partial unique index guarantees at most one primary image per product.
- **`orders`** / **`order_items`** — line items snapshot the product name and unit price, so order history survives a later product or variant deletion (`ON DELETE SET NULL`). Order codes (`PED-0001`) are assigned by a `BEFORE INSERT` trigger.
- **`session`** — created by its own numbered migration rather than the library's auto-create, so it is tracked like every other table.

### Engineering decisions worth noting

- **No ORM, on purpose.** All SQL is raw and parameterized, one model module per aggregate, zero string concatenation. Invariants that an ORM would enforce in application code live in the schema instead: triggers, partial unique indexes, `CHECK` constraints, `NULLS NOT DISTINCT`.
- **Strict CSP with zero inline anything.** `script-src 'self'`, `style-src 'self'`, no `unsafe-inline`/`unsafe-eval`. That ruled out inline `<script>`, `onclick=` handlers and `style=` attributes across every view. Destructive-action confirmations use a `data-confirm` attribute picked up by one delegated listener; dynamic styling uses Tailwind arbitrary values with CSS variables.
- **One image pipeline.** Uploads and seed data go through the exact same `sharp` path — center crop to 3:4, three widths, WebP q82, level normalization, EXIF strip. No legacy branch. Keys are opaque and server-generated, which also closes path traversal at the schema level.
- **Shared pure services.** Variant availability, pricing and the store-config resolver each live in exactly one place and are consumed identically by the card, the product page and the cart — never reimplemented per view.
- **Accent-tolerant search without a Postgres extension**, using `translate()` folding rather than requiring `unaccent` / `CREATE EXTENSION` on the host.
- **Additive-only migrations.** There is no staging environment: the first time a migration meets real data is in production, so schema changes add columns/tables and never destructively alter populated ones.
- **Correct client IP behind the proxy.** In production `trust proxy` is set to one hop so `express-session` emits the `secure` cookie and the rate limiters key on the real visitor IP rather than the proxy's.
- **Tests run against a real PostgreSQL**, serially and deterministically — no in-memory DB, no mocking of the data layer.

### Deployment

The application is live at [donnastyle.cc](https://donnastyle.cc), running on a Linux VPS behind an nginx reverse proxy that terminates TLS (HSTS enabled). A single Node process serves the app and connects to PostgreSQL; product images are served from a persistent volume mounted into `public/uploads/`. Docker Compose in the repo provisions only PostgreSQL for local development — the app itself runs natively.

---

## Repository layout for reviewers

- `prompt.md` — the functional source of truth: the original, detailed product specification the whole project was built against.
- `CLAUDE.md` — day-to-day engineering conventions (stack rationale, security rules, folder structure, local workflow).
- `progress.md` — phase-by-phase build log, including the production bug fixes made after launch.
- `src/models/` and `src/services/` are the best entry points to read the actual logic; `db/migrations/` documents the data model with inline rationale.

---

## License

© 2026 Matías Urbina. All rights reserved. The code is published for reference only, as a portfolio piece: no permission is granted to use, copy, or redistribute it. The "Donna Style" name, logo, and brand belong to the client. Third-party fonts keep their own license (Merriweather: SIL Open Font License 1.1). See [LICENSE](LICENSE).
