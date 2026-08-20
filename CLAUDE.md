# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"NetworkManager" — a network equipment inventory app: user registration/login with role-based
access (`user` vs `admin`), and a set of admin-only sections for managing a network inventory and
its documentation:

- **Type des données** (`/data-types`) — reference catalogue: device types, link types,
  configuration types (named, reusable config profiles independent of link types), brands, and
  hardware models. Each hardware model belongs to a brand and a device type and has its own typed
  ports (`hardware-models` tab) and supervision variables (`variables` tab — catalogue-level: name/
  unit/register, not the per-equipment mnemonic/description). The `ports` tab is a visual "region
  designer": drag a rectangle over the model's uploaded photo to mark where each port physically
  sits, later used by Plans to draw links from the right spot on the image.
- **Gestion des Sites** (`/sites`) — a Site → Zone → Room physical hierarchy.
- **Gestion du matériel** (`/equipment`) — actual equipment instances placed in a room (an instance
  of a hardware model), optionally linked to a tracked API and/or to another equipment in that same
  API (a free-form relation independent of port links, e.g. "this UPS is associated with its
  upstream breaker"). Tabs: **Matériel** (list/CRUD), **Liaisons** (port-to-port parent/child links
  between equipment, e.g. "this switch's port 3 connects to that server's NIC1"), **Adressage**
  (VLAN/IP/gateway/mask per TCP-IP port, ModBus address per ModBus port).
- **Gestion des variables** (`/variables`) — per-equipment override of each of its hardware model's
  supervision variables: mnemonic + description specific to that physical instance (distinct from
  the catalogue-level names/units/registers configured under Type des données > Matériel > Variables).
- **Gestion des API** (`/apis`) — a flat list of software APIs being tracked for migration (name,
  migration date, "terminé"/"DOE à jour" flags); equipment can optionally point at one of these.
- **Plans** (`/plans`, `DesignPage.tsx`) — a per-API cabling/wiring diagram editor: drag equipment
  cards (showing the hardware model's photo) onto a canvas, draw/auto-route links between their
  ports, annotate with text blocks, undo/zoom/multi-select. Layout is persisted server-side as one
  JSONB blob per API (`design_schemas`). Card/link context menus deep-link out to
  `/equipment?open=<id>`, `/equipment/addressing?open=<id>`, `/equipment/links?open=<id>` (each with
  `&returnTo=/plans` so closing the modal navigates back).
- **Gestion des configurations** (`/configurations`) — import real device config exports/backups
  (HIRSCHMANN BRS30 switch XML, MOXA MGate binary `.cfg`) against a catalogue hardware model
  (gated by `hardware_models.config_import_enabled`), inspect the parsed VLANs/ports/MRP or serial
  ports/slave-ID maps, and "apply" a config to create/update an `equipment` record from it
  (auto-resolving room by location string, auto-mapping or asking the user to map config port names
  to catalogue ports — manual mappings are remembered per hardware model so future imports of the
  same model don't ask again).
- **Reporting** (`/reporting`) — a configurable pivot-style table over all equipment data (catalogue
  info, site/room, API, addressing, switch/moxa config summaries, port links, variables), with
  Excel-style per-column filters/sort, CSV/xlsx export, and named saved views (`report_configs`).
- **Système** (`/system`) — **Base de données** tab: full JSON backup/restore of every table, and a
  "RAZ" reset that wipes instance data (equipment, sites, apis, configs, etc.) while keeping user
  accounts and the Type des données catalogue. **Import/Export** tab: bulk CSV/xlsx import/export
  for equipment, rooms, APIs, and equipment variables (mnemonic/description).

Plain `user` accounts exist but currently have no admin-only pages available to them — every
section above is admin-gated.

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
works — the user checks it manually. Type-checking (`tsc -b`, or `tsc -p tsconfig.json --noEmit`
for the server) and linting (`npm run lint`) are still fine to run.

## Architecture

### Auth flow
- JWT (`{ id, role }`, 7-day expiry) is signed/verified in `server/src/utils/jwt.ts` and requires
  `JWT_SECRET` in `server/.env` (throws at import time if missing).
- The token is set as an httpOnly cookie named `token` (see `COOKIE_OPTIONS` in
  `server/src/routes/auth.ts`) — never read/written from client JS. Login is by **username**, not email.
- `server/src/middleware/auth.ts` exports `requireAuth` (reads/verifies the cookie, populates
  `req.user`) and `requireRole(role)` (checks `req.user.role`). Every resource router applies both
  once via `router.use(requireAuth, requireRole("admin"))` — those whole APIs are admin-only.
- Client-side mirrors this with `client/src/context/AuthContext.tsx` (fetches `/auth/me` on mount to
  restore session) and `client/src/components/ProtectedRoute.tsx`, which exports both
  `ProtectedRoute` (any logged-in user, currently unused — no route needs "any logged-in user" yet)
  and `AdminRoute` (must have `role === "admin"`) guards for React Router. `AdminRoute` wraps every
  admin section's route tree in `App.tsx`.

### Server structure (`server/src/`)
- `index.ts` — Express app setup: `cors` with `credentials: true`, a raised `express.json({ limit:
  "200mb" })` (a full database backup/restore payload can otherwise exceed the default), cookie
  parsing, `/uploads` served statically from `<cwd>/uploads`, and one router per resource mounted
  under `/api/<kebab-case-name>` (`auth`, `device-types`, `link-types`, `configuration-types`,
  `brands`, `hardware-models`, `ports`, `variables`, `sites`, `zones`, `rooms`, `equipment`,
  `equipment-links`, `equipment-port-settings`, `equipment-variable-settings`, `apis`,
  `design-schemas`, `switch-configs`, `mgate-configs`, `system`, `report-configs`).
- `db/pool.ts` — shared `pg.Pool` using `DATABASE_URL`.
- `db/migrate.ts` — one big plain-SQL string run against the pool; written to be idempotent/
  re-runnable (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, backfill `UPDATE`s, then
  tighten constraints) so it also upgrades older databases in place. Statement order matters since
  it's all one script (e.g. `apis` must exist before the `equipment.api_id` FK is added; a table
  referenced by a later `ALTER TABLE ... ADD COLUMN ... REFERENCES` must be created earlier in the
  file). Follow this same idempotent pattern for any future schema change — no one-shot migrations
  that fail on existing data. Named CHECK/FK constraints aren't used for idempotent add/drop in this
  codebase; self-referencing or cross-table invariants that would need one (e.g. "equipment can't
  link to itself") are instead enforced in the route handler.
- `db/seed.ts` — upserts the admin user (`ON CONFLICT (email) DO UPDATE`) from `SEED_ADMIN_*` env
  vars, then seeds sample device types, brands, hardware models (each with a device type — upsert
  uses `DO UPDATE SET device_type_id = ...` so re-seeding fixes stale values, not just
  `DO NOTHING`), link types, and ports. Safe to re-run. This is sample/demo catalogue data, not a
  place for real-world inventory records — those get added directly through the app (or, for
  bulk data, the Import/Export tab or a direct one-off DB write when asked to).
- `routes/auth.ts` — `register`, `login`, `logout`, `me` (no auth required except `me`).
- Most routers (`deviceTypes`, `linkTypes`, `configurationTypes`, `brands`, `hardwareModels`,
  `ports`, `variables`, `sites`, `zones`, `rooms`, `equipment`, `equipmentLinks`,
  `equipmentPortSettings`, `equipmentVariableSettings`, `apis`, `reportConfigs`) follow the same
  shape: zod schema at the top, a `SELECT` fragment joining in related names for display (e.g.
  `hardwareModels` joins `brands`/`device_types`; `equipment` joins all the way up through
  `rooms`/`zones`/`sites` plus `device_types`, `hardware_models` (+ its `brands`), and `LEFT JOIN`s
  to `apis` and to itself for the optional `linked_equipment_id`), `GET /`, `GET /:id`, `POST /`,
  `PUT /:id`, `DELETE /:id`, and a `pg` foreign-key-violation (`23503`) catch that turns it into a
  409/400 with a French error message instead of a raw DB error. `GET /` on scoped resources
  (`zones`/`rooms`/`equipment`/`equipmentLinks`) accepts an optional query filter
  (`siteId`/`zoneId`/`roomId`/`equipmentId`) and returns everything when it's omitted.
  `deviceTypes.ts` additionally exposes `POST /:id/replace` (reassign every `hardware_models`/
  `equipment` row using this type to another type, in a transaction, then delete it) — the pattern
  to reuse if another catalogue table ever needs a "replace instead of delete" flow. Validation via
  zod; SQL is written inline with `pool.query` (no ORM).
- `routes/ports.ts` — beyond standard CRUD, also does bulk port generation (`POST /bulk`: creates N
  ports of one link type, continuing the numbering from the model's existing port count) and owns
  the port-designer geometry (`PUT/DELETE /:id/region` sets/clears `region_x/y/width/height`, used
  to place clickable port hitboxes over the hardware model's photo).
- `routes/equipmentPortSettings.ts` — not row-keyed CRUD: `GET /` returns one joined query across
  every equipment cross-joined with its model's ports (`LEFT JOIN` to existing settings), filtered
  in JS to only "addressable" port types (label containing "modbus" or "tcpip", case/whitespace
  normalized) — non-addressable ports (e.g. Fibre) never appear. `PUT /` is a single per-port upsert
  (`ON CONFLICT (equipment_id, hardware_model_port_id) DO UPDATE`).
- `routes/designSchemas.ts` — one JSONB blob per API (`design_schemas`, unique on `api_id`): the
  full Plans canvas state (`cards`, hand-drawn link `paths`, legacy `bends`/`bendsY`, `textBlocks`,
  `zoom`). `GET /`, `GET /:apiId`, `PUT /:apiId` upserts via `ON CONFLICT (api_id) DO UPDATE`.
- `routes/switchConfigs.ts` / `routes/mgateConfigs.ts` — import config files against a catalogue
  hardware model, gated by a hardcoded parser table keyed on brand+model name (currently only
  HIRSCHMANN/BRS30 and MOXA/MGate 3480 — adding a new supported model needs both a new parser and a
  `config_import_enabled` catalogue entry). Uses `multer` `memoryStorage` — raw file bytes are
  stored straight in the DB (`switch_configurations.raw_xml`, `mgate_configurations.raw_cfg`; served
  back via `GET /:id/xml` / `GET /:id/cfg`), not written to disk. Import is transactional: insert the
  parent config row, then children (`switch_vlans`/`switch_ports`/`switch_mrp_configs` or
  `mgate_serial_ports`/`mgate_slave_ids`). Both expose `POST /:id/apply-to-equipment`, which
  creates/updates an `equipment` row from the parsed config: room is auto-resolved by matching the
  config's location string to a room name (or the response asks the client for an explicit
  `roomId`), and for switches, parsed port names are matched to `hardware_model_ports` by label,
  auto-created when unmatched (link type guessed Fibre vs TCP-IP from the speed/MAU OID), or
  resolved via a client-supplied `portMapping` — **manual mappings are persisted in
  `hardware_model_port_aliases` (unique per `hardware_model_id, source_label`) so the same model
  never asks again for that port name.**
- `routes/system.ts` — three transactional admin operations: `GET /database/backup` (dumps every
  table, in a hardcoded parent-before-child `TABLES` order, as downloadable JSON), `POST
  /database/restore` (zod-validated, `TRUNCATE ... RESTART IDENTITY CASCADE` then re-inserts
  everything, re-stringifying the JSONB columns it knows about, then re-syncs every serial sequence
  past the max restored id), `POST /database/reset` (truncates everything except `users` and the
  Type des données catalogue tables — a "wipe instance data, keep accounts + catalogue" reset).
- `services/moxaXmlParser.ts` — parses the HIRSCHMANN/MOXA BRS30 XML export (validates the
  `mibconf` namespace) via `fast-xml-parser`, cross-referencing IF-MIB/MAU-MIB/Q-BRIDGE-MIB/LLDP-MIB/
  HM2-* tables by port index into a `ParsedSwitchConfig`.
- `services/moxaCfgParser.ts` — a hand-rolled binary reader for MOXA MGateManager's proprietary
  `.cfg` format; heavily commented as reverse-engineered/best-effort (some fields are hardcoded
  constants "observed on all samples" rather than truly decoded) and explicitly ported from a
  reference C# implementation — treat its output as approximate, not authoritative.
- File uploads: no shared multer middleware — each route configures its own. `hardwareModels.ts`
  uses `diskStorage` to `uploads/hardware-models` (photos) and `uploads/hardware-model-datasheets`,
  storing `image_path`/`datasheet_path` and deleting the old file on replace; `sites.ts` does the
  same for `uploads/site-datasheets`. `switchConfigs.ts`/`mgateConfigs.ts` use `memoryStorage`
  instead since their payloads go to the DB, not disk. Everything under `uploads/` is served back
  via the static mount in `index.ts`.

### Client structure (`client/src/`)
- `api/client.ts` — single `apiFetch<T>()` wrapper around `fetch` (base URL from
  `VITE_API_URL`, `credentials: "include"` for the cookie, throws `ApiError` with the server's
  `error` message and HTTP `status` on non-2xx). All other `api/*.ts` files call through this, one
  typed request-function module per server router.
- `context/AuthContext.tsx` — `AuthProvider`/`useAuth()`, the single source of truth for the current
  user on the client.
- `context/SitesTreeContext.tsx` — `SitesTreeProvider`/`useSitesTree()`: holds a `version` counter
  and a `refresh()` that bumps it. `SitesLayout` wraps the whole `/sites` route tree in this
  provider; `SitesTree` (see below) re-fetches whenever `version` changes. **Any code that
  creates/updates/deletes a site, zone, or room must call `refresh()` after the API call succeeds**,
  or the tree panel goes stale.
- `components/Layout.tsx` — shared header/nav with sidebar links to every admin section, shown only
  for `role === "admin"`; wraps all routes via `<Outlet />`.
- `components/ProtectedRoute.tsx` — `ProtectedRoute` / `AdminRoute` route guards (see Auth flow above).
- `components/Modal.tsx` — generic modal shell (overlay + dialog + close button, optional `wide`/
  `xwide` size variants); used for every add/edit form in the app.
- `components/SimpleNameFormModal.tsx` — generic single-"Nom"-field modal, parameterized with
  `loadName`/`save` callbacks; reused as-is by the device-type, link-type, brand, and
  configuration-type list pages.
- `components/SortableHeader.tsx` + `hooks/useTableQuery.ts`, and `components/ColumnFilterCell.tsx`
  + `hooks/usePagination.ts`/`components/Pagination.tsx` — the shared list-page toolkit: client-side
  search/sort/pagination (no server-side filtering/pagination anywhere). `useTableQuery`'s
  `FilterColumn` supports either free-text filtering or `type: "select"` with a fixed `options` list
  (rendered by `ColumnFilterCell`); list pages can layer extra `<select>` filters on top by
  pre-filtering the array passed into `useTableQuery` (see `EquipmentListPage`'s room/API filters).
- `utils/csv.ts` — shared `parseCsv`/`toCsvField`/`ImportRowResult` used by every Import/Export
  component (see `pages/system/` below).
- **Add/edit is always a modal, never a routed page.** Every list page (`*ListPage.tsx`) owns
  `modalOpen`/`editingId` state, renders an "Ajouter" button and per-row "Modifier" buttons that set
  that state, and conditionally renders a `*FormModal` component that calls `onSaved()` (close +
  reload the list) or `onClose()`. The only routed (non-modal) detail/form pages are the Sites and
  configuration-import detail pages (`/sites/:siteId`, `.../zones/:zoneId`, `.../rooms/:roomId`,
  `/configurations/:id`, `/configurations/moxa/:id`), which are read-only drill-down pages.
- **Deep-linking convention**: several pages support `?open=<id>&returnTo=<path>` in the URL to open
  a specific record's edit modal directly (e.g. from Plans' card/link context menus into
  `/equipment`, `/equipment/addressing`, `/equipment/links`, or from a "Variables"/list column into
  `/variables?open=<equipmentId>`). The target page watches the query param in a `useEffect`, opens
  the modal, remembers `returnTo`, then strips the params from the URL (`setSearchParams({}, {
  replace: true })`) so they don't reopen on refresh; closing/saving the modal navigates to
  `returnTo` if one was given instead of just closing.
- `pages/HomePage.tsx`, `LoginPage.tsx`, `RegisterPage.tsx` — registered directly in `App.tsx`.
  `HomePage` shows device-type/link-type/brand/hardware-model counts for admins, a login/register
  prompt otherwise.
- `pages/dataTypes/` — `DataTypesLayout.tsx` provides the shared tab nav (device types, link types,
  configuration types, brands, hardware models, `ports` = `PortsDesignerPage`, `variables` =
  catalogue-level `VariablesPage`, not to be confused with `/variables`'s per-equipment
  `VariablesManagementPage`). `HardwareModelFormModal` is the one non-trivial form: besides brand/
  device-type/name/photo/datasheet, editing an existing hardware model also shows a nested "Ports"
  panel (bulk-generate N ports of a given link type, delete a port) — that sub-feature only exists
  once the hardware model already has an id, so it renders inside the same modal only when editing.
  `PortsDesignerPage.tsx` lets you drag a rectangle over the model's photo to mark a port's on-image
  region (percentage-based drag math, converted to natural-pixel coordinates on save).
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
  left, tabs ("Matériel" / "Liaisons" / "Adressage") + `<Outlet />` on the right. `EquipmentListPage`
  is the global equipment list (every room, not scoped to one) with room/API `<select>` filters
  alongside text search; `EquipmentFormModal` lets you pick the room from a flat list, an optional
  API, and (once an API is chosen) an optional "Lié à" link to another equipment sharing that same
  API. `EquipmentLinksPage` manages the global list of port-to-port links between any two equipment.
- `pages/apis/` — `ApisListPage.tsx` is a flat list (no layout/tabs needed, single resource) plus
  `ApiFormModal.tsx` (Nom, Date de migration, "Terminé" and "DOE à jour" checkboxes).
- `pages/variables/` — `VariablesManagementPage.tsx` lists every piece of equipment that has
  supervision variables (from its hardware model) and how many are "configured" (mnemonic or
  description set); `VariableSettingsConfigModal.tsx` edits the mnemonic + description of every
  variable for one equipment in a single table/save-all form.
- `pages/addressing/` — `AddressingPage.tsx` lists equipment that has at least one ModBus or TCP/IP
  port with an "N/M ports configurés" progress count; `AddressingConfigModal.tsx` edits every
  addressable port of one equipment in a single table/save-all form (ModBus ports get one "Adresse"
  field, TCP/IP ports get VLAN/IP/Gateway/Subnet Mask).
- `pages/plans/DesignPage.tsx` — the Plans cabling-diagram editor (see Project section above for the
  feature description). Large single file: canvas rendering, drag/resize/zoom/undo, an auto-router
  for link paths, a per-API topology tree in the info panel (built from `equipment_links`, with
  ModBus bus links grouped via union-find since a bus has no single parent/child), and SVG export
  (self-contained, embeds hardware photos as base64 data URLs).
- `pages/configurations/` — `ConfigurationsLayout.tsx` tabs: Switch (`SwitchConfigPage.tsx` +
  `SwitchConfigDetailPage.tsx`) and Moxa (`MoxaConfigPage.tsx` + `MoxaConfigDetailPage.tsx`). Both
  import/list/delete config files, show a read-only detail page, and drive the same "apply to
  equipment" flow (pausing with a modal when room or, for switches, port mapping needs the user's
  input; a bulk "Update complet" button queues every row through that same flow, pausing on the
  first one that needs interactive input and resuming after).
- `pages/reporting/ReportingPage.tsx` — a configurable table over equipment + every related resource
  (catalogue, site/room, API, addressing, switch/moxa config summaries, port links, supervision
  variables): checkbox column picker grouped by category, click-to-sort, Excel-style per-column
  filter popovers (search + check/uncheck values, cascading against other active filters), CSV/xlsx
  export, and named saved views persisted via `report_configs`.
- `pages/system/` — `SystemLayout.tsx` tabs: "Base de données" (`DatabasePage.tsx` — backup
  download, restore-from-file, and a destructive "RAZ" reset) and "Import/Export"
  (`ImportExportPage.tsx`, composing `EquipmentImportExport.tsx`, `RoomsImport.tsx`,
  `ApisImportExport.tsx`, `VariablesImportExport.tsx` — each a self-contained export+import card
  following the same per-row `ImportRowResult` results-table pattern).

### Database schema
Managed entirely by hand-written SQL in `db/migrate.ts` (no migration framework). Tables:
- `users` — `username`, `first_name`, `last_name`, `email`, `phone`, `password_hash`, `role`
  constrained to `admin`/`user`.
- `device_types` — `name` (unique). E.g. "Serveur", "Switch", "Firewall", "Automate".
- `brands` — `name` (unique). E.g. "DELL", "CISCO", "HIRSCHMANN".
- `configuration_types` — `name` (unique), `configuration` (free text) — a named, reusable
  configuration profile, independent of `link_types`, attachable to a port or to a link itself.
- `hardware_models` — a catalogue model: `brand_id` FK → `brands`, `device_type_id` FK →
  `device_types`, `name` (unique per brand), `image_path`/`datasheet_path` (uploaded files),
  `config_import_enabled` (gates the Gestion des configurations import flow for this model).
- `link_types` — `name` (unique, e.g. "Fibre", "TCP/IP", "ModBus"), `color`/`stroke_width` (used to
  draw the link on Plans), `point_to_point` (whether a port may carry only one link at a time).
- `hardware_model_ports` — a port definition belonging to a hardware model: `hardware_model_id` FK
  → `hardware_models` (`ON DELETE CASCADE`), `link_type_id` FK → `link_types`,
  `configuration_type_id` FK → `configuration_types` (nullable), `label`, `region_x/y/width/height`
  (on-image hitbox in natural pixels, set by the Ports Designer).
- `hardware_model_variables` — a supervision variable definition belonging to a hardware model:
  `hardware_model_id` FK (`ON DELETE CASCADE`), `name`, `unit`, `register`.
- `hardware_model_port_aliases` — learned mapping from a config-import port name to an existing
  `hardware_model_ports` row, unique per `(hardware_model_id, source_label)`, so re-importing the
  same model's config doesn't re-ask the user to map that port name.
- `sites` — `name` (unique), `datasheet_path`.
- `zones` — `site_id` FK → `sites`, `name`; unique per `(site_id, name)`.
- `rooms` — `zone_id` FK → `zones`, `name`; unique per `(zone_id, name)`.
- `equipment` — a physical/logical piece of equipment: `room_id` FK → `rooms`, `device_type_id` FK
  → `device_types`, `hardware_model_id` FK → `hardware_models`, `api_id` FK → `apis` (nullable),
  `is_api_start_point` (marks the root of that API's Plans topology tree), `linked_equipment_id`
  FK → `equipment` (`ON DELETE SET NULL`, nullable — free-form "related equipment" link, validated
  same-API and non-self in the route layer, not in the DB), `name`.
- `equipment_links` — a port-to-port connection between two equipment: `parent_equipment_id`/
  `child_equipment_id` FK → `equipment` (`ON DELETE CASCADE`), `parent_port_id`/`child_port_id` FK
  → `hardware_model_ports`, `configuration_type_id` FK → `configuration_types` (nullable, distinct
  from the ports' own); a port can only be used by one link in either role for `point_to_point`
  link types (enforced in the route layer, not a DB unique index — see the comment in
  `equipment_links.ts`), and an equipment can't link to itself (`CHECK`).
- `equipment_port_settings` — per-equipment-instance addressing for one of its model's ports:
  `equipment_id`/`hardware_model_port_id` FK (`ON DELETE CASCADE`), `modbus_address`, `vlan`,
  `ip_address`, `gateway`, `subnet_mask`; unique per `(equipment_id, hardware_model_port_id)`.
- `equipment_variable_settings` — per-equipment-instance override of one of its model's supervision
  variables: `equipment_id`/`hardware_model_variable_id` FK (`ON DELETE CASCADE`), `mnemonic`,
  `description`; unique per `(equipment_id, hardware_model_variable_id)`.
- `apis` — `name`, `migration_date` (nullable), `completed` (bool), `doe_up_to_date` (bool).
- `design_schemas` — one Plans canvas layout per API: `api_id` FK → `apis` (`ON DELETE CASCADE`,
  unique), `layout` (JSONB — cards/paths/text blocks/zoom), `updated_at`.
- `switch_configurations` / `switch_vlans` / `switch_ports` / `switch_mrp_configs` — an imported
  HIRSCHMANN BRS30 config and its VLANs/per-port settings/MRP ring config; `raw_xml` keeps the
  original file for re-download.
- `mgate_configurations` / `mgate_serial_ports` / `mgate_slave_ids` — an imported MOXA MGate config
  and its serial ports/Modbus slave-ID ranges; `raw_cfg` (`BYTEA`) keeps the original file.
- `report_configs` — a named saved Reporting view: `column_ids`/`filters` (JSONB), `sort_column_id`,
  `sort_dir`, `only_linked` (the "only linked equipment/ports" checkbox).

## Environment files
Both `client/` and `server/` need a `.env` (copy from the adjacent `.env.example`). Key server vars:
`DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, `SEED_ADMIN_*`. Key client var: `VITE_API_URL`.
