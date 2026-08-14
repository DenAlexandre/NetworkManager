# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"NetworkManager" — a network equipment inventory app: user registration/login with role-based
access (`user` vs `admin`), and an admin-only catalog of network equipment (servers, switches,
firewalls, PLCs...) with their manufacturers, hardware models, brands, device types, link types,
and ports. Plain `user` accounts exist but currently have no admin-only pages available to them —
all catalog/equipment management is admin-gated.

The project started as a bare rights/permissions-management skeleton (registration, login,
`user`/`admin` roles) with an unrelated recipe-submission-and-moderation feature layered on top;
the recipe feature was stripped out before the network-equipment feature was built. Stray empty
files (`server/src/routes/admin.ts`, `server/src/routes/recipes.ts`,
`client/src/pages/AdminPage.tsx`, `client/src/pages/MyRecipesPage.tsx`,
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

Server (`server/`, requires `.env` copied from `.env.example`):
```bash
npm run dev       # tsx watch src/index.ts — http://localhost:4000
npm run build     # tsc -p tsconfig.json
npm run start     # node dist/index.js (after build)
npm run migrate   # tsx src/db/migrate.ts — creates/upgrades all tables (users + equipment catalog)
npm run seed      # tsx src/db/seed.ts — upserts the admin account (SEED_ADMIN_*) and sample catalog/equipment data
```

Client (`client/`, requires `.env` copied from `.env.example`):
```bash
npm run dev       # vite — http://localhost:5173
npm run build     # tsc -b && vite build
npm run lint      # oxlint
npm run preview
```

There are no test scripts/frameworks configured in either package as of now.

## Architecture

### Auth flow
- JWT (`{ id, role }`, 7-day expiry) is signed/verified in `server/src/utils/jwt.ts` and requires
  `JWT_SECRET` in `server/.env` (throws at import time if missing).
- The token is set as an httpOnly cookie named `token` (see `COOKIE_OPTIONS` in
  `server/src/routes/auth.ts`) — never read/written from client JS. Login is by **username**, not email.
- `server/src/middleware/auth.ts` exports `requireAuth` (reads/verifies the cookie, populates
  `req.user`) and `requireRole(role)` (checks `req.user.role`). Every catalog/equipment router
  applies both once via `router.use(requireAuth, requireRole("admin"))` — the whole equipment API
  is admin-only.
- Client-side mirrors this with `client/src/context/AuthContext.tsx` (fetches `/auth/me` on mount to
  restore session) and `client/src/components/ProtectedRoute.tsx`, which exports both
  `ProtectedRoute` (any logged-in user, currently unused — no route needs "any logged-in user" yet)
  and `AdminRoute` (must have `role === "admin"`) guards for React Router. `AdminRoute` wraps the
  `/data-types` and `/equipment` route trees in `App.tsx`.

### Server structure (`server/src/`)
- `index.ts` — Express app setup (cors with `credentials: true`, json body parsing, cookie-parser)
  and route mounting: `authRoutes` (`/api/auth`) plus one router per catalog/equipment resource —
  `deviceTypes`, `linkTypes`, `brands`, `hardwareModels`, `manufacturers`, `equipment`, `ports`
  (mounted at the matching kebab-case `/api/...` path, e.g. `/api/device-types`).
- `db/pool.ts` — shared `pg.Pool` using `DATABASE_URL`.
- `db/migrate.ts` — plain SQL run against the pool; written to be idempotent/re-runnable
  (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, backfill `UPDATE`s, then tighten
  constraints) so it also upgrades older databases in place. Defines `users` plus the full
  equipment catalog schema (see Database schema below), including several in-place column-to-table
  extraction migrations (e.g. `manufacturers.device_type` text column → `device_types` table +
  `device_type_id` FK). Follow this same idempotent pattern for any future schema change — don't
  write one-shot migrations that fail on existing data.
- `db/seed.ts` — upserts the admin user (`ON CONFLICT (email) DO UPDATE`) from `SEED_ADMIN_*` env
  vars, then seeds sample device types, brands, hardware models, manufacturers, equipment, link
  types, and ports (all upserts via `ON CONFLICT ... DO NOTHING`, safe to re-run).
- `routes/auth.ts` — `register`, `login`, `logout`, `me` (no auth required except `me`).
- `routes/{deviceTypes,linkTypes,brands,hardwareModels,manufacturers,equipment,ports}.ts` — one
  router per table, each admin-gated, each following the same shape: zod schema at the top, a
  `SELECT` fragment joining in related names (e.g. `manufacturers` joins `device_types`/`brands`/
  `hardware_models` for display names), `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`,
  and a `pg` foreign-key-violation (`23503`) catch that turns it into a 409/400 with a French
  error message instead of a raw DB error. Validation via zod; SQL is written inline with
  `pool.query` (no ORM).

### Client structure (`client/src/`)
- `api/client.ts` — single `apiFetch<T>()` wrapper around `fetch` (base URL from
  `VITE_API_URL`, `credentials: "include"` for the cookie, throws `ApiError` with the server's
  `error` message on non-2xx). All other `api/*.ts` files call through this.
- `api/auth.ts` — typed request functions for register/login/logout/me, mirroring `routes/auth.ts`.
- `api/{deviceTypes,linkTypes,brands,hardwareModels,manufacturers,equipment,ports}.ts` — typed
  CRUD functions mirroring each server router.
- `context/AuthContext.tsx` — `AuthProvider`/`useAuth()`, the single source of truth for the current
  user on the client.
- `components/Layout.tsx` — shared header/nav with sidebar links to `/data-types` and `/equipment`
  shown only for `role === "admin"`; wraps all routes via `<Outlet />`.
- `components/ProtectedRoute.tsx` — `ProtectedRoute` / `AdminRoute` route guards (see Auth flow above).
- `components/SortableHeader.tsx` / `hooks/useTableQuery.ts` — shared client-side search+sort for
  the list pages (no server-side filtering/pagination).
- `pages/HomePage.tsx`, `LoginPage.tsx`, `RegisterPage.tsx` — registered directly in `App.tsx`.
  `HomePage` shows equipment/manufacturer/port counts for admins, a login/register prompt otherwise.
- `pages/dataTypes/` — admin pages for the reference tables: device types, link types, brands,
  hardware models (each a `*ListPage` + `*FormPage` pair under `/data-types/...`,
  `DataTypesLayout.tsx` provides the shared sub-nav).
- `pages/equipment/` — admin pages for equipment, manufacturers (brand/device-type/hardware-model
  combinations), and ports (each a `*ListPage` + `*FormPage` pair under `/equipment/...`,
  `EquipmentLayout.tsx` provides the shared sub-nav).

### Database schema
Managed entirely by hand-written SQL in `db/migrate.ts` (no migration framework). Tables:
- `users` — `username`, `first_name`, `last_name`, `email`, `phone`, `password_hash`, `role`
  constrained to `admin`/`user`.
- `device_types` — `name` (unique). E.g. "Serveur", "Switch", "Firewall", "Automate".
- `brands` — `name` (unique). E.g. "DELL", "CISCO", "HIRSCHMANN".
- `hardware_models` — `brand_id` FK → `brands`, `name`; unique per `(brand_id, name)`.
- `manufacturers` — a device-type + brand + optional hardware-model combination (despite the name,
  this is "manufacturer declination", not a company row): `device_type_id` FK → `device_types`,
  `brand_id` FK → `brands`, `hardware_model_id` FK → `hardware_models` (nullable), `doc_path`,
  `io_type`.
- `network_equipment` — a physical/logical piece of equipment: `name`, `manufacturer_id` FK →
  `manufacturers` (`ON DELETE RESTRICT`).
- `link_types` — `name` (unique). E.g. "Fibre", "TCP/IP", "ModBus".
- `manufacturer_ports` — a port definition for a manufacturer combination: `manufacturer_id` FK →
  `manufacturers` (`ON DELETE CASCADE`), `link_type_id` FK → `link_types`, `label`.

## Environment files
Both `client/` and `server/` need a `.env` (copy from the adjacent `.env.example`). Key server vars:
`DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, `SEED_ADMIN_*`. Key client var: `VITE_API_URL`.
