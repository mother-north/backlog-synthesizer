#!/bin/bash
set -e

APP_DIR="$(dirname "$(dirname "$(realpath "$0")")")"
cd "$APP_DIR"

echo "=== Backlog Synthesizer (Cloud Run) ==="
echo "Port: ${PORT:-8080}"

# Start Python agents server on port 8000 (background)
echo "Starting agents server on port 8000..."
cd "$APP_DIR/agents"
/opt/venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000 &
AGENTS_PID=$!
cd "$APP_DIR"

sleep 3
if ! kill -0 $AGENTS_PID 2>/dev/null; then
  echo "WARNING: Agents server failed to start — AI processing will be unavailable"
else
  echo "Agents server running (PID $AGENTS_PID)"
fi

echo "Starting Node.js backend..."
exec node backend/dist/index.js
