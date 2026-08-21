# Server image for the 3-container compose (postgres / backend / frontend).
# Independent of the day-to-day dev workflow (scripts/start-db.ps1 + run-dev.ps1
# + the "networkmanager-db" container), which is unaffected by this file.

########################
# Base: node + any corporate/proxy root CA dropped in docker/certs/ (needed
# behind an SSL-inspecting proxy, e.g. Zscaler, that re-signs traffic to hosts
# like nodejs.org/github's release CDN with a CA the container doesn't trust by
# default — npm's own registry is typically unaffected). No-op if that
# directory holds no *.crt file. See docker/certs/README.md.
########################
FROM node:20-bookworm AS base
COPY docker/certs/ /usr/local/share/ca-certificates/
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

########################
# Build (tsc)
########################
FROM base AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

########################
# Production dependencies only
########################
FROM base AS deps
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

########################
# Final image
########################
FROM base
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server/package.json ./package.json
COPY docker/backend/start.sh ./start.sh
RUN chmod +x ./start.sh && mkdir -p /app/uploads

EXPOSE 4000
VOLUME ["/app/uploads"]

CMD ["./start.sh"]
