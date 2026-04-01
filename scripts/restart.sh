#!/bin/bash
# =============================================================================
# Backlog Synthesizer — Restart Script
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Restarting Backlog Synthesizer ==="
echo ""

"$SCRIPT_DIR/stop.sh"
sleep 1
"$SCRIPT_DIR/start.sh"
