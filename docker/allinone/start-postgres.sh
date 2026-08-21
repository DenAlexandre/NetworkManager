#!/bin/bash
# Runs as the "postgres" OS user (see supervisord.conf). Initializes the data
# directory on first boot (PGDATA is a volume, so this only happens once), then
# always hands off to `postgres` in the foreground so supervisord can supervise it.
set -euo pipefail

PGDATA=/var/lib/postgresql/data
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-networkmanager}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[postgres] initialisation du repertoire de donnees..."
  echo "$POSTGRES_PASSWORD" > /tmp/pgpass
  # Local (unix socket) connections are trusted since only processes inside this
  # same container can reach that socket; TCP connections (the backend's
  # DATABASE_URL, over 127.0.0.1) still require the password.
  initdb -D "$PGDATA" --username=postgres --pwfile=/tmp/pgpass --auth-local=trust --auth-host=scram-sha-256
  rm -f /tmp/pgpass

  echo "[postgres] creation de la base '$POSTGRES_DB'..."
  pg_ctl -D "$PGDATA" -o "-c listen_addresses=''" -w start
  createdb -U postgres "$POSTGRES_DB"
  pg_ctl -D "$PGDATA" -m fast -w stop
fi

exec postgres -D "$PGDATA" -c listen_addresses='*'
