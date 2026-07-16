# ── Stage 1: Build (tsc + vite only — fast) ─────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm install

COPY backend ./backend
COPY frontend ./frontend
RUN npm run build

# ── Stage 2: Runtime (FROM pre-built base — skips pip install + npm install) ─
FROM us-central1-docker.pkg.dev/backlog-synthesizer/backlog-synthesizer-rde/backlog-synthesizer-rde-base:latest

COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist
COPY backend/sql ./sql
COPY agents ./agents
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x scripts/docker-entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/bin/bash", "/app/scripts/docker-entrypoint.sh"]
