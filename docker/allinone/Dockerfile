# All-in-one image: builds the client + server, then bundles them with PostgreSQL,
# nginx and supervisord so the whole app runs from a single container. This is
# independent of the day-to-day dev workflow (scripts/start-db.ps1 + run-dev.ps1),
# which keeps using the standalone "networkmanager-db" container.

########################
# Base: node + any corporate/proxy root CA dropped in docker/allinone/certs/
# (needed behind an SSL-inspecting proxy, e.g. Zscaler, that re-signs traffic to
# hosts like nodejs.org/github's release CDN with a CA the container doesn't
# trust by default — npm's own registry is typically unaffected). No-op if the
# certs/ directory holds no *.crt file.
########################
FROM node:20-bookworm AS base
COPY docker/allinone/certs/ /usr/local/share/ca-certificates/
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

########################
# Client build (Vite)
########################
FROM base AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# Frontend and API are served from the same nginx origin in this image, so a
# relative /api path is baked into the build instead of an absolute host:port.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

########################
# Server build (tsc)
########################
FROM base AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

########################
# Server production dependencies only
########################
FROM base AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

########################
# Final image
########################
FROM base

RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql nginx supervisor && \
    rm -rf /var/lib/apt/lists/* && \
    PG_BIN_DIR="$(dirname "$(find /usr/lib/postgresql -maxdepth 3 -name initdb | head -n1)")" && \
    ln -s "$PG_BIN_DIR"/* /usr/local/bin/ && \
    mkdir -p /var/lib/postgresql/data /var/run/postgresql && \
    chown -R postgres:postgres /var/lib/postgresql/data /var/run/postgresql

WORKDIR /app/server
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY --from=server-build /app/server/dist ./dist
COPY server/package.json ./package.json
RUN mkdir -p /app/server/uploads

COPY --from=client-build /app/client/dist /usr/share/nginx/html

COPY docker/allinone/nginx.conf /etc/nginx/nginx.conf
COPY docker/allinone/supervisord.conf /etc/supervisor/conf.d/networkmanager.conf
COPY docker/allinone/start-postgres.sh /app/docker/start-postgres.sh
COPY docker/allinone/start-backend.sh /app/docker/start-backend.sh
RUN chmod +x /app/docker/start-postgres.sh /app/docker/start-backend.sh

ENV PORT=4000 \
    DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/networkmanager \
    CLIENT_ORIGIN=http://localhost:8080

EXPOSE 80

VOLUME ["/var/lib/postgresql/data", "/app/server/uploads"]

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
