# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Cuisine" — a rights/permissions-management app: user registration, login, and role-based access
(`user` vs `admin`). (Note: the repo directory/workspace is named `NetworkManager` but the project
itself is Cuisine — unrelated to the Linux NetworkManager project.)

The project previously also had a recipe-submission-and-moderation feature layered on top of this;
that feature has been stripped out so only rights/account management remains. If you see stray
references to "recipes" in git history or old docs, they're leftovers from that removed feature —
don't resurrect them without being asked.

Two independent npm projects, no shared root `package.json`:
- `client/` — React 19 + Vite + TypeScript + React Router
- `server/` — Node.js + Express + TypeScript, PostgreSQL (`pg`), JWT in an httpOnly cookie, bcrypt, zod

## Commands

Database (PostgreSQL via Docker, idempotent — creates/starts a `cuisine-db` container):
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
npm run migrate   # tsx src/db/migrate.ts — creates/upgrades the users table
npm run seed      # tsx src/db/seed.ts — upserts the admin account from SEED_ADMIN_* env vars
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
  `req.user`) and `requireRole(role)` (checks `req.user.role`). This is the reusable building block
  for gating any future admin-only route — apply both once via `router.use(...)` on a router, as the
  removed `admin.ts` used to.
- Client-side mirrors this with `client/src/context/AuthContext.tsx` (fetches `/auth/me` on mount to
  restore session) and `client/src/components/ProtectedRoute.tsx`, which exports both
  `ProtectedRoute` (any logged-in user) and `AdminRoute` (must have `role === "admin"`) guards for
  React Router. `AdminRoute` currently has no route using it since the admin page was removed —
  it's kept because it's core rights-management infrastructure for whatever admin-only page comes next.

### Server structure (`server/src/`)
- `index.ts` — Express app setup (cors with `credentials: true`, json body parsing, cookie-parser)
  and route mounting. Only `authRoutes` (`/api/auth`) is mounted.
- `db/pool.ts` — shared `pg.Pool` using `DATABASE_URL`.
- `db/migrate.ts` — plain SQL run against the pool; written to be idempotent/re-runnable
  (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, backfill `UPDATE`s, then tighten
  constraints) so it also upgrades older databases in place. Only the `users` table is defined.
  Follow this same idempotent pattern for any future schema change — don't write one-shot
  migrations that fail on existing data.
- `db/seed.ts` — upserts the admin user (`ON CONFLICT (email) DO UPDATE`) from `SEED_ADMIN_*` env vars.
- `routes/auth.ts` — the only resource router: `register`, `login`, `logout`, `me`. Validation via
  zod schemas defined at the top of the file; SQL is written inline with `pool.query` (no ORM).

### Client structure (`client/src/`)
- `api/client.ts` — single `apiFetch<T>()` wrapper around `fetch` (base URL from
  `VITE_API_URL`, `credentials: "include"` for the cookie, throws `ApiError` with the server's
  `error` message on non-2xx). All other `api/*.ts` files call through this.
- `api/auth.ts` — typed request functions for register/login/logout/me, mirroring `routes/auth.ts`.
- `context/AuthContext.tsx` — `AuthProvider`/`useAuth()`, the single source of truth for the current
  user on the client.
- `components/Layout.tsx` — shared header/nav wrapping all routes via `<Outlet />`.
- `components/ProtectedRoute.tsx` — `ProtectedRoute` / `AdminRoute` route guards (see Auth flow above).
- `pages/` — one component per route: `HomePage` (account summary), `LoginPage`, `RegisterPage`.
  All three are registered in `App.tsx`.

### Database schema
Managed entirely by hand-written SQL in `db/migrate.ts` (no migration framework). Single table:
`users` (`username`, `first_name`, `last_name`, `email`, `phone`, `password_hash`, `role`
constrained to `admin`/`user`).

## Environment files
Both `client/` and `server/` need a `.env` (copy from the adjacent `.env.example`). Key server vars:
`DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, `SEED_ADMIN_*`. Key client var: `VITE_API_URL`.
