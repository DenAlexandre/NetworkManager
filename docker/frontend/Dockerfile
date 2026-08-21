# Client image for the 3-container compose (postgres / backend / frontend).

########################
# Base: node + any corporate/proxy root CA dropped in docker/certs/ (same
# rationale as docker/backend/Dockerfile — needed here since client/package.json
# pulls xlsx directly from cdn.sheetjs.com). No-op if no *.crt is present.
########################
FROM node:20-bookworm AS base
COPY docker/certs/ /usr/local/share/ca-certificates/
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

########################
# Build (Vite)
########################
FROM base AS build
WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# The backend lives in a separate container reachable only from nginx (via the
# compose network), so the browser talks to it through this same nginx origin —
# a relative /api path is baked into the build instead of an absolute host:port.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

########################
# Final image: static files served by nginx, proxying /api and /uploads to
# the backend container
########################
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/frontend/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
