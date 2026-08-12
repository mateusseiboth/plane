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

## IA de levantamento de requisitos (texto fantasma + análise ao salvar)

Alimenta as rotas do módulo `apps/api-ts/src/modules/ia-requisitos/`:

| rota | quando | serviço |
|---|---|---|
| `POST /api/v1/workspaces/:slug/ia/sugestao-de-requisito/` | enquanto se digita | `POST {base}/sugerir` |
| `POST /api/v1/workspaces/:slug/ia/analise-de-chamado/` | ao clicar em salvar | `POST {base}/analisar` |
| `GET\|PATCH /api/v1/workspaces/:slug/ia/configuracao/` | o que cada espaço decide | — (banco) |

As variáveis abaixo valem para o SERVIDOR (endereço, formato, credencial) e vão
no `.env` da raiz — o `docker-compose-local.yml` já as repassa ao `api-ts`. O que
cada espaço de trabalho liga ou desliga fica no banco, na seção seguinte.

| variável | para que serve | padrão |
|---|---|---|
| `IA_REQUISITOS_URL` | endereço base do serviço (ex.: `http://10.1.2.189:8101`) | vazio → recurso **desligado** |
| `IA_REQUISITOS_FORMATO` | `aviao`, `openai`, `llamacpp` ou `ollama` | `aviao` |
| `IA_REQUISITOS_CHAVE` | credencial; **nunca** chega ao navegador | vazio |
| `IA_REQUISITOS_MODELO` | nome do modelo, para os formatos que pedem | vazio |
| `IA_REQUISITOS_TIMEOUT_MS` | teto de espera da sugestão e da análise | `5000` |
| `IA_REQUISITOS_ENABLED` | interruptor extra, para desligar sem perder a configuração | `true` |
| `IA_REQUISITOS_OCR_URL` | extração de texto dos prints | `${IA_REQUISITOS_URL}/ocr` |
| `IA_REQUISITOS_OCR_TIMEOUT_MS` | teto de espera do OCR | `1500` |

**Desligado é o padrão.** Sem `IA_REQUISITOS_URL` a sugestão responde `200` com
`{"sugestao": "", "faltando": []}` e a análise com `{"aceitacao": null, …}`;
ninguém percebe diferença ao escrever chamado. O mesmo vale para serviço fora do
ar, erro, tempo estourado e formato inexistente — **trabalhar não depende da IA
estar de pé**, então não há cenário em que a IA derrube o editor nem trave o
salvamento.

### Trocar de provedor

É mudar variável de ambiente e reiniciar o `api-ts` — não se mexe em código:

```bash
# modelo local (padrão)
IA_REQUISITOS_URL=http://10.1.2.189:8101
IA_REQUISITOS_FORMATO=aviao
IA_REQUISITOS_CHAVE=<a chave do capi_api.py>

# qualquer serviço que fale o protocolo da OpenAI (vLLM, LM Studio, OpenRouter…)
IA_REQUISITOS_URL=https://api.openai.com
IA_REQUISITOS_FORMATO=openai
IA_REQUISITOS_CHAVE=sk-...
IA_REQUISITOS_MODELO=gpt-4o-mini

# llama.cpp servido direto
IA_REQUISITOS_URL=http://10.1.2.189:8083
IA_REQUISITOS_FORMATO=llamacpp

# ollama
IA_REQUISITOS_URL=http://10.1.2.189:11434
IA_REQUISITOS_FORMATO=ollama
IA_REQUISITOS_MODELO=qwen2.5:7b
```

```bash
docker compose -f docker-compose-local.yml up -d --force-recreate api-ts
docker compose -f docker-compose-local.yml logs api-ts | grep ia-requisitos
```

Errar o nome do formato **não derruba o servidor**: cai no comportamento de
desligado e registra `[ia-requisitos] IA_REQUISITOS_FORMATO="…" não existe` no
log — é a primeira coisa a conferir quando a sugestão "sumiu".

Um provedor novo é **um arquivo em `apps/api-ts/src/modules/ia-requisitos/provedores/`
e uma linha no mapa** de `provedores/index.ts`. Cada provedor implementa os dois
métodos da interface: `sugerir` (texto fantasma) e `analisar` (análise ao salvar).

> A credencial fica só no processo do servidor. Se ela aparecer em
> `apps/web/.env` ou em qualquer bundle do frontend, está no lugar errado — o
> navegador fala apenas com o Plane.

### Análise ao salvar

`POST /api/v1/workspaces/:slug/ia/analise-de-chamado/` roda o checklist de
aceitação inteiro, aplica as regras da Aula 18-3 e os cinco porquês, e devolve a
nota. Mesma permissão da rota irmã (quem pode abrir chamado no projeto), mesma
trilha LGPD — os eventos se distinguem por `metadata.operacao`
(`sugestao` ou `analise`) na tela de Auditoria.

```jsonc
// pedido
{
  "campo": "chamado",          // "chamado" | "comentario"
  "titulo": "…", "descricao": "…", "comentario": "…",
  "project_id": "…",           // ou issue_id de um chamado existente
  "issue_id": "…", "tipo": "correcao", "entity_id": "…",
  "contexto": { }              // reserva para o que a tela sabe e o banco ainda não
}
```

```jsonc
// resposta — sempre 200
{
  "aceitacao": 62,             // 0–100, ou null quando NÃO houve nota
  "analisado": true,           // o mesmo, dito por extenso
  "blocos": [{"bloco": "Números", "percentual": 0, "faltando": ["Falta um exemplo numérico."]}],
  "porques": ["Por que o total sai errado? …"],
  "feedback": "texto curto dizendo o que melhorar",
  "sugestoes": ["trecho pronto para colar"]
}
```

**`aceitacao: null` é o caso que mais importa.** IA desligada, fora do ar, com
erro, lenta demais ou resposta imprestável → `null` e `analisado: false`, com
200. Quem bloqueia o salvamento é a TELA, e só com nota na mão: **nem no modo
`exigir` a rota barra alguma coisa** — travar o chamado porque um serviço está
indisponível seria pior que não ter o recurso.

No provedor nativo (`aviao`) a nota vem do checklist determinístico do serviço.
Nos demais formatos ela é **recalculada como a média dos blocos** que o próprio
modelo devolveu, para o medidor da tela nunca contradizer a lista logo abaixo
dele; modelo que não devolve o JSON pedido resulta em análise vazia.

### Configuração por espaço de trabalho

Vive em `WorkspaceSetting`, chave `ia_requisitos` — tabela chave/valor que já
existe, **sem migração**. Lida a cada chamada: ligar e desligar vale na hora, sem
reiniciar o `api-ts`.

| chave | para que serve | padrão |
|---|---|---|
| `fantasma_ativo` | o texto fantasma enquanto digita | `true` |
| `analise_ativa` | a análise ao salvar | `true` |
| `analise_em_comentarios` | a análise também na caixa de comentário | `true` |
| `modo` | `avisar` \| `exigir` \| `silencioso` | `avisar` |
| `minimo_aceitacao` | nota mínima; só usada no modo `exigir` | `70` |
| `mostrar_indicador` | o medidor de % na modal | `true` |

- **avisar** — mostra a análise e deixa salvar assim mesmo. É o padrão.
- **exigir** — abaixo de `minimo_aceitacao` a TELA bloqueia o salvar, com o que
  falta à vista. Nunca deve ser o padrão de quem instala o Avião.
- **silencioso** — analisa e guarda, sem interromper.

```bash
# leitura: qualquer membro do espaço (a tela precisa saber se mostra o indicador)
curl -H "X-Api-Key: $TOKEN" http://localhost:8000/api/v1/workspaces/quality/ia/configuracao/

# escrita: só quem administra o espaço (nível 20); parcial, manda só o que mudou
curl -X PATCH -H "X-Api-Key: $TOKEN" -H "Content-Type: application/json" \
  -d '{"modo": "exigir", "minimo_aceitacao": 85}' \
  http://localhost:8000/api/v1/workspaces/quality/ia/configuracao/
```

A leitura acrescenta `ia_disponivel`, que diz **se** existe provedor configurado
no servidor — nunca qual, onde, nem com que chave. Serve para a tela não
prometer um recurso que jamais vai responder.

Chave ausente cai no padrão da tabela acima; valor de tipo errado, modo
inexistente ou porcentagem fora de 0–100 são corrigidos na leitura, e conteúdo
ilegível no banco **não derruba a rota** — vira os padrões e registra o aviso.

O seeder (`apps/api-ts/scripts/seed.ts`) garante a configuração no espaço
`quality` **ativa, modo `avisar`**. Ele roda a cada `docker compose up` e só cria
o que falta: ajuste feito por administrador na tela não é desfeito.

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
