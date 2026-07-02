#!/bin/bash
# WayTale dev launcher — starts everything in one command
#
# Usage:
#   ./launch.sh              # start all services + Expo
#   ./launch.sh --pipeline   # also run content pipeline before starting
#   ./launch.sh --no-expo    # services only, no Expo (for backend/admin work)

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"

# ── flags ────────────────────────────────────────────────────────────────────
RUN_PIPELINE=false
RUN_EXPO=true
for arg in "$@"; do
  case $arg in
    --pipeline) RUN_PIPELINE=true ;;
    --no-expo)  RUN_EXPO=false ;;
  esac
done

# ── colors ───────────────────────────────────────────────────────────────────
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[0;34m'; N='\033[0m'
ok()   { echo -e "${G}✓${N}  $1"; }
info() { echo -e "${B}→${N}  $1"; }
warn() { echo -e "${Y}⚠${N}  $1"; }
fail() { echo -e "${R}✗${N}  $1"; exit 1; }

echo ""
echo -e "${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo -e "${B}  WayTale Dev Launcher${N}"
echo -e "${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo ""

# ── 1. Docker ─────────────────────────────────────────────────────────────────
info "Checking Docker..."
if ! docker info &>/dev/null 2>&1; then
  warn "Docker not running — starting Docker Desktop..."
  open -a Docker
  echo -n "   Waiting"
  until docker info &>/dev/null 2>&1; do
    echo -n "."; sleep 2
  done
  echo ""
fi
ok "Docker ready"

# ── 2. Containers ─────────────────────────────────────────────────────────────
info "Starting containers (postgres + redis)..."
cd "$ROOT"
docker-compose up -d > /dev/null 2>&1
ok "Containers started"

# ── 3. Wait for postgres ──────────────────────────────────────────────────────
info "Waiting for PostgreSQL..."
echo -n "   "
until docker exec waytale-db-1 pg_isready -U waytale &>/dev/null 2>&1; do
  echo -n "."; sleep 1
done
echo ""
ok "PostgreSQL ready"

# ── 4. Optional pipeline ──────────────────────────────────────────────────────
if [ "$RUN_PIPELINE" = true ]; then
  echo ""
  info "Running content pipeline (10 US landmarks)..."
  warn "This takes ~3 min — fetches Wikipedia + calls Claude API"
  cd "$ROOT/pipeline"
  node scripts/run-pipeline.js
  echo ""
  ok "Pipeline complete — run 'node scripts/admin-review.js' to approve content"
  echo ""
fi

# ── 5. Backend ────────────────────────────────────────────────────────────────
info "Starting backend (port 3001)..."
cd "$ROOT/backend"
node src/index.js > "$LOGS/backend.log" 2>&1 &
BACKEND_PID=$!
sleep 1
if ! kill -0 $BACKEND_PID 2>/dev/null; then
  fail "Backend failed — check $LOGS/backend.log"
fi
ok "Backend running  →  http://localhost:3001"

# ── 6. Admin dashboard ────────────────────────────────────────────────────────
info "Starting admin dashboard (port 4000)..."
cd "$ROOT/admin"
npm run dev > "$LOGS/admin.log" 2>&1 &
ADMIN_PID=$!
sleep 2
ok "Admin dashboard  →  http://localhost:4000"

# ── cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  info "Shutting down services..."
  kill $BACKEND_PID $ADMIN_PID 2>/dev/null || true
  ok "Done"
}
trap cleanup EXIT INT TERM

# ── summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo -e "  Backend   →  ${G}http://localhost:3001${N}"
echo -e "  Admin     →  ${G}http://localhost:4000${N}"
echo -e "  Logs      →  ${Y}$LOGS/${N}"
echo -e "${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo ""

if [ "$RUN_EXPO" = true ]; then
  info "Starting Expo — scan QR with Expo Go on your phone..."
  echo ""
  cd "$ROOT/app"
  npx expo start
else
  info "Services running. Press Ctrl+C to stop."
  wait
fi
