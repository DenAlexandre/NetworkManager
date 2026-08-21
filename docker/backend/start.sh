#!/bin/bash
# The postgres service's healthcheck (see docker-compose.yml) already gates
# this container's start via depends_on: condition: service_healthy, so no
# manual wait-loop is needed here — just run the (idempotent) migration + seed
# scripts, then start the API.
set -euo pipefail

echo "[backend] migration de la base..."
node dist/db/migrate.js

echo "[backend] seed des donnees de reference..."
node dist/db/seed.js

echo "[backend] demarrage du serveur..."
exec node dist/index.js
