# Deploy

Servidor de teste/homologação: **10.1.2.12** (Debian 12, 2 vCPU, 8 GB, root).
Diretório: `/root/plane`. Orquestração: `docker compose -f docker-compose-local.yml`.
A aplicação é servida pelo proxy na porta **80** (`http://10.1.2.12`).

## Passo a passo

```bash
# 1. Sincronizar o código (do repositório local para o servidor)
rsync -az --delete --exclude-from=deploy-excludes.txt ./ root@10.1.2.12:/root/plane/

# 2. Dependências (só quando package.json mudar)
cd /root/plane && pnpm install

# 3. Build do frontend — o Dockerfile.web.local só COPIA build/client, não builda
pnpm --filter web build

# 4. Imagens
docker compose -f docker-compose-local.yml build \
  api-ts chat-backend web admin proxy db-migrate seeder chat-migrate sac-migrator

# 5. Subir + migrar
docker compose -f docker-compose-local.yml up -d api-ts chat-backend web admin proxy
docker compose -f docker-compose-local.yml run --rm db-migrate     # Prisma (api-ts)
docker compose -f docker-compose-local.yml run --rm chat-migrate   # SQL idempotente do chat
docker compose -f docker-compose-local.yml run --rm seeder
```

## Excluir do rsync (obrigatório)

`node_modules/`, `.git/`, `.turbo/`, `coverage/`, `apps/web/build/`,
`apps/chat-backend/media/`, `apps/chat-backend/generated/`, `.react-router/`,
`.next/`, `*.log` e — **crítico** — `apps/web/.env`, `apps/admin/.env`,
`apps/space/.env`.

> **Por que os `.env` importam:** o Vite embute `VITE_API_BASE_URL` no bundle. Em
> produção ele precisa ficar **vazio** (o proxy serve API e frontend na mesma
> origem). Se o `.env` de desenvolvimento (`http://localhost:8001`) for para o
> servidor, o frontend de todo mundo passa a chamar a máquina do próprio usuário.
> Conferir depois do build:
> `grep -o 'VITE_API_BASE_URL[^,}]*' apps/web/build/client/assets/*.js` → deve
> mostrar `VITE_API_BASE_URL||""`.
>
> **Atenção com o caminho do exclude:** os padrões do rsync são relativos à
> RAIZ DA TRANSFERÊNCIA. Sincronizando `apps/web/ → .../apps/web/`, o padrão
> `apps/web/.env` não casa com nada — ali o certo é `.env`. Sempre confira
> `ls apps/web/.env` no servidor antes de buildar.

## Rebuild obrigatório das imagens de migração

`db-migrate`, `seeder`, `chat-migrate` e `sac-migrator` usam os mesmos Dockerfiles
do api-ts/chat-backend, mas **não são reconstruídas junto** com os serviços de
runtime. Se você só reconstruir api-ts/chat-backend, os importadores continuam
rodando o código antigo.

## Importadores (ver `.claude/MIGRACAO_LEGADO.md`)

```bash
docker compose -f docker-compose-local.yml run --rm sac-migrator
docker compose -f docker-compose-local.yml run --rm sac-migrator bun run scripts/migrate-sac-files.ts
docker compose -f docker-compose-local.yml run --rm chat-backend bun run scripts/migrate-sac-chat.ts
```

Todos são idempotentes. O MySQL legado (10.1.2.32) é alcançável a partir do servidor.

## Reset da base (só ambientes de teste)

```bash
docker compose -f docker-compose-local.yml stop api-ts chat-backend
docker exec plane-plane-db psql -U plane -d postgres -c "DROP DATABASE IF EXISTS plane WITH (FORCE);"
docker exec plane-plane-db psql -U plane -d postgres -c "CREATE DATABASE plane OWNER plane;"
# depois: db-migrate → chat-migrate → seeder → importadores
```

Backup antes, se houver qualquer dúvida:
`docker exec plane-plane-db pg_dump -U plane -d plane --clean --if-exists | gzip > /root/backups/plane-$(date +%F-%H%M).sql.gz`

## Validação pós-deploy

```bash
curl -o /dev/null -w "%{http_code}\n" http://10.1.2.12/                    # 200
curl -o /dev/null -w "%{http_code}\n" http://10.1.2.12/api/v1/health/      # 200
curl -o /dev/null -w "%{http_code}\n" http://10.1.2.12/chat-api/health/    # 200
```

Login (`admin@plane.so`) e confira que `/api/v1/workspaces/quality/audit-logs/`,
`/print-settings/` e `/entities/` respondem 200. O `./e2e-smoke.sh` da raiz roda
contra qualquer ambiente via `API=... CHAT=... WEB=... ./e2e-smoke.sh`.

## Armadilhas já resolvidas (não reintroduzir)

- **Client do Prisma do chat**: gerado em `apps/chat-backend/generated/`, **fora de
  `src/`**, porque o compose monta `./apps/chat-backend/src:/app/src` e o volume
  escondia o client da imagem (`Cannot find module '@/generated/prisma'`). O
  Dockerfile copia `/app/generated` e `/app/bunfig.toml`.
- **Importador do SAC com base populada**: dedupe de comentários é feito em
  memória (um `SELECT` só). `issue_comments` não tem índice por
  `(external_source, external_id)`; o `findFirst` por linha tornava a reimportação
  O(n²) (~8 h). Se um dia for preciso deduplicar no banco, crie o índice antes.
- **Usuário que trocou de e-mail no legado**: a identidade é o id do SAC
  (`username = sac_<id>`), não o e-mail — senão o `create` estoura a unique de
  `username` e derruba a migração inteira.
