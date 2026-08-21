# Initial database snapshot

`01-init.sql` is a `pg_dump` of the full `networkmanager` database (schema +
data: catalogue reference data, roles/permissions, admin + demo accounts).
The official `postgres` image runs every `*.sql` file in this directory
**once**, only when its data volume is empty (a fresh `docker compose up`, or
after `./scripts/run-docker.ps1 -Down -Wipe`) — it's a no-op on an
already-initialized volume.

The backend's `docker/backend/start.sh` still runs the normal (idempotent)
`migrate.js` + `seed.js` on every start on top of this snapshot: `migrate.js`
brings the schema forward if it's changed since the snapshot was taken, and
`seed.js` re-syncs the admin account's password from `.env`'s
`SEED_ADMIN_PASSWORD`/`SEED_ADMIN_*` (and the reference catalogue) regardless
of what's in the snapshot.

To refresh the snapshot with the current state of the running `postgres`
container:

```bash
docker exec networkmanager-postgres pg_dump -U postgres -d networkmanager --no-owner --no-privileges > docker/postgres-init/01-init.sql
```
