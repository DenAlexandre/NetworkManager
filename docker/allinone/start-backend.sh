#!/bin/bash
# Waits for the postgres process (managed by the same supervisord) to accept
# connections, runs the (idempotent) migration + seed scripts, then starts the API.
set -euo pipefail

cd /app/server

echo "[backend] attente de PostgreSQL..."
until pg_isready -h 127.0.0.1 -p 5432 -U postgres >/dev/null 2>&1; do
  sleep 1
done

echo "[backend] migration de la base..."
node dist/db/migrate.js

echo "[backend] seed des donnees de reference..."
node dist/db/seed.js

echo "[backend] demarrage du serveur..."
exec node dist/index.js
