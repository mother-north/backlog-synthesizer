#!/bin/bash
# =============================================================================
# Backlog Synthesizer — Stop Script
# =============================================================================

echo "=== Stopping Backlog Synthesizer ==="

kill_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "Stopping process on port $port..."
        echo "$pids" | xargs kill -TERM 2>/dev/null || true
        sleep 1
        pids=$(lsof -ti:$port 2>/dev/null)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -KILL 2>/dev/null || true
        fi
        echo "  Port $port freed."
    else
        echo "  Nothing running on port $port."
    fi
}

kill_port 3006
kill_port 5176
kill_port 8000

echo ""
echo "=== Backlog Synthesizer Stopped ==="
