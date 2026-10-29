#!/usr/bin/env bash
set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_ENV_FILE="$PROJECT_DIR/.env"
NODE="/root/.nvm/versions/node/v24.13.1/bin/node"
NPM="/root/.nvm/versions/node/v24.13.1/bin/npm"
SERVICE="geometry-racer"

# ─── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
ok()   { echo "[$(date '+%H:%M:%S')] ✓ $*"; }
fail() { echo "[$(date '+%H:%M:%S')] ✗ $*" >&2; exit 1; }

# ─── Load VITE_* vars from env file (if present) ──────────────────────────────
if [[ -f "$SERVER_ENV_FILE" ]]; then
    while IFS='=' read -r key value; do
        [[ "$key" =~ ^#|^[[:space:]]*$ ]] && continue   # skip comments/blank lines
        value="${value%%#*}"                              # strip inline comments
        value="${value#"${value%%[! ]*}"}"               # ltrim
        value="${value%"${value##*[! ]}"}";              # rtrim
        value="${value#[\"\']}" value="${value%[\"\']}"  # strip surrounding quotes
        [[ "$key" =~ ^VITE_ ]] && export "$key=$value"
    done < "$SERVER_ENV_FILE"
fi

# ─── Build server ─────────────────────────────────────────────────────────────
log "Building server..."
cd "$PROJECT_DIR/server"
"$NPM" run build 2>&1 | sed 's/^/  /'
ok "Server built → server/dist/"

# ─── Build client ─────────────────────────────────────────────────────────────
log "Building client... (VITE_WS_URL=${VITE_WS_URL:-<not set>})"
cd "$PROJECT_DIR/client"
"$NPM" run build 2>&1 | sed 's/^/  /'
ok "Client built → client/dist/"

# ─── Restart server service ───────────────────────────────────────────────────
log "Restarting $SERVICE service..."
systemctl restart "$SERVICE"
sleep 2

if systemctl is-active --quiet "$SERVICE"; then
    ok "Service $SERVICE is running"
else
    journalctl -u "$SERVICE" -n 20 --no-pager
    fail "Service $SERVICE failed to start"
fi

# ─── Health check ─────────────────────────────────────────────────────────────
log "Health check..."
PORT=$(grep '^SERVER_PORT=' "$SERVER_ENV_FILE" 2>/dev/null | cut -d= -f2)
PORT="${PORT:-3000}"
HEALTH=$(curl -sf "http://localhost:${PORT}/health" 2>/dev/null) || fail "Health check failed on port $PORT"
ok "Server responded: $HEALTH"

echo ""
echo "Deploy complete."
