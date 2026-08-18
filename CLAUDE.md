# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"NetworkManager" — a network equipment inventory app: user registration/login with role-based
access (`user` vs `admin`), and four admin-only sections for managing a network inventory:

- **Type des données** — reference catalogue: device types, link types, brands, and hardware
  models (each hardware model belongs to a brand and a device type, and has its own set of typed
  ports, e.g. a switch model with 4 "Fibre" ports and 24 "TCP/IP" ports).
- **Gestion des Sites** — a Site → Zone → Room physical hierarchy.
- **Gestion du matériel** — actual equipment instances placed in a room (an instance of a hardware
  model), optionally linked to a tracked API, plus port-level parent/child links between equipment
  (e.g. "this switch's port 3 connects to that server's NIC1").
- **Gestion des API** — a flat list of software APIs being tracked for migration (name, migration
  date, "terminé"/"DOE à jour" flags); equipment can optionally point at one of these.

Plain `user` accounts exist but currently have no admin-only pages available to them — all four
sections above are admin-gated.

The project started as a bare rights/permissions-management skeleton (registration, login,
`user`/`admin` roles) with an unrelated recipe-submission-and-moderation feature layered on top;
the recipe feature was stripped out before the network-equipment feature was built, and an earlier
flat "manufacturers" (device-type + brand + hardware-model combination) concept was later replaced
by the Site/Zone/Room hierarchy. Stray empty/unused files (`server/src/routes/admin.ts`,
`server/src/routes/recipes.ts`, `client/src/pages/AdminPage.tsx`, `client/src/pages/MyRecipesPage.tsx`,
`client/src/pages/RecipeDetailPage.tsx`, `client/src/api/recipes.ts`) are leftovers from that
removed feature — they're unused and unmounted; don't resurrect them without being asked.

Two independent npm projects, no shared root `package.json`:
- `client/` — React 19 + Vite + TypeScript + React Router
- `server/` — Node.js + Express + TypeScript, PostgreSQL (`pg`), JWT in an httpOnly cookie, bcrypt, zod

## Commands

Database (PostgreSQL via Docker, idempotent — creates/starts a `networkmanager-db` container):
```powershell
./scripts/start-db.ps1
```

Run both server (port 4000) and client (port 5173), each in its own terminal window, installing deps if `node_modules` is missing:
```powershell
./scripts/run-dev.ps1          # add -SkipInstall to skip the npm install check
```
(`./startup.ps1` at the repo root just delegates to this script.)

Server (`server/`, requires `.env` copied from `.env.example`):
```bash
npm run dev       # tsx watch src/index.ts — http://localhost:4000
npm run build     # tsc -p tsconfig.json
npm run start     # node dist/index.js (after build)
npm run migrate   # tsx src/db/migrate.ts — creates/upgrades all tables
npm run seed      # tsx src/db/seed.ts — upserts the admin account (SEED_ADMIN_*) and sample reference/catalog data
```

Client (`client/`, requires `.env` copied from `.env.example`):
```bash
npm run dev       # vite — http://localhost:5173
npm run build     # tsc -b && vite build
npm run lint      # oxlint
npm run preview
```

There are no test scripts/frameworks configured in either package as of now.

Don't launch the dev servers or drive the app yourself (e.g. via Playwright) to verify a change
works — the user checks it manually. Type-checking (`tsc -b`) and linting (`npm run lint`) are
still fine to run.

## Architecture

### Auth flow
- JWT (`{ id, role }`, 7-day expiry) is signed/verified in `server/src/utils/jwt.ts` and requires
  `JWT_SECRET` in `server/.env` (throws at import time if missing).
- The token is set as an httpOnly cookie named `token` (see `COOKIE_OPTIONS` in
  `server/src/routes/auth.ts`) — never read/written from client JS. Login is by **username**, not email.
- `server/src/middleware/auth.ts` exports `requireAuth` (reads/verifies the cookie, populates
  `req.user`) and `requireRole(role)` (checks `req.user.role`). Every catalog/equipment/site/api
  router applies both once via `router.use(requireAuth, requireRole("admin"))` — those whole APIs
  are admin-only.
- Client-side mirrors this with `client/src/context/AuthContext.tsx` (fetches `/auth/me` on mount to
  restore session) and `client/src/components/ProtectedRoute.tsx`, which exports both
  `ProtectedRoute` (any logged-in user, currently unused — no route needs "any logged-in user" yet)
  and `AdminRoute` (must have `role === "admin"`) guards for React Router. `AdminRoute` wraps the
  `/data-types`, `/sites`, `/equipment`, and `/apis` route trees in `App.tsx`.

### Server structure (`server/src/`)
- `index.ts` — Express app setup (cors with `credentials: true`, json body parsing, cookie-parser)
  and route mounting: `authRoutes` (`/api/auth`) plus one router per resource — `deviceTypes`,
  `linkTypes`, `brands`, `hardwareModels`, `ports`, `sites`, `zones`, `rooms`, `equipment`,
  `equipmentLinks`, `apis` (mounted at the matching kebab-case `/api/...` path, e.g.
  `/api/equipment-links`).
- `db/pool.ts` — shared `pg.Pool` using `DATABASE_URL`.
- `db/migrate.ts` — one big plain-SQL string run against the pool in `db/migrate.ts`; written to be
  idempotent/re-runnable (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, backfill
  `UPDATE`s, then tighten constraints) so it also upgrades older databases in place. It defines
  `users` plus the full catalog/sites/equipment/apis schema (see Database schema below), including
  several in-place migrations (e.g. `manufacturer_ports` renamed to `hardware_model_ports` and its
  `port_type` text column extracted into a `link_types` table + `link_type_id` FK; a whole earlier
  "manufacturers" combination table dropped in favor of `hardware_models.device_type_id` +
  `equipment.hardware_model_id`/`device_type_id`; `equipment.zone_id` migrated to `room_id` once
  rooms were introduced). Follow this same idempotent pattern for any future schema change — don't
  write one-shot migrations that fail on existing data, and remember statement order matters since
  it's all one script (e.g. `apis` must be created before the `ALTER TABLE equipment ADD COLUMN
  api_id ... REFERENCES apis(id)` that follows it).
- `db/seed.ts` — upserts the admin user (`ON CONFLICT (email) DO UPDATE`) from `SEED_ADMIN_*` env
  vars, then seeds sample device types, brands, hardware models (each with a device type — upsert
  uses `DO UPDATE SET device_type_id = ...` so re-seeding fixes stale values, not just
  `DO NOTHING`), link types, and ports. Safe to re-run.
- `routes/auth.ts` — `register`, `login`, `logout`, `me` (no auth required except `me`).
- `routes/{deviceTypes,linkTypes,brands,hardwareModels,ports,sites,zones,rooms,equipment,
  equipmentLinks,apis}.ts` — one router per table, each admin-gated, each following the same shape:
  zod schema at the top, a `SELECT` fragment joining in related names for display (e.g.
  `hardwareModels` joins `brands`/`device_types`; `equipment` joins all the way up through
  `rooms`/`zones`/`sites` plus `device_types`, `hardware_models` (+ its `brands`), and a `LEFT JOIN`
  to `apis` since the API link is optional), `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE
  /:id`, and a `pg` foreign-key-violation (`23503`) catch that turns it into a 409/400 with a French
  error message instead of a raw DB error. `GET /` on `zones`/`rooms`/`equipment`/`equipmentLinks`
  accepts an optional query filter (`siteId`/`zoneId`/`roomId`/`equipmentId`) and returns everything
  when it's omitted. Validation via zod; SQL is written inline with `pool.query` (no ORM).

### Client structure (`client/src/`)
- `api/client.ts` — single `apiFetch<T>()` wrapper around `fetch` (base URL from
  `VITE_API_URL`, `credentials: "include"` for the cookie, throws `ApiError` with the server's
  `error` message on non-2xx). All other `api/*.ts` files call through this, one typed
  request-function module per server router (`api/apis.ts`, `api/equipment.ts`, `api/sites.ts`, etc).
- `context/AuthContext.tsx` — `AuthProvider`/`useAuth()`, the single source of truth for the current
  user on the client.
- `context/SitesTreeContext.tsx` — `SitesTreeProvider`/`useSitesTree()`: holds a `version` counter
  and a `refresh()` that bumps it. `SitesLayout` wraps the whole `/sites` route tree in this
  provider; `SitesTree` (see below) re-fetches whenever `version` changes. **Any code that
  creates/updates/deletes a site, zone, or room must call `refresh()` after the API call succeeds**,
  or the tree panel goes stale.
- `components/Layout.tsx` — shared header/nav with sidebar links to `/data-types`, `/sites`,
  `/apis`, `/equipment` shown only for `role === "admin"`; wraps all routes via `<Outlet />`.
- `components/ProtectedRoute.tsx` — `ProtectedRoute` / `AdminRoute` route guards (see Auth flow above).
- `components/Modal.tsx` — generic modal shell (overlay + dialog + close button); used for every
  add/edit form in the app.
- `components/SimpleNameFormModal.tsx` — generic single-"Nom"-field modal, parameterized with
  `loadName`/`save` callbacks; reused as-is by the device-type, link-type, and brand list pages.
- `components/SortableHeader.tsx` / `hooks/useTableQuery.ts` — shared client-side search+sort for
  the list pages (no server-side filtering/pagination). List pages can layer extra `<select>`
  filters on top by pre-filtering the array passed into `useTableQuery` (see
  `EquipmentListPage`'s room/API filters).
- **Add/edit is always a modal, never a routed page.** Every list page (`*ListPage.tsx`) owns
  `modalOpen`/`editingId` state, renders an "Ajouter" button and per-row "Modifier" buttons that set
  that state, and conditionally renders a `*FormModal` component that calls `onSaved()` (close +
  reload the list) or `onClose()`. There are no `.../new` or `.../:id/edit` routes anywhere except
  the Sites detail pages (`/sites/:siteId`, `.../zones/:zoneId`, `.../rooms/:roomId`), which are
  read-only drill-down pages, not forms.
- `pages/HomePage.tsx`, `LoginPage.tsx`, `RegisterPage.tsx` — registered directly in `App.tsx`.
  `HomePage` shows device-type/link-type/brand/hardware-model counts for admins, a login/register
  prompt otherwise.
- `pages/dataTypes/` — `DataTypesLayout.tsx` provides the shared tab nav (`/data-types`,
  `link-types`, `brands`, `hardware-models`); each tab is a `*ListPage`. `HardwareModelFormModal`
  is the one non-trivial form: besides brand/device-type/name, editing an existing hardware model
  also shows a nested "Ports" panel (bulk-generate N ports of a given link type, delete a port) —
  that sub-feature only exists once the hardware model already has an id, so it renders inside the
  same modal only when editing.
- `pages/sites/` — `SitesLayout.tsx` renders a persistent two-column shell (`.tree-shell` /
  `.tree-panel` CSS) for the whole `/sites` tree: `SitesTree.tsx` on the left, the routed page
  (`SitesListPage`, `SiteDetailPage`, `ZoneDetailPage`, `RoomDetailPage`) on the right via
  `<Outlet />`. `SitesTree` eagerly fetches *all* sites/zones/rooms up front (no per-node lazy
  fetch) and renders **expanded by default** — it tracks a `collapsedSites`/`collapsedZones`
  exception set rather than an opt-in expanded set, so everything is open until a node is
  explicitly toggled shut. It highlights the site/zone/room matching the current route params.
  `SiteFormModal`/`ZoneFormModal`/`RoomFormModal` are opened from `SitesListPage`/`SiteDetailPage`/
  `ZoneDetailPage` respectively and call `useSitesTree().refresh()` on save/delete.
- `pages/equipment/` — `EquipmentLayout.tsx` renders the same tree-shell pattern: `EquipmentLinksTree`
  (parent/child port links, also expanded-by-default, same collapsed-exception-set approach) on the
  left, tabs ("Matériel" / "Liaisons") + `<Outlet />` on the right. `EquipmentListPage` is the
  global equipment list (every room, not scoped to one) with room/API `<select>` filters alongside
  the text search; `EquipmentFormModal` lets you pick the room from a flat list (it's no longer
  created "from inside" a room) and an optional API. `EquipmentLinksPage` manages the global list of
  port-to-port links between any two equipment. Because editing equipment is a modal on
  `EquipmentListPage` rather than a route, `EquipmentLinksTree`'s entries link to
  `/equipment?edit=<id>` — `EquipmentListPage` watches that query param, opens the edit modal for it,
  then strips it from the URL.
- `pages/apis/` — `ApisListPage.tsx` is a flat list (no layout/tabs needed, single resource) plus
  `ApiFormModal.tsx` (Nom, Date de migration, "Terminé" and "DOE à jour" checkboxes).

### Database schema
Managed entirely by hand-written SQL in `db/migrate.ts` (no migration framework). Tables:
- `users` — `username`, `first_name`, `last_name`, `email`, `phone`, `password_hash`, `role`
  constrained to `admin`/`user`.
- `device_types` — `name` (unique). E.g. "Serveur", "Switch", "Firewall", "Automate".
- `brands` — `name` (unique). E.g. "DELL", "CISCO", "HIRSCHMANN".
- `hardware_models` — a catalogue model: `brand_id` FK → `brands`, `device_type_id` FK →
  `device_types`, `name`; unique per `(brand_id, name)`.
- `link_types` — `name` (unique). E.g. "Fibre", "TCP/IP", "ModBus".
- `hardware_model_ports` — a port definition belonging to a hardware model: `hardware_model_id` FK
  → `hardware_models` (`ON DELETE CASCADE`), `link_type_id` FK → `link_types`, `label`.
- `sites` — `name` (unique).
- `zones` — `site_id` FK → `sites`, `name`; unique per `(site_id, name)`.
- `rooms` — `zone_id` FK → `zones`, `name`; unique per `(zone_id, name)`.
- `equipment` — a physical/logical piece of equipment: `room_id` FK → `rooms`, `device_type_id` FK
  → `device_types`, `hardware_model_id` FK → `hardware_models`, `api_id` FK → `apis` (nullable —
  linking to an API is optional), `name`.
- `equipment_links` — a port-to-port connection between two equipment: `parent_equipment_id`/
  `child_equipment_id` FK → `equipment` (`ON DELETE CASCADE`), `parent_port_id`/`child_port_id` FK
  → `hardware_model_ports`; a port can only be used by one link in either role (unique indexes), and
  an equipment can't link to itself (`CHECK`).
- `apis` — `name`, `migration_date` (nullable), `completed` (bool), `doe_up_to_date` (bool).

## Environment files
Both `client/` and `server/` need a `.env` (copy from the adjacent `.env.example`). Key server vars:
`DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, `SEED_ADMIN_*`. Key client var: `VITE_API_URL`.
