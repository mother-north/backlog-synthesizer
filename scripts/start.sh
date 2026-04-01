#!/bin/bash
# =============================================================================
# Backlog Synthesizer — Start Script
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=== Starting Backlog Synthesizer ==="
echo ""

# Check if PostgreSQL is running
if ! /opt/homebrew/opt/postgresql@16/bin/pg_isready -q 2>/dev/null; then
    echo "Starting PostgreSQL..."
    brew services start postgresql@16
    sleep 2
fi

# Check if ports are already in use
for PORT in 3006 5176 8000; do
    if lsof -ti:$PORT > /dev/null 2>&1; then
        echo "Warning: Port $PORT is already in use. Run ./scripts/stop.sh first."
        exit 1
    fi
done

echo "Starting services..."
npm run dev

echo ""
echo "=== Services Started ==="
echo "  Frontend: http://localhost:5176"
echo "  Backend:  http://localhost:3006"
echo "  Agents:   http://localhost:8000"
echo ""
echo "  Login: admin@backlog-synthesizer.com / admin"
