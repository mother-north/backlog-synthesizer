#!/bin/bash
# =============================================================================
# Backlog Synthesizer Deploy Script — Azure App Service (genai-rtx-eris-ui)
# Webapp:         genai-rtx-eris-ui
# Resource Group: VG-console
#
# Usage:
#   ./scripts/deploy-azure-eris-ui.sh              # interactive prompt for data transfer
#   ./scripts/deploy-azure-eris-ui.sh --with-data  # always transfer data, no prompt
#   ./scripts/deploy-azure-eris-ui.sh --code-only  # skip data transfer, no prompt
#   ./scripts/deploy-azure-eris-ui.sh --deps-only  # just restart to install new npm/pip deps
#
# Prerequisites:
#   brew install azure-cli jq
#   az login
# =============================================================================

set -e

SUBSCRIPTION_ID="2d5cb62b-9041-4f80-993f-8594515baa70"
WEBAPP_NAME="genai-rtx-eris-ui"
RESOURCE_GROUP="RG-RTX"
DB_SERVER_NAME="genai-rtx-eris-db"
DB_NAME="backlog_synthesizer_db"
DB_ADMIN_USER="bsadmin"
DB_ADMIN_PASSWORD="BacklogSynth2026!"
LOCAL_DB="backlog_synthesizer_db"
LOCAL_DB_USER="evgeny.ponomarenko"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN} Backlog Synthesizer Deploy → Azure${NC}"
echo -e "${CYAN} ${WEBAPP_NAME} / ${RESOURCE_GROUP}${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# ─── Parse args ────────────────────────────────────────────────────────────────
WITH_DATA=false
DEPS_ONLY=false
_SKIP_PROMPT=false
for arg in "$@"; do
  [[ "$arg" == "--with-data" ]] && WITH_DATA=true  && _SKIP_PROMPT=true
  [[ "$arg" == "--code-only" ]] && WITH_DATA=false && _SKIP_PROMPT=true
  [[ "$arg" == "--deps-only" ]] && DEPS_ONLY=true  && _SKIP_PROMPT=true
done

if $DEPS_ONLY; then
  echo -e " ${CYAN}Mode: DEPS ONLY (restart to install new packages)${NC}"
  echo ""

  az account set --subscription "$SUBSCRIPTION_ID" 2>/dev/null || { az login; az account set --subscription "$SUBSCRIPTION_ID"; }
  echo -e "${YELLOW}Restarting app to install dependencies...${NC}"
  az webapp restart --name "$WEBAPP_NAME" --resource-group "$RESOURCE_GROUP" --output none

  WEBAPP_URL=$(az webapp show --name "$WEBAPP_NAME" --resource-group "$RESOURCE_GROUP" --query "defaultHostName" -o tsv 2>/dev/null || echo "${WEBAPP_NAME}.azurewebsites.net")

  echo -e "${YELLOW}Waiting for app to start...${NC}"
  for i in $(seq 1 20); do
    sleep 15
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${WEBAPP_URL}/api/health" --max-time 10 2>/dev/null || echo "000")
    if [[ "$HTTP_STATUS" == "200" ]]; then
      echo -e "    ${GREEN}✓ App is up (${i}x15s)${NC}"
      break
    fi
    echo -e "    ⏳ Not ready yet (${i}/20)..."
  done

  echo ""
  echo -e "${GREEN}Done! App: https://${WEBAPP_URL}${NC}"
  exit 0
fi

if [[ "$_SKIP_PROMPT" == "false" ]]; then
  read -r -p " Transfer local PostgreSQL data to server? [y/N] " _ans
  [[ "$_ans" =~ ^[Yy]$ ]] && WITH_DATA=true
fi

if $WITH_DATA; then
  echo -e " ${YELLOW}Mode: CODE + DATA${NC}"
else
  echo -e " ${GREEN}Mode: CODE ONLY${NC}"
fi
echo ""

# ─── 0. Check prerequisites ────────────────────────────────────────────────────
echo -e "${YELLOW}[0/6] Checking prerequisites...${NC}"

if ! command -v az &>/dev/null; then
  echo -e "    ${RED}ERROR: Azure CLI not found. Install with: brew install azure-cli${NC}"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo -e "    ${RED}ERROR: jq not found. Install with: brew install jq${NC}"
  exit 1
fi

if ! az account show &>/dev/null; then
  echo -e "    ${YELLOW}Not logged in to Azure. Logging in...${NC}"
  az login
fi

az account set --subscription "$SUBSCRIPTION_ID" 2>/dev/null || {
  echo -e "    ${YELLOW}Subscription not found. Logging in again...${NC}"
  az login
  az account set --subscription "$SUBSCRIPTION_ID"
}

SUBSCRIPTION=$(az account show --query "name" -o tsv)
echo -e "    ${GREEN}✓ Azure: ${SUBSCRIPTION}${NC}"

# ─── 1. Build locally ──────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[1/6] Building locally...${NC}"
cd "$PROJECT_DIR"

npm install --quiet
npm run build
echo -e "    ${GREEN}✓ Build complete${NC}"

# ─── 2. Provision PostgreSQL (skip if exists) ─────────────────────────────────
echo ""
echo -e "${YELLOW}[2/6] Provisioning Azure PostgreSQL...${NC}"

DB_EXISTS=$(az postgres flexible-server show \
  --name "$DB_SERVER_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "name" -o tsv 2>/dev/null || echo "")

if [[ -z "$DB_EXISTS" ]]; then
  echo -e "    ${YELLOW}Creating PostgreSQL Flexible Server '${DB_SERVER_NAME}'...${NC}"
  echo -e "    ${CYAN}(this takes 3-5 minutes)${NC}"

  DB_LOCATION="eastus"
  echo -e "    ${CYAN}Region: ${DB_LOCATION}${NC}"

  az postgres flexible-server create \
    --name "$DB_SERVER_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$DB_LOCATION" \
    --admin-user "$DB_ADMIN_USER" \
    --admin-password "$DB_ADMIN_PASSWORD" \
    --sku-name "Standard_B1ms" \
    --tier "Burstable" \
    --storage-size 32 \
    --version 16 \
    --public-access "0.0.0.0" \
    --output none

  echo -e "    ${GREEN}✓ PostgreSQL server created${NC}"
else
  echo -e "    ${GREEN}✓ PostgreSQL server already exists${NC}"
fi

# Enable pgvector extension
az postgres flexible-server parameter set \
  --server-name "$DB_SERVER_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --name azure.extensions \
  --value "vector,pg_trgm" \
  --output none 2>/dev/null || true
echo -e "    ${CYAN}pgvector + pg_trgm extensions enabled${NC}"

# Ensure database exists
DB_NAME_EXISTS=$(az postgres flexible-server db show \
  --server-name "$DB_SERVER_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --database-name "$DB_NAME" \
  --query "name" -o tsv 2>/dev/null || echo "")

if [[ -z "$DB_NAME_EXISTS" ]]; then
  echo -e "    ${YELLOW}Creating database '${DB_NAME}'...${NC}"
  az postgres flexible-server db create \
    --server-name "$DB_SERVER_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --database-name "$DB_NAME" \
    --output none
  echo -e "    ${GREEN}✓ Database '${DB_NAME}' created${NC}"
else
  echo -e "    ${GREEN}✓ Database '${DB_NAME}' already exists${NC}"
fi

# Firewall rules
MY_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "")
az postgres flexible-server firewall-rule create \
  --name "$DB_SERVER_NAME" --resource-group "$RESOURCE_GROUP" \
  --rule-name "AllowAzureServices" \
  --start-ip-address "0.0.0.0" --end-ip-address "0.0.0.0" \
  --output none 2>/dev/null || true
if [[ -n "$MY_IP" ]]; then
  az postgres flexible-server firewall-rule create \
    --name "$DB_SERVER_NAME" --resource-group "$RESOURCE_GROUP" \
    --rule-name "AllowDeployMac" \
    --start-ip-address "$MY_IP" --end-ip-address "$MY_IP" \
    --output none 2>/dev/null || true
  echo -e "    ${CYAN}Firewall: allowed local Mac ($MY_IP)${NC}"
fi

DB_HOST="${DB_SERVER_NAME}.postgres.database.azure.com"
echo -e "    ${GREEN}✓ DB host: ${DB_HOST}${NC}"

# ─── 3. Configure App Settings ─────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[3/6] Configuring Azure App Settings...${NC}"

# Ensure App Service Plan exists
PLAN_NAME="genai-rtx-plan"
PLAN_EXISTS=$(az appservice plan show \
  --name "$PLAN_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "name" -o tsv 2>/dev/null || echo "")

if [[ -z "$PLAN_EXISTS" ]]; then
  echo -e "    ${YELLOW}Creating App Service Plan '${PLAN_NAME}'...${NC}"
  az appservice plan create \
    --name "$PLAN_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "eastus" \
    --sku "B2" \
    --is-linux \
    --output none
  echo -e "    ${GREEN}✓ App Service Plan created${NC}"
else
  echo -e "    ${GREEN}✓ App Service Plan already exists${NC}"
fi

# Ensure webapp exists
WEBAPP_EXISTS=$(az webapp show --name "$WEBAPP_NAME" --resource-group "$RESOURCE_GROUP" --query "name" -o tsv 2>/dev/null || echo "")
if [[ -z "$WEBAPP_EXISTS" ]]; then
  echo -e "    ${YELLOW}Creating App Service '${WEBAPP_NAME}'...${NC}"
  az webapp create \
    --name "$WEBAPP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --plan "$PLAN_NAME" \
    --runtime "NODE:22-lts" \
    --output none
  echo -e "    ${GREEN}✓ Web App created${NC}"
else
  echo -e "    ${GREEN}✓ Web App already exists${NC}"
fi

EXISTING_ACCESS_SECRET=$(az webapp config appsettings list \
  --name "$WEBAPP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[?name=='JWT_ACCESS_SECRET'].value" -o tsv 2>/dev/null || echo "")

if [[ -z "$EXISTING_ACCESS_SECRET" ]]; then
  JWT_ACCESS_SECRET=$(openssl rand -hex 32)
  JWT_REFRESH_SECRET=$(openssl rand -hex 32)
else
  JWT_ACCESS_SECRET="$EXISTING_ACCESS_SECRET"
  JWT_REFRESH_SECRET=$(az webapp config appsettings list \
    --name "$WEBAPP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "[?name=='JWT_REFRESH_SECRET'].value" -o tsv)
  echo -e "    ${CYAN}Reusing existing JWT secrets${NC}"
fi

# Get OPENAI_API_KEY from local .env (root or agents)
LOCAL_OPENAI_KEY=$(grep "^OPENAI_API_KEY=" "$PROJECT_DIR/.env" 2>/dev/null | cut -d= -f2- || \
                   grep "^OPENAI_API_KEY=" "$PROJECT_DIR/agents/.env" 2>/dev/null | cut -d= -f2- || echo "")

WEBAPP_URL=$(az webapp show \
  --name "$WEBAPP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "defaultHostName" -o tsv 2>/dev/null || echo "${WEBAPP_NAME}.azurewebsites.net")

az webapp config appsettings set \
  --name "$WEBAPP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    NODE_ENV=production \
    PORT=8080 \
    SCM_DO_BUILD_DURING_DEPLOYMENT=false \
    ENABLE_ORYX_BUILD=false \
    JWT_ACCESS_SECRET="$JWT_ACCESS_SECRET" \
    JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
    JWT_ACCESS_EXPIRY=15m \
    JWT_REFRESH_EXPIRY=7d \
    JWT_REFRESH_EXPIRY_REMEMBER=30d \
    PG_HOST="$DB_HOST" \
    PG_PORT=5432 \
    PG_DATABASE="$DB_NAME" \
    PG_USER="$DB_ADMIN_USER" \
    PG_PASSWORD="$DB_ADMIN_PASSWORD" \
    PG_SSL=true \
    OPENAI_API_KEY="$LOCAL_OPENAI_KEY" \
    AGENTS_URL="http://localhost:8000" \
    CLIENT_URL="https://${WEBAPP_URL}" \
    ADMIN_EMAIL="admin@backlog-synthesizer.com" \
    ADMIN_PASSWORD="admin" \
  --output none

echo -e "    ${GREEN}✓ App settings configured${NC}"

az webapp config set \
  --name "$WEBAPP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --startup-file "bash scripts/startup.sh" \
  --output none

echo -e "    ${GREEN}✓ Startup command: bash scripts/startup.sh${NC}"

# ─── 4. Package & Deploy ──────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[4/6] Packaging and deploying to Azure...${NC}"

cd "$PROJECT_DIR"

find . -name "._*" -delete 2>/dev/null || true
find . -name ".DS_Store" -delete 2>/dev/null || true

ZIP_FILE="/tmp/genai-rtx-eris-ui-deploy.zip"
rm -f "$ZIP_FILE"

STAGE_DIR=$(mktemp -d)
mkdir -p "$STAGE_DIR/backend" "$STAGE_DIR/frontend" "$STAGE_DIR/agents"

cp -r backend/dist "$STAGE_DIR/backend/dist"
cp -r frontend/dist "$STAGE_DIR/frontend/dist"
cp -r backend/sql "$STAGE_DIR/sql"

# Copy agents (Python)
cp -r agents/*.py "$STAGE_DIR/agents/" 2>/dev/null || true
cp -r agents/pipeline "$STAGE_DIR/agents/pipeline"
cp -r agents/tools "$STAGE_DIR/agents/tools"
cp -r agents/models "$STAGE_DIR/agents/models"
cp -r agents/eval "$STAGE_DIR/agents/eval"
cp agents/requirements.txt "$STAGE_DIR/agents/"

# Copy startup script
mkdir -p "$STAGE_DIR/scripts"
cp scripts/startup.sh "$STAGE_DIR/scripts/startup.sh"

# Root package.json (prod deps only)
python3 -c "
import json
with open('backend/package.json') as f:
    pkg = json.load(f)
pkg.get('scripts', {}).pop('build', None)
pkg.get('scripts', {}).pop('dev', None)
pkg.get('devDependencies', {}).clear()
with open('$STAGE_DIR/package.json', 'w') as f:
    json.dump(pkg, f, indent=2)
"

cd "$STAGE_DIR"
zip -r "$ZIP_FILE" . -x "*.DS_Store" -x "._*" -q
cd "$PROJECT_DIR"
rm -rf "$STAGE_DIR"

ZIP_SIZE=$(du -h "$ZIP_FILE" | cut -f1)
echo -e "    ${GREEN}✓ ZIP created: ${ZIP_SIZE}${NC}"

echo -e "    ${YELLOW}Deploying to Azure...${NC}"
KUDU_TOKEN=$(az account get-access-token --query accessToken -o tsv)
KUDU_HOST="${WEBAPP_NAME}.scm.azurewebsites.net"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://${KUDU_HOST}/api/zipdeploy" \
  -H "Authorization: Bearer $KUDU_TOKEN" \
  -H "Content-Type: application/zip" \
  --data-binary @"$ZIP_FILE" \
  --max-time 120)

if [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "202" ]]; then
  echo -e "    ${GREEN}✓ Code deployed (HTTP ${HTTP_STATUS})${NC}"
else
  echo -e "    ${YELLOW}Kudu returned HTTP ${HTTP_STATUS}, trying az cli...${NC}"
  az webapp deployment source config-zip \
    --name "$WEBAPP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --src "$ZIP_FILE" \
    --timeout 600 \
    --output none 2>/dev/null || true
  echo -e "    ${GREEN}✓ Code deployed${NC}"
fi

rm -f "$ZIP_FILE"

# ─── 5. Run DB seed ───────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[5/6] Running DB seed...${NC}"

PG_BIN=$(command -v psql 2>/dev/null || ls /opt/homebrew/opt/postgresql@*/bin/psql 2>/dev/null | sort -V | tail -1 || echo "")
if [[ -n "$PG_BIN" ]]; then
  echo -e "    ${YELLOW}Applying schema...${NC}"
  PGPASSWORD="$DB_ADMIN_PASSWORD" "$PG_BIN" \
    "postgresql://${DB_ADMIN_USER}@${DB_HOST}:5432/${DB_NAME}?sslmode=require" \
    -f "$PROJECT_DIR/backend/sql/init.sql" -q 2>&1 | grep -v "^$" | grep -v "already exists" || true
  echo -e "    ${GREEN}✓ Schema applied${NC}"
else
  echo -e "    ${YELLOW}psql not found — apply schema manually${NC}"
fi

# ─── 6. (Optional) Transfer data ──────────────────────────────────────────────
if $WITH_DATA; then
  echo ""
  echo -e "${YELLOW}[6/6] Transferring local PostgreSQL data...${NC}"

  PG_DUMP=$(command -v pg_dump 2>/dev/null || \
            ls /opt/homebrew/opt/postgresql@*/bin/pg_dump 2>/dev/null | sort -V | tail -1 || \
            echo "")
  if [[ -z "$PG_DUMP" ]]; then
    echo -e "    ${RED}ERROR: pg_dump not found${NC}"
    exit 1
  fi
  PG_CLIENT=$(dirname "$PG_DUMP")/psql

  DUMP_FILE="/tmp/eris_data_$(date +%Y%m%d_%H%M%S).sql"

  "$PG_DUMP" -U "$LOCAL_DB_USER" \
    --data-only \
    --table=users \
    --table=roles \
    --table=menu_access \
    --table=meetings \
    --table=backlog_items \
    --table=architecture_docs \
    --table=stories \
    --table=checks \
    --table=epics \
    --table=decisions \
    --table=memos \
    --table=backlog_hygiene_flags \
    --table=agent_traces \
    --table=audit_log \
    --table=kb_embeddings \
    "$LOCAL_DB" > "$DUMP_FILE"

  DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
  echo -e "    ${GREEN}✓ Dump: ${DUMP_FILE} (${DUMP_SIZE})${NC}"

  echo -e "    ${YELLOW}Truncating & restoring data on Azure DB...${NC}"
  PGPASSWORD="$DB_ADMIN_PASSWORD" "$PG_CLIENT" \
    "postgresql://${DB_ADMIN_USER}@${DB_HOST}:5432/${DB_NAME}?sslmode=require" \
    -c "TRUNCATE TABLE audit_log, agent_traces, kb_embeddings, backlog_hygiene_flags, memos, decisions, checks, stories, epics, architecture_docs, backlog_items, meetings, menu_access, users, roles RESTART IDENTITY CASCADE;" -q

  PGPASSWORD="$DB_ADMIN_PASSWORD" "$PG_CLIENT" \
    "postgresql://${DB_ADMIN_USER}@${DB_HOST}:5432/${DB_NAME}?sslmode=require" \
    -f "$DUMP_FILE" -q

  rm "$DUMP_FILE"
  echo -e "    ${GREEN}✓ Data restored${NC}"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Restarting app...${NC}"
az webapp restart --name "$WEBAPP_NAME" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null

echo -e "${YELLOW}Waiting for app to start (first boot installs Node.js ~3-5 min)...${NC}"
for i in $(seq 1 20); do
  sleep 15
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${WEBAPP_URL}/api/health" --max-time 10 2>/dev/null || echo "000")
  if [[ "$HTTP_STATUS" == "200" ]]; then
    echo -e "    ${GREEN}✓ Health check passed (${i}x15s)${NC}"
    break
  fi
  echo -e "    ⏳ Not ready yet (${i}/20)..."
done

if [[ "$HTTP_STATUS" != "200" ]]; then
  echo -e "    ${YELLOW}⚠ App still starting — check logs:${NC}"
  echo -e "    ${YELLOW}az webapp log tail --name ${WEBAPP_NAME} --resource-group ${RESOURCE_GROUP}${NC}"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN} Deploy complete!${NC}"
echo ""
echo -e " App:  ${CYAN}https://${WEBAPP_URL}${NC}"
echo " DB:   ${DB_HOST}"
echo ""
echo -e " Useful commands:"
echo -e "   Logs:    ${YELLOW}az webapp log tail --name ${WEBAPP_NAME} --resource-group ${RESOURCE_GROUP}${NC}"
echo -e "   SSH:     ${YELLOW}az webapp ssh --name ${WEBAPP_NAME} --resource-group ${RESOURCE_GROUP}${NC}"
echo -e "   Restart: ${YELLOW}az webapp restart --name ${WEBAPP_NAME} --resource-group ${RESOURCE_GROUP}${NC}"
echo -e "${GREEN}============================================${NC}"
