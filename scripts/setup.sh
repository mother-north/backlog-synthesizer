#!/bin/bash
# =============================================================================
# Backlog Synthesizer — Local Setup
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "============================================"
echo " Backlog Synthesizer — Setup"
echo "============================================"
echo ""

# 1. Create database
echo "[1/5] Setting up PostgreSQL database..."
PSQL=$(command -v psql 2>/dev/null || ls /opt/homebrew/opt/postgresql@*/bin/psql 2>/dev/null | sort -V | tail -1 || echo "")
if [[ -z "$PSQL" ]]; then
  echo "    ERROR: psql not found"
  exit 1
fi

DB_NAME="backlog_synthesizer_db"
DB_EXISTS=$("$PSQL" -h localhost -U "$USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "")
if [[ "$DB_EXISTS" != "1" ]]; then
  "$PSQL" -h localhost -U "$USER" -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null
  echo "    ✓ Database '$DB_NAME' created"
else
  echo "    ✓ Database '$DB_NAME' already exists"
fi

# Enable pgvector
"$PSQL" -h localhost -U "$USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector;" -q 2>/dev/null
"$PSQL" -h localhost -U "$USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" -q 2>/dev/null
echo "    ✓ Extensions enabled (vector, pg_trgm)"

# 2. Apply schema
echo ""
echo "[2/5] Applying database schema..."
"$PSQL" -h localhost -U "$USER" -d "$DB_NAME" -f "$PROJECT_DIR/backend/sql/init.sql" -q 2>&1 | grep -v "^$" | grep -v "already exists" || true
echo "    ✓ Schema applied"

# 3. Create .env if not exists
echo ""
echo "[3/5] Setting up environment..."
if [[ ! -f "$PROJECT_DIR/backend/.env" ]]; then
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/backend/.env"
  # Generate JWT secrets
  ACCESS_SECRET=$(openssl rand -hex 32)
  REFRESH_SECRET=$(openssl rand -hex 32)
  sed -i '' "s/your_access_secret_here/$ACCESS_SECRET/" "$PROJECT_DIR/backend/.env"
  sed -i '' "s/your_refresh_secret_here/$REFRESH_SECRET/" "$PROJECT_DIR/backend/.env"
  sed -i '' "s/PG_USER=.*/PG_USER=$USER/" "$PROJECT_DIR/backend/.env"
  echo "    ✓ backend/.env created — add your OPENAI_API_KEY"
else
  echo "    ✓ backend/.env already exists"
fi

if [[ ! -f "$PROJECT_DIR/agents/.env" ]]; then
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/agents/.env"
  sed -i '' "s/PG_USER=.*/PG_USER=$USER/" "$PROJECT_DIR/agents/.env"
  echo "    ✓ agents/.env created — add your OPENAI_API_KEY"
else
  echo "    ✓ agents/.env already exists"
fi

# 4. Install Node dependencies
echo ""
echo "[4/5] Installing Node.js dependencies..."
cd "$PROJECT_DIR"
npm install --quiet
echo "    ✓ Node dependencies installed"

# 5. Install Python dependencies
echo ""
echo "[5/5] Installing Python dependencies..."
cd "$PROJECT_DIR/agents"
PYTHON=$(command -v python3.13 2>/dev/null || command -v python3.11 2>/dev/null || command -v python3 2>/dev/null)
$PYTHON -m pip install -r requirements.txt --quiet
echo "    ✓ Python dependencies installed"

# 6. Seed admin user
echo ""
echo "Seeding admin user..."
cd "$PROJECT_DIR"
npx tsx backend/src/seed.ts 2>&1 | tail -3
echo "    ✓ Setup complete"

echo ""
echo "============================================"
echo " Setup complete!"
echo ""
echo " Start dev servers:  npm run dev"
echo " Frontend:           http://localhost:5176"
echo " Backend API:        http://localhost:3006"
echo " Agents API:         http://localhost:8000"
echo " Login:              admin@backlog-synthesizer.com / admin"
echo "============================================"
