#!/bin/bash
# Azure App Service startup script (Python runtime)
# Starts both the FastAPI agents server and Node.js backend

APP_DIR="$(dirname "$(dirname "$(realpath "$0")")")"
cd "$APP_DIR"

echo "=== Backlog Synthesizer Startup ==="
echo "App dir: $APP_DIR"

# 1. Install Python dependencies
if ! python3 -c "import uvicorn" 2>/dev/null; then
  echo "Installing Python dependencies..."
  pip install -r agents/requirements.txt 2>&1 | tail -5
  echo "Python dependencies installed"
else
  echo "Python dependencies OK"
fi

# 2. Get Node.js — try multiple locations
NODE_BIN=""
for p in /usr/local/bin/node /usr/bin/node /opt/node/bin/node; do
  if [ -x "$p" ]; then NODE_BIN="$p"; break; fi
done

if [ -z "$NODE_BIN" ]; then
  echo "Node.js not found, installing..."
  curl -fsSL https://nodejs.org/dist/v22.20.0/node-v22.20.0-linux-x64.tar.xz -o /tmp/node.tar.xz
  mkdir -p /opt/node
  tar xf /tmp/node.tar.xz -C /opt/node --strip-components=1
  rm /tmp/node.tar.xz
  NODE_BIN="/opt/node/bin/node"
  export PATH="/opt/node/bin:$PATH"
  echo "Node.js installed: $($NODE_BIN --version)"
else
  echo "Node.js: $($NODE_BIN --version)"
fi

NPM_BIN="$(dirname "$NODE_BIN")/npm"

# 3. Install npm dependencies
if [ ! -d "node_modules/express" ]; then
  echo "Installing npm dependencies..."
  "$NPM_BIN" install --omit=dev 2>&1 | tail -3
  echo "npm dependencies installed"
else
  echo "npm dependencies OK"
fi

# 4. Start agents server (FastAPI) in background
echo "Starting agents server on port 8000..."
cd agents
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
cd "$APP_DIR"

sleep 2

# 5. Start Node.js backend on PORT (8080 on Azure)
echo "Starting Node.js backend on port ${PORT:-8080}..."
exec "$NODE_BIN" backend/dist/index.js
