#!/usr/bin/env bash
# start.sh — Build web locally, build Docker images, start the stack.
# Does NOT start the SAC migrator.
#
# Usage:
#   ./start.sh            Start (or restart) the stack, keeping the database.
#   ./start.sh --reset    Wipe the database volume and start completely fresh.
#                         (alias: --fresh, -r). After a reset you must re-run the
#                         SAC migrator to recreate project data.
#
# Order of operations: build → (optional reset) → bring ALL containers up →
# wait for Postgres → run migrations → run seeder. The app containers come up
# first; migrations run only after everything is up.
set -euo pipefail

COMPOSE="docker compose -f docker-compose-local.yml"
ROOT="$(cd "$(dirname "$0")" && pwd)"

# Long-running services (everything except the one-shot db-migrate/seeder/sac-migrator
# and chat-migrate). chat-backend is listed so its image is rebuilt + recreated here,
# instead of silently coming up from a stale cached image as a proxy dependency.
APP_SERVICES="plane-db plane-redis plane-minio api-ts web admin proxy chat-backend"

RESET=false
for arg in "$@"; do
  case "$arg" in
    --reset|--fresh|-r) RESET=true ;;
    *) ;;
  esac
done

log() { echo -e "\n\033[1;34m▶ $*\033[0m"; }
ok()  { echo -e "\033[1;32m✔ $*\033[0m"; }
err() { echo -e "\033[1;31m✖ $*\033[0m" >&2; exit 1; }

cd "$ROOT"

# ── 1. Load pnpm ────────────────────────────────────────────────────────────────
log "Loading shell environment..."
export PATH="$HOME/.local/share/pnpm:$PATH"
command -v pnpm >/dev/null 2>&1 || err "pnpm not found after sourcing shell. Check PATH."
ok "pnpm $(pnpm --version)"

# ── 2. Build web app ──────────────────────────────────────────────────────────
log "Building web app (pnpm turbo build)..."
pnpm turbo build --filter=web... --filter=admin...
ok "Web + Admin apps built"

# ── 3. Build Docker images ────────────────────────────────────────────────────
log "Building Docker images (web, admin, api-ts, proxy, db-migrate, seeder, chat)..."
$COMPOSE build web admin api-ts proxy db-migrate seeder chat-backend chat-migrate
ok "Docker images built"

# ── 4. Optional reset (wipe the database + volumes) ─────────────────────────────
if [ "$RESET" = true ]; then
  log "RESET requested — tearing down stack and wiping volumes..."
  $COMPOSE down -v --remove-orphans || true
  ok "Volumes wiped (fresh database)"
fi

# ── 5. Bring ALL containers up first ────────────────────────────────────────────
log "Starting all containers ($APP_SERVICES)..."
# shellcheck disable=SC2086
$COMPOSE up -d $APP_SERVICES
ok "Containers started"

# ── 6. Wait for Postgres to accept connections ──────────────────────────────────
log "Waiting for Postgres to be ready..."
for i in $(seq 1 60); do
  if $COMPOSE exec -T plane-db pg_isready -U "${POSTGRES_USER:-plane}" >/dev/null 2>&1; then
    ok "Postgres is ready"
    break
  fi
  [ "$i" = "60" ] && err "Postgres did not become ready in time."
  sleep 1
done

# ── 7. Run migrations (only after everything is up) ─────────────────────────────
log "Running database migrations (prisma migrate deploy)..."
if ! $COMPOSE run --rm db-migrate; then
  err "Migrations failed. If this DB was previously created with 'prisma db push' \
(no migration history), run a one-time fresh start with:  ./start.sh --reset \
— or baseline the existing schema without data loss:  cd apps/api-ts && \
bunx prisma migrate resolve --applied 0_init && \
bunx prisma migrate resolve --applied 20260601000000_add_plugins && \
bunx prisma migrate deploy"
fi
ok "Database migrations applied"

# ── 7b. Run chat plugin migrations (idempotent SQL in chat_migrations) ──────────
log "Running chat plugin migrations..."
$COMPOSE run --rm chat-migrate || err "Chat migrations failed. Check: $COMPOSE logs chat-migrate"
ok "Chat migrations applied"

# ── 8. Run seeder (idempotent: admin + workspace + roles + project defaults) ────
log "Running seeder..."
$COMPOSE run --rm seeder
ok "Seed complete"

# ── 9. Health check ───────────────────────────────────────────────────────────
log "Health check..."
sleep 4
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/v1/health/ || echo "000")
if [ "$HTTP" = "200" ]; then
  ok "API responding at http://localhost/api/v1/health/ ($HTTP)"
else
  echo -e "\033[1;33m⚠ API health check returned HTTP $HTTP. Check: $COMPOSE logs api-ts\033[0m"
fi

echo ""
echo "┌────────────────────────────────────────────────────────┐"
echo "│  Stack running at http://localhost                     │"
echo "│  Admin god-mode: http://localhost/god-mode/            │"
echo "│  API Swagger:    http://localhost/api/v1/schema        │"
echo "│                                                        │"
echo "│  Credentials: admin@plane.so / admin                  │"
echo "│                                                        │"
echo "│  Reset everything:  ./start.sh --reset                 │"
echo "│  SAC Migration (manual, needs MySQL):                  │"
echo "│  docker compose -f docker-compose-local.yml            │"
echo "│    run --rm sac-migrator                               │"
echo "└────────────────────────────────────────────────────────┘"
