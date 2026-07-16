#!/bin/bash
# =============================================================================
# Backlog Synthesizer Deploy Script — Google Cloud Run
# Service:        backlog-synthesizer-rde
# Project:        backlog-synthesizer
# Region:         us-central1
#
# Usage:
#   ./scripts/deploy-gcp.sh              # full deploy (infra + code)
#   ./scripts/deploy-gcp.sh --code-only  # skip infra, redeploy code only
#   ./scripts/deploy-gcp.sh --schema     # apply DB schema only
#
# Prerequisites:
#   brew install google-cloud-sdk docker
#   gcloud auth login
#   gcloud auth configure-docker us-central1-docker.pkg.dev
# =============================================================================

set -e

PROJECT_ID="backlog-synthesizer"
REGION="us-central1"
SERVICE_NAME="backlog-synthesizer-rde"
DB_INSTANCE="backlog-synthesizer-rde-db"
DB_NAME="backlog_synthesizer_db"
DB_USER="bsadmin"
DB_PASSWORD="BacklogSynth2026!"
REGISTRY="us-central1-docker.pkg.dev"
REPO_NAME="backlog-synthesizer-rde"
IMAGE="${REGISTRY}/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN} Backlog Synthesizer Deploy → GCP Cloud Run${NC}"
echo -e "${CYAN} ${SERVICE_NAME} / ${PROJECT_ID} / ${REGION}${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# ─── Parse args ────────────────────────────────────────────────────────────────
CODE_ONLY=false
SCHEMA_ONLY=false
for arg in "$@"; do
  [[ "$arg" == "--code-only" ]] && CODE_ONLY=true
  [[ "$arg" == "--schema"    ]] && SCHEMA_ONLY=true
done

# ─── 0. Prerequisites ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[0/7] Checking prerequisites...${NC}"

if ! command -v gcloud &>/dev/null; then
  echo -e "    ${RED}ERROR: gcloud not found.${NC}"
  echo -e "    ${RED}Install: brew install google-cloud-sdk${NC}"
  exit 1
fi
if ! command -v docker &>/dev/null; then
  echo -e "    ${RED}ERROR: Docker not found. Install Docker Desktop.${NC}"
  exit 1
fi

gcloud config set project "$PROJECT_ID" --quiet 2>/dev/null || {
  echo -e "    ${YELLOW}Project not set. Running gcloud auth login...${NC}"
  gcloud auth login
  gcloud config set project "$PROJECT_ID" --quiet
}

ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null)
echo -e "    ${GREEN}✓ Project: ${ACTIVE_PROJECT}${NC}"

if $SCHEMA_ONLY; then
  echo ""
  echo -e "${YELLOW}[schema] Applying DB schema...${NC}"
  _apply_schema() {
    PG_BIN=$(command -v psql 2>/dev/null || ls /opt/homebrew/opt/postgresql@*/bin/psql 2>/dev/null | sort -V | tail -1 || echo "")
    if [[ -z "$PG_BIN" ]]; then
      echo -e "    ${RED}psql not found. Install with: brew install postgresql${NC}"
      exit 1
    fi
    DB_IP=$(gcloud sql instances describe "$DB_INSTANCE" \
      --project="$PROJECT_ID" \
      --format="value(ipAddresses[0].ipAddress)" 2>/dev/null || echo "")
    if [[ -z "$DB_IP" ]]; then
      echo -e "    ${RED}DB instance not found: ${DB_INSTANCE}${NC}"
      exit 1
    fi
    MY_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "")
    if [[ -n "$MY_IP" ]]; then
      gcloud sql instances patch "$DB_INSTANCE" \
        --authorized-networks="$MY_IP/32" \
        --project="$PROJECT_ID" --quiet 2>/dev/null || true
      sleep 5
    fi
    PGPASSWORD="$DB_PASSWORD" "$PG_BIN" \
      "postgresql://${DB_USER}@${DB_IP}:5432/${DB_NAME}?sslmode=require" \
      -f "$PROJECT_DIR/backend/sql/init.sql" -q 2>&1 | grep -v "^$" | grep -v "already exists" || true
    echo -e "    ${GREEN}✓ Schema applied${NC}"
  }
  _apply_schema
  exit 0
fi

# ─── 1. Enable APIs ────────────────────────────────────────────────────────────
if ! $CODE_ONLY; then
  echo ""
  echo -e "${YELLOW}[1/7] Enabling GCP APIs...${NC}"
  gcloud services enable \
    run.googleapis.com \
    sqladmin.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    --project="$PROJECT_ID" --quiet
  echo -e "    ${GREEN}✓ APIs enabled${NC}"
else
  echo -e "${CYAN}[1/7] Skipping API enable (--code-only)${NC}"
fi

# ─── 2. Provision Infrastructure ───────────────────────────────────────────────
if ! $CODE_ONLY; then
  echo ""
  echo -e "${YELLOW}[2/7] Provisioning infrastructure...${NC}"

  # Artifact Registry repo
  REPO_EXISTS=$(gcloud artifacts repositories describe "$REPO_NAME" \
    --location="$REGION" --project="$PROJECT_ID" --format="value(name)" 2>/dev/null || echo "")
  if [[ -z "$REPO_EXISTS" ]]; then
    echo -e "    ${YELLOW}Creating Artifact Registry repo '${REPO_NAME}'...${NC}"
    gcloud artifacts repositories create "$REPO_NAME" \
      --repository-format=docker \
      --location="$REGION" \
      --project="$PROJECT_ID" --quiet
    echo -e "    ${GREEN}✓ Artifact Registry repo created${NC}"
  else
    echo -e "    ${GREEN}✓ Artifact Registry repo exists${NC}"
  fi

  # Cloud SQL PostgreSQL
  DB_EXISTS=$(gcloud sql instances describe "$DB_INSTANCE" \
    --project="$PROJECT_ID" --format="value(name)" 2>/dev/null || echo "")
  if [[ -z "$DB_EXISTS" ]]; then
    echo -e "    ${YELLOW}Creating Cloud SQL instance '${DB_INSTANCE}' (this takes ~5 min)...${NC}"
    gcloud sql instances create "$DB_INSTANCE" \
      --database-version=POSTGRES_16 \
      --tier=db-f1-micro \
      --region="$REGION" \
      --project="$PROJECT_ID" \
      --database-flags=cloudsql.enable_pgvector=on \
      --storage-type=SSD \
      --storage-size=10GB \
      --backup \
      --quiet
    echo -e "    ${GREEN}✓ Cloud SQL instance created${NC}"
  else
    echo -e "    ${GREEN}✓ Cloud SQL instance exists${NC}"
  fi

  # Set postgres superuser password (needed for first-time setup)
  gcloud sql users set-password postgres \
    --instance="$DB_INSTANCE" \
    --password="$DB_PASSWORD" \
    --project="$PROJECT_ID" --quiet 2>/dev/null || true

  # Create app DB user
  DB_USER_EXISTS=$(gcloud sql users list \
    --instance="$DB_INSTANCE" \
    --project="$PROJECT_ID" \
    --filter="name=$DB_USER" --format="value(name)" 2>/dev/null || echo "")
  if [[ -z "$DB_USER_EXISTS" ]]; then
    echo -e "    ${YELLOW}Creating DB user '${DB_USER}'...${NC}"
    gcloud sql users create "$DB_USER" \
      --instance="$DB_INSTANCE" \
      --password="$DB_PASSWORD" \
      --project="$PROJECT_ID" --quiet
    echo -e "    ${GREEN}✓ DB user created${NC}"
  else
    echo -e "    ${GREEN}✓ DB user exists${NC}"
  fi

  # Create database
  DB_NAME_EXISTS=$(gcloud sql databases describe "$DB_NAME" \
    --instance="$DB_INSTANCE" \
    --project="$PROJECT_ID" --format="value(name)" 2>/dev/null || echo "")
  if [[ -z "$DB_NAME_EXISTS" ]]; then
    echo -e "    ${YELLOW}Creating database '${DB_NAME}'...${NC}"
    gcloud sql databases create "$DB_NAME" \
      --instance="$DB_INSTANCE" \
      --project="$PROJECT_ID" --quiet
    echo -e "    ${GREEN}✓ Database created${NC}"
  else
    echo -e "    ${GREEN}✓ Database exists${NC}"
  fi

  echo -e "    ${GREEN}✓ Infrastructure ready${NC}"
else
  echo -e "${CYAN}[2/7] Skipping infra (--code-only)${NC}"
fi

# ─── 3. Build Docker image ─────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[3/7] Building Docker image...${NC}"
cd "$PROJECT_DIR"

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet 2>/dev/null
docker build -t "${IMAGE}:latest" .
echo -e "    ${GREEN}✓ Docker image built${NC}"

# ─── 4. Push image ─────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[4/7] Pushing image to Artifact Registry...${NC}"
docker push "${IMAGE}:latest"
echo -e "    ${GREEN}✓ Image pushed${NC}"

# ─── 5. Deploy to Cloud Run ────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[5/7] Deploying to Cloud Run...${NC}"

LOCAL_OPENAI_KEY=$(grep "^OPENAI_API_KEY=" "$PROJECT_DIR/.env" 2>/dev/null | cut -d= -f2- || \
                   grep "^OPENAI_API_KEY=" "$PROJECT_DIR/agents/.env" 2>/dev/null | cut -d= -f2- || echo "")

DB_CONNECTION="${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${DB_CONNECTION}"

EXISTING_ACCESS_SECRET=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format="value(spec.template.spec.containers[0].env[?name=='JWT_ACCESS_SECRET'].value)" 2>/dev/null || echo "")

if [[ -z "$EXISTING_ACCESS_SECRET" ]]; then
  JWT_ACCESS_SECRET=$(openssl rand -hex 32)
  JWT_REFRESH_SECRET=$(openssl rand -hex 32)
else
  JWT_ACCESS_SECRET="$EXISTING_ACCESS_SECRET"
  JWT_REFRESH_SECRET=$(gcloud run services describe "$SERVICE_NAME" \
    --region="$REGION" --project="$PROJECT_ID" \
    --format="value(spec.template.spec.containers[0].env[?name=='JWT_REFRESH_SECRET'].value)" 2>/dev/null || openssl rand -hex 32)
  echo -e "    ${CYAN}Reusing existing JWT secrets${NC}"
fi

gcloud run deploy "$SERVICE_NAME" \
  --image="${IMAGE}:latest" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=2Gi \
  --cpu=1 \
  --timeout=120 \
  --concurrency=80 \
  --min-instances=0 \
  --max-instances=5 \
  --add-cloudsql-instances="$DB_CONNECTION" \
  --set-env-vars="\
NODE_ENV=production,\
PORT=8080,\
DATABASE_URL=${DATABASE_URL},\
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET},\
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET},\
JWT_ACCESS_EXPIRY=15m,\
JWT_REFRESH_EXPIRY=7d,\
JWT_REFRESH_EXPIRY_REMEMBER=30d,\
OPENAI_API_KEY=${LOCAL_OPENAI_KEY},\
AGENTS_URL=http://localhost:8000,\
ADMIN_EMAIL=admin@backlog-synthesizer.com,\
ADMIN_PASSWORD=admin" \
  --quiet

echo -e "    ${GREEN}✓ Deployed to Cloud Run${NC}"

# ─── 6. Apply DB schema ────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[6/7] Applying DB schema...${NC}"

PG_BIN=$(command -v psql 2>/dev/null || ls /opt/homebrew/opt/postgresql@*/bin/psql 2>/dev/null | sort -V | tail -1 || echo "")
if [[ -n "$PG_BIN" ]]; then
  DB_IP=$(gcloud sql instances describe "$DB_INSTANCE" \
    --project="$PROJECT_ID" \
    --format="value(ipAddresses[0].ipAddress)" 2>/dev/null || echo "")

  if [[ -n "$DB_IP" ]]; then
    MY_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "")
    if [[ -n "$MY_IP" ]]; then
      gcloud sql instances patch "$DB_INSTANCE" \
        --authorized-networks="${MY_IP}/32" \
        --project="$PROJECT_ID" --quiet 2>/dev/null || true
      echo -e "    ${CYAN}Firewall: allowed ${MY_IP}${NC}"
      sleep 5
    fi

    PGPASSWORD="$DB_PASSWORD" "$PG_BIN" \
      "postgresql://${DB_USER}@${DB_IP}:5432/${DB_NAME}?sslmode=require" \
      -f "$PROJECT_DIR/backend/sql/init.sql" -q 2>&1 | grep -v "^$" | grep -v "already exists" || true
    echo -e "    ${GREEN}✓ Schema applied${NC}"
  else
    echo -e "    ${YELLOW}Could not get DB IP — apply schema manually:${NC}"
    echo -e "    ${YELLOW}./scripts/deploy-gcp.sh --schema${NC}"
  fi
else
  echo -e "    ${YELLOW}psql not found — apply schema manually:${NC}"
  echo -e "    ${YELLOW}brew install postgresql && ./scripts/deploy-gcp.sh --schema${NC}"
fi

# ─── 7. Health check ──────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[7/7] Waiting for service to be healthy...${NC}"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format="value(status.url)" 2>/dev/null || echo "")

# Update CLIENT_URL now that we know the URL
if [[ -n "$SERVICE_URL" ]]; then
  gcloud run services update "$SERVICE_NAME" \
    --region="$REGION" --project="$PROJECT_ID" \
    --update-env-vars="CLIENT_URL=${SERVICE_URL}" \
    --quiet 2>/dev/null || true
fi

for i in $(seq 1 12); do
  sleep 10
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/api/health" --max-time 10 2>/dev/null || echo "000")
  if [[ "$HTTP_STATUS" == "200" ]]; then
    echo -e "    ${GREEN}✓ Health check passed (${i}x10s)${NC}"
    break
  fi
  echo -e "    ⏳ Not ready yet (${i}/12, HTTP ${HTTP_STATUS})..."
done

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN} Deploy complete!${NC}"
echo ""
echo -e " App:  ${CYAN}${SERVICE_URL}${NC}"
echo " DB:   ${DB_INSTANCE} (Cloud SQL PostgreSQL 16)"
echo ""
echo -e " Useful commands:"
echo -e "   Logs:    ${YELLOW}gcloud run services logs read ${SERVICE_NAME} --region=${REGION} --project=${PROJECT_ID}${NC}"
echo -e "   Redeploy:${YELLOW}./scripts/deploy-gcp.sh --code-only${NC}"
echo -e "   Schema:  ${YELLOW}./scripts/deploy-gcp.sh --schema${NC}"
echo -e "${GREEN}============================================${NC}"
