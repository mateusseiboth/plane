#!/usr/bin/env bash
# Deploy do Plane no servidor de homologação (10.1.2.12). Passo a passo e
# armadilhas em .claude/DEPLOY.md; este script só executa aquela receita.
#
# Uso (da raiz do repositório, na branch que vai subir):
#   SSHPASS='<senha do root>' ./deploy-homolog.sh            # tudo
#   SSHPASS='<senha do root>' ./deploy-homolog.sh up check   # só algumas etapas
#
# Etapas, nesta ordem: backup sync deps packages web admin live images up migrate check
# A senha vem SEMPRE do ambiente (SSHPASS): nunca grave a senha neste arquivo.
set -euo pipefail

HOST="${DEPLOY_HOST:-10.1.2.12}"
DIR="${DEPLOY_DIR:-/root/plane}"
ALL_STEPS=(backup sync deps packages web admin live images up migrate check)

[ -n "${SSHPASS:-}" ] || { echo "Defina SSHPASS com a senha do root de $HOST." >&2; exit 1; }
command -v sshpass >/dev/null || { echo "Instale o sshpass." >&2; exit 1; }

SSH=(sshpass -e ssh -o StrictHostKeyChecking=no "root@$HOST")

# No servidor, pnpm e node vêm do usuário root (nvm), fora do PATH do ssh não interativo.
remote() {
  "${SSH[@]}" "export PATH=/root/.local/share/pnpm/bin:\$(ls -d /root/.nvm/versions/node/*/bin | tail -1):\$PATH; cd $DIR && $1"
}

compose() { remote "docker compose -f docker-compose-local.yml $1"; }

step_backup() {
  remote 'mkdir -p /root/backups && T=$(date +%F-%H%M) && docker exec plane-plane-db pg_dump -U plane -d plane --clean --if-exists | gzip > /root/backups/plane-$T.sql.gz && cp .env /root/backups/env-$T.bak && docker run --rm -v plane_apimedia:/m -v /root/backups:/b alpine tar czf /b/media-$T.tgz -C /m . && ls -lh /root/backups/*-$T*'
}

# --delete apaga no servidor o que sumiu do repositório; deploy-excludes.txt
# protege os .env, os builds feitos lá e a mídia do chat.
step_sync() {
  rsync -az --delete --exclude-from=deploy-excludes.txt \
    -e "sshpass -e ssh -o StrictHostKeyChecking=no" ./ "root@$HOST:$DIR/"
  remote 'test ! -e apps/web/.env && test ! -e apps/admin/.env' \
    || { echo "apps/web/.env ou apps/admin/.env chegou ao servidor: o bundle apontaria para localhost." >&2; exit 1; }
}

step_deps() { remote 'CI=true pnpm install --frozen-lockfile'; }

# O web e o admin leem o dist dos pacotes do workspace: sem este passo o build
# usa dist velho e cai com "X is not exported by packages/utils/dist".
step_packages() { remote 'pnpm turbo run build --filter="web^..." --filter="admin^..." --filter="live^..."'; }

step_web() {
  remote 'VITE_LIVE_BASE_PATH=/live pnpm --filter web build'
  remote 'grep -q "VITE_LIVE_BASE_PATH:\"/live\"" apps/web/build/client/assets/*.js' \
    || { echo "O bundle do web saiu sem VITE_LIVE_BASE_PATH=/live." >&2; exit 1; }
}

step_admin() {
  remote 'VITE_ADMIN_BASE_PATH=/god-mode pnpm --filter admin build'
  remote 'grep -q "\"/god-mode/assets/" apps/admin/build/client/index.html' \
    || { echo "O admin saiu sem o base path /god-mode (tela em branco)." >&2; exit 1; }
}

# `pnpm deploy --prod` poda o node_modules do workspace inteiro: por isso vem
# depois de web e admin, e o `pnpm install` logo atrás é obrigatório.
step_live() {
  remote 'pnpm turbo run build --filter=live && rm -rf apps/live/.deploy && pnpm --filter live deploy --legacy --prod apps/live/.deploy && CI=true pnpm install --frozen-lockfile'
}

# As imagens de migração usam os Dockerfiles do api-ts e do chat, mas não são
# reconstruídas junto com os serviços: sem elas, os importadores rodam código velho.
step_images() {
  compose 'build api-ts chat-backend web admin live proxy db-migrate seeder chat-migrate sac-migrator'
}

step_up() { compose 'up -d api-ts chat-backend web admin live proxy'; }

step_migrate() {
  compose 'run --rm db-migrate'
  compose 'run --rm chat-migrate'
  compose 'run --rm seeder'
  # Depois das migrations o api-ts sincroniza as ações novas nas funções no boot.
  compose 'restart api-ts chat-backend'
}

step_check() {
  local falhou=0
  for rota in / /api/v1/health/ /chat-api/health/ /live/health/ /god-mode/; do
    local codigo
    for _ in $(seq 1 20); do
      codigo=$(curl -s -o /dev/null -w "%{http_code}" "http://$HOST$rota" || true)
      [ "$codigo" = "200" ] && break
      sleep 3
    done
    echo "$rota -> $codigo"
    [ "$codigo" = "200" ] || falhou=1
  done
  local ws
  ws=$(curl -s -i -N --max-time 8 -H "Connection: Upgrade" -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    "http://$HOST/live/collaboration?documentType=project_page" | head -1 | tr -d '\r' || true)
  echo "/live/collaboration -> $ws"
  [[ "$ws" == *101* ]] || falhou=1
  return $falhou
}

steps=("$@")
[ ${#steps[@]} -gt 0 ] || steps=("${ALL_STEPS[@]}")
for s in "${steps[@]}"; do
  declare -F "step_$s" >/dev/null || { echo "Etapa desconhecida: $s (use: ${ALL_STEPS[*]})" >&2; exit 1; }
  echo "==> $s"
  "step_$s"
done
echo "Deploy concluído em http://$HOST"
