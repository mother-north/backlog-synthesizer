# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm install

COPY backend ./backend
COPY frontend ./frontend
RUN npm run build

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:22-slim
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python venv (avoids PEP 668 system-package restrictions)
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python deps
COPY agents/requirements.txt ./agents/requirements.txt
RUN pip install --no-cache-dir -r agents/requirements.txt

# Install Node production deps
COPY backend/package.json ./package.json
RUN npm install --omit=dev

# Copy built artifacts
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist
COPY backend/sql ./sql
COPY agents ./agents
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x scripts/docker-entrypoint.sh

EXPOSE 8080
CMD ["bash", "scripts/docker-entrypoint.sh"]
