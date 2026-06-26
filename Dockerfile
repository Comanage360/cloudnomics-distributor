# syntax=docker/dockerfile:1
# Single-service image: builds the Vue SPA and the Express API, then serves the
# SPA from the API's own origin (Cloud Run). Build context is the repo root.

# --- 1. Build the web SPA ---
FROM node:20-slim AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
# Same-origin in prod: empty API base means the SPA calls /api on its own host.
ENV VITE_API_URL=""
RUN npm run build

# --- 2. Build the server (TypeScript -> dist) ---
FROM node:20-slim AS server-build
WORKDIR /srv
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# --- 3. Slim production runtime ---
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm ci --omit=dev
# Compiled server, runtime DB assets (schema/seed/pricelist), brand assets, and the built SPA.
COPY --from=server-build /srv/dist ./dist
COPY server/db ./db
COPY server/assets ./assets
COPY --from=web /web/dist ./web-dist
ENV WEB_DIST=/app/web-dist
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]
