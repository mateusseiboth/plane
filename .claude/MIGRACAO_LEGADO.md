# Migração do SAC legado (MySQL) → Plane

Fonte: MySQL `quality_site_dev` em `10.1.2.32:3306` (user `developer`).
Cliente `mysql` precisa de `--ssl-mode=DISABLED` (servidor antigo); com `mysql2`
(Node/Bun) conecta normalmente.

**Charset:** as tabelas principais (`chamados`, `mensagens`, `visita`, `entidades`,
`usuarios`) são **latin1** e o servidor converte corretamente para a conexão
utf8mb4 — **não** force charset binário nem reinterprete bytes. As tabelas de chat
(`chat`, `chat_mensagens`) já são utf8mb4.

## Scripts

| Script | O que traz |
|---|---|
| `apps/api-ts/scripts/migrate-sac.ts` | entidades, usuários, sistemas→projetos, chamados→itens de trabalho, vínculos, mensagens→comentários, pós-atendimento→comentários, visitas técnicas |
| `apps/api-ts/scripts/migrate-sac-files.ts` | anexos de mensagens, arquivo da visita, disco virtual |
| `apps/chat-backend/scripts/migrate-sac-chat.ts` | conversas e mensagens do chat antigo (incl. anexos base64 do WhatsApp) |

Mapeamentos puros ficam separados em `apps/chat-backend/scripts/sac-chat-mapping.ts`
(testados em `tests/migrate-sac-chat.test.ts`).

Todos são **idempotentes** (dedupe por `external_source`/`external_id` ou
`legacy_id`) e aceitam `DRY_RUN=true`.

### Recortes úteis (`migrate-sac.ts`)

- `LIMIT_RECORDS=N` — processa os N chamados mais recentes (ordem `id DESC`).
- `CHAMADO_MAX_ID` / `CHAMADO_MIN_ID` — faixa de ids. Necessário para exercitar
  dados antigos: **pós-atendimento só existe até o chamado ~28904**, então um
  `LIMIT_RECORDS` pequeno (que pega os mais novos) migra 0 pós-atendimentos.
- `SKIP_COMMENTS` / `SKIP_VISITS`.

### Armadilhas já resolvidas

- **P2000 (LengthMismatch)**: o legado não respeita os limites das colunas do
  Prisma. `visita_periodo` chega a 59 caracteres numa coluna `VarChar(50)` e
  derrubava a migração inteira. Use o helper `bounded(valor, tamanho)` para
  qualquer coluna `@db.VarChar`.
- **Chamados sem sistema** (`chamados_sistemas_id = 0`): 1 registro, ignorado com
  aviso — não há projeto de destino.
- **Visitas**: a entidade não está na tabela `visita`; vem do primeiro
  responsável listado em `visita_contato_id` (tabela `responsaveis`).
  `visita_sistemas_id` (CSV) vira `projectIds`.

## Arquivos (anexos)

`migrate-sac-files.ts` separa **catálogo** de **binário**:

1. Sem fonte configurada: cria o registro do anexo com `attributes.legacy_path`
   e `attributes.pending_import = true`. Nada se perde.
2. Com `LEGACY_FILES_BASE=http://host` **ou** `LEGACY_FILES_DIR=/mnt/sac`: baixa
   o binário, grava no storage do Plane (S3 ou disco, conforme a instância) e
   cria o `file_assets` correspondente.

Para completar depois:

```bash
LEGACY_FILES_BASE=http://<host-do-legado> PENDING_ONLY=true \
  bun run scripts/migrate-sac-files.ts
```

**Onde ficam os arquivos:** os caminhos são relativos
(`arquivos_usuarios/AAAA/MM/<id>/arquivo.ext`, `arquivos_visitas/...`,
`arquivos_disco/...`). O host `10.1.2.32` (banco) **não** os serve por HTTP e o
`10.1.2.35` responde 200 para tudo com uma página de redirecionamento (falso
positivo) — o script detecta e trata isso como "indisponível". O repositório real
precisa ser informado por quem conhece a infraestrutura (share SMB `//10.1.2.32/DEV`
é um candidato: monte e use `LEGACY_FILES_DIR`).

## Volumes do legado (referência)

| Tabela | Registros | Destino |
|---|---|---|
| `chamados` | 51.670 | `issues` |
| `mensagens` | 235.311 | `issue_comments` (+ 65.722 com anexo) |
| `chat_mensagens` | 2.077.348 | `chat_messages` |
| `chat` | 101.932 | `chat_sessions` |
| `posatendimento` | 11.837 | `issue_comments` (metadata `origem: posatendimento`) |
| `visita` | 903 | `technical_visits` |
| `arquivos` (disco virtual) | 609 | `file_assets` |
| `entidades` | 278 | `entities` |
| `usuarios` | 940 | `users` |
| `sistemas` | 112 | `projects` |

## Resultado da migração do chat (rodada completa, ~21 min)

- **104.657 / 104.657 sessões** (65.878 native + 38.779 whatsapp), 2011‑11 → 2026‑07.
- **2.182.436 / 2.183.861 mensagens** (1.425 órfãs: a conversa não existe mais no legado).
- **2.497 contatos** (dedupe por telefone) e **7.691 anexos / 1,5 GB** gravados no storage.
- Protocolo dos importados: `LEG-<chat_numero>` (+`-<chat_id>` nos 43 números repetidos).
  `legacy_id` único em `chat_sessions`/`chat_messages` (migração `0008_legacy_import.sql`)
  garante a idempotência.
- **38.453 mensagens de mídia sem blob**: o legado só guardou arquivo em
  `chat_mensagens_arq_zap` entre 12/2019 e 09/2023; fora dessa janela sobra o link
  `tempstorage.download` (gravado como `ext:<url>`, provavelmente morto). Anexos do chat
  **nativo** ficam no filesystem da intranet antiga e não no MySQL.
- **22.418 sessões** cujo atendente legado não existe como usuário no Plane ficam com
  `assignedAttendantId` nulo, preservando nome e id legado.

**Sanitização do texto**: o legado tem mojibake (UTF‑8 dentro de coluna latin1),
entidades HTML (`&aacute;`), o token `|br|` e **base64 inteiro embutido em `<img>`** —
esse último inflaria o Postgres em ~2 GB se copiado como está. O sanitizador do script
trata os quatro casos.

**Ainda não migrado** (sem destino claro no produto atual): `tickets*` (sistema de
chamados paralelo, 140k), `cronograma*`, `chamados_homologacao`,
`chamados_percentual`, `alertaqualidade`, `quiz_*`, `checklist_*`, `portal_*`,
`log`/`logadmin`. Avaliar caso a caso se viram feature ou ficam só no legado.
