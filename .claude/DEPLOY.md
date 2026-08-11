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

# 3. Build do frontend — os Dockerfiles .local só COPIAM build/client, não buildam
pnpm --filter web build
# O admin (god-mode) PRECISA do base path, senão os assets são pedidos em
# /assets/... , o nginx entrega o index.html do app web e a tela abre EM BRANCO.
VITE_ADMIN_BASE_PATH=/god-mode pnpm --filter admin build

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
docker compose -f docker-compose-local.yml run --rm sac-migrator bun run scripts/migrate-sac-responsaveis.ts
docker compose -f docker-compose-local.yml run --rm sac-migrator bun run scripts/migrate-sac-files.ts
docker compose -f docker-compose-local.yml run --rm chat-backend bun run scripts/migrate-sac-chat.ts
```

Todos são idempotentes. O MySQL legado (10.1.2.32) é alcançável a partir do servidor.

O serviço `sac-migrator` é o mesmo para os três importadores do api-ts — só o
`command` muda. **Ordem importa**: `migrate-sac.ts` primeiro (cria entidades e
usuários), senão os responsáveis entram sem órgão e sem vínculo com usuário.

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

O `./e2e-smoke.sh` da raiz (25 verificações) roda contra qualquer ambiente.
`API` é a **origem**, não o prefixo — o script já acrescenta `/api/v1` e `/auth`:

```bash
API=http://10.1.2.12 CHAT=http://10.1.2.12/chat-api WEB=http://10.1.2.12 \
PSQL="sshpass -p SENHA ssh -o StrictHostKeyChecking=no root@10.1.2.12 docker exec -i plane-plane-db psql -U plane -d plane -tA" \
./e2e-smoke.sh
```

> Passar `API=.../api/v1` faz todas as URLs virarem `/api/v1/api/v1/…` (404), e
> **esquecer o `PSQL`** faz as verificações de dados migrados consultarem o banco
> LOCAL — elas passam sem tocar no servidor. Confira sempre os dois.
>
> **Nada de aspas dentro do `PSQL`.** O script expande `$PSQL` sem aspas para
> separar os argumentos, e o bash faz *word splitting* mas **não** remove aspas
> nessa expansão: `-p 'senha'` chega ao sshpass como `'senha'` com as aspas, o ssh
> falha calado e as três verificações da seção 4 acusam "erro" como se os dados
> migrados tivessem sumido.

## Proxy HTTPS (10.1.2.8) — Nginx Proxy Manager

`plane.qualitysistemas.inf.br` resolve para **10.1.2.8**, um Nginx Proxy Manager
(container `reverse-proxy-app-1`, host 92) que encaminha para o 10.1.2.12:80.
A mesma máquina serve vários sistemas da empresa — mexer ali afeta mais gente.

O host 92 precisa de `proxy_buffering off` no `location /`. Sem isso o nginx
segura os eventos do SSE e o tempo real morre **só pelo HTTPS**: pelo IP direto
funciona, o que faz o problema parecer do aplicativo. Medida do sintoma —
12 s escutando `/api/v1/workspaces/quality/realtime/stream/`:

| caminho | recebido |
|---|---|
| `http://10.1.2.12` | 246 bytes (conecta + evento) |
| `https://plane.qualitysistemas.inf.br` | **0 bytes** |

```nginx
location / {
  proxy_http_version 1.1;
  proxy_buffering off;      # ← sem isto o SSE não passa
  proxy_cache off;
  proxy_read_timeout 3600s;
  include conf.d/include/proxy.conf;
}
```

> **O certo é colar isso na aba _Advanced_ do host no painel** (`http://10.1.2.8:81`).
> A edição direta em `/data/nginx/proxy_host/92.conf` funciona na hora, mas o
> Nginx Proxy Manager regenera o arquivo a partir do banco dele assim que
> alguém salvar o host pela interface — e o tempo real cai de novo, sem aviso.

## Armadilhas já resolvidas (não reintroduzir)

- **Client do Prisma do chat**: gerado em `apps/chat-backend/generated/`, **fora de
  `src/`**, porque o compose monta `./apps/chat-backend/src:/app/src` e o volume
  escondia o client da imagem (`Cannot find module '@/generated/prisma'`). O
  Dockerfile copia `/app/generated` e `/app/bunfig.toml`.
- **Importador do SAC com base populada**: dedupe de comentários é feito em
  memória (um `SELECT` só). `issue_comments` não tem índice por
  `(external_source, external_id)`; o `findFirst` por linha tornava a reimportação
  O(n²) (~8 h). Se um dia for preciso deduplicar no banco, crie o índice antes.
- **God-mode em branco**: o admin é servido em `/god-mode/`, mas o Vite embute o
  caminho dos assets no build. Sem `VITE_ADMIN_BASE_PATH=/god-mode` eles saem
  como `/assets/…`, o nginx casa com o app web e devolve HTML no lugar de JS/CSS
  (`Failed to load module script … MIME type "text/html"`). Confira depois do
  build: `grep -o '"/god-mode/assets/[^"]*"' apps/admin/build/client/index.html`.
- **Usuário que trocou de e-mail no legado**: a identidade é o id do SAC
  (`username = sac_<id>`), não o e-mail — senão o `create` estoura a unique de
  `username` e derruba a migração inteira.
