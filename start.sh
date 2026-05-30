#!/usr/bin/env bash
# start.sh — Build web locally, build Docker images, start the stack.
# Does NOT start the SAC migrator.
set -euo pipefail

COMPOSE="docker compose -f docker-compose-local.yml"
ROOT="$(cd "$(dirname "$0")" && pwd)"

log() { echo -e "\n\033[1;34m▶ $*\033[0m"; }
ok()  { echo -e "\033[1;32m✔ $*\033[0m"; }
err() { echo -e "\033[1;31m✖ $*\033[0m" >&2; exit 1; }

cd "$ROOT"

# ── 1. Load pnpm from zshrc (installed via nvm/fnm style setup) ──────────────
log "Loading shell environment..."
# shellcheck disable=SC1090
source ~/.zshrc 2>/dev/null || source ~/.bashrc 2>/dev/null || true
command -v pnpm >/dev/null 2>&1 || err "pnpm not found after sourcing shell. Check PATH."
ok "pnpm $(pnpm --version)"

# ── 2. Build web app ──────────────────────────────────────────────────────────
log "Building web app (pnpm turbo build)..."
pnpm turbo build --filter=web... --filter=admin...
ok "Web + Admin apps built"

# ── 3. Build Docker images ────────────────────────────────────────────────────
log "Building Docker images (web, admin, api-ts, proxy)..."
$COMPOSE build web admin api-ts proxy
ok "Docker images built"

# ── 4. Start infrastructure (DB + Redis) ─────────────────────────────────────
log "Starting infrastructure services..."
$COMPOSE up -d plane-db plane-redis
echo "Waiting 5s for Postgres to be ready..."
sleep 5
ok "Infrastructure started"

# ── 5. Run Prisma db push ─────────────────────────────────────────────────────
log "Running database migrations (prisma db push)..."
$COMPOSE run --rm db-migrate
ok "Database schema synced"

# ── 6. Run seeder (idempotent) ────────────────────────────────────────────────
log "Running seeder (admin user + workspace)..."
$COMPOSE run --rm seeder
ok "Seed complete"

# ── 7. Start all app services ────────────────────────────────────────────────
log "Starting app services (api-ts, web, admin, proxy)..."
$COMPOSE up -d api-ts web admin proxy
ok "Stack is up"

# ── 8. Health check ───────────────────────────────────────────────────────────
log "Health check..."
sleep 4
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/v1/health/)
if [ "$HTTP" = "200" ]; then
  ok "API responding at http://localhost/api/v1/health/ ($HTTP)"
else
  err "API health check failed (HTTP $HTTP). Check: $COMPOSE logs api-ts"
fi

echo ""
echo "┌────────────────────────────────────────────────────────┐"
echo "│  Stack running at http://localhost                     │"
echo "│  Admin god-mode: http://localhost/god-mode/            │"
echo "│  API Swagger:    http://localhost/api/v1/schema        │"
echo "│                                                        │"
echo "│  Credentials: admin@plane.so / admin                  │"
echo "│                                                        │"
echo "│  SAC Migration (run manually when needed):            │"
echo "│  docker compose -f docker-compose-local.yml           │"
echo "│    run --rm sac-migrator                              │"
echo "└────────────────────────────────────────────────────────┘"
