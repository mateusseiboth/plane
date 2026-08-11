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
| `apps/api-ts/scripts/migrate-sac-responsaveis.ts` | tipos de responsável e responsáveis (contatos das entidades) |
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

### Etapa de destino de cada chamado

O legado guarda o **setor onde o chamado está** (`chamados_setor`) e o
**responsável de cada setor em colunas separadas**: `chamados_gdq` (Qualidade),
`chamados_ti`, `chamados_ate` (Atendimento), `chamados_gp` (Gestão de Projetos).

| Situação no SAC | Etapa no Avião |
|---|---|
| `encerrado` / `encerrado parcialmente` | Concluído |
| setor TI | Em Desenvolvimento |
| setor Qualidade **sem** responsável da Qualidade | **Triagem** |
| setor Qualidade **com** responsável da Qualidade | **Em Análise** |
| demais setores abertos | Em Desenvolvimento |

**Triagem é a fila do que não tem dono** — essa é a definição do produto. A
primeira versão do importador separava Triagem de Em Teste por "passou pelo TI
em algum momento" (qualquer mensagem com setor TI), o que jogava na Triagem
chamado que já estava com alguém da Qualidade.

Duas sutilezas que custam caro se ignoradas:

- `chamados_gdq` **nem sempre aponta para alguém da Qualidade** (há registros
  apontando para atendimento, TI e GP). Só vale como dono quem tem
  `usuarios_setor` de Qualidade — por isso o importador carrega o conjunto de
  usuários da Qualidade antes do laço.
- **O único assignee é o responsável do setor atual.** "Meu chamado" é o que eu
  tenho de resolver agora — não o que eu já comentei um dia. A versão anterior
  transformava todo participante de `mensagens` em responsável (3,5 por chamado,
  11.979 com 5 ou mais) e o filtro "Meus chamados" devolvia tudo que a pessoa
  tinha tocado. Solicitante e criador **não** entram: quem abriu fica em
  `createdById` e o cliente aparece pela entidade.
- O SELECT dos chamados monta as colunas de responsável a partir de
  `COLUNAS_RESPONSAVEL_SQL` (derivado do mapa de setores). Listar à mão fez uma
  rodada trazer só `chamados_gdq` — 9.432 responsáveis em vez de ~26.000, **sem
  erro nenhum**. O importador loga `👤 N com responsável (X%)` e avisa abaixo de
  50% justamente por isso.
- Cobertura real esperada: **51%**. O resto se explica sozinho: `representante`
  e `cliente` (9.296 chamados) não têm coluna de responsável; `chamados_ti` quase
  nunca é preenchido; e donos que saíram da empresa (`usu_ativo = 0`) não são
  migrados, o que tira ~11 mil chamados encerrados da conta.

Conferência rápida depois de importar:

```sql
select s.name, count(*) from issues i join states s on s.id = i.state_id
where i.deleted_at is null group by s.name order by count(*) desc;
```

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

## Responsáveis (contatos das entidades)

`migrate-sac-responsaveis.ts` traz as pessoas de contato de cada órgão — quem a
Quality liga, manda WhatsApp e recebe na visita. Elas **não têm login**:

| Legado | Destino |
|---|---|
| `tiposresponsavel` (9) | `entity_contact_types` (`usuario_sistema` → `is_system_user`) |
| `responsaveis` (2.433, 1.874 ativos) | `entity_contacts` |

Rode **depois** de `migrate-sac.ts`: as entidades e os usuários já precisam
existir. Idempotência por `legacy_id` (único por workspace); o segundo passe
compara campo a campo e só reescreve o que mudou no legado — uma rodada limpa
imprime `0 criados, 0 atualizados, 2433 inalterados`.

Os tipos são deduplicados **pelo nome**, não pelo `legacy_id`: o `seed.ts` já
cria os mesmos nove (com `legacy_id`), e casar por id criaria um segundo
"Secretário (a)". O título do tipo 3 vem com espaço à direita no legado —
`limpar()` faz o `trim` e é o que faz os dois lados baterem.

Números da rodada completa e o que o legado perde:

- **6 sem entidade** (`entity_id` nulo): 5 com `responsaveis_entidades_id` nulo
  e 1 apontando para órgão com `entidades_status <> 1`, que `migrate-sac.ts` não
  migra. Entram assim mesmo — o contato existe, só não tem órgão.
- **222 aniversários de 893 preenchidos.** `responsaveis_nascimento` é
  `varchar(10)` digitado à mão: 337 são o literal `dd/mm/aaaa`, 221 são
  `00/00/0000`, e ainda há `0000000000`, `re/tf/gree`, `30//05/76`, `.` e ano de
  2 dígitos (`27/02/65` — ambíguo, descartado de propósito). Só `dd/mm/aaaa` e
  `aaaa-mm-dd` com data real e ano ≥ 1900 viram `birth_date`; o resto é null e
  aparece como "Nascimento inválido" no resumo.
- **83 vinculados a um `User`** por e-mail (case-insensitive). O importador
  **não cria usuário**. Repare que 142 responsáveis compartilham
  `teste@teste.com.br` e 180 e-mails se repetem — o legado nunca teve unicidade
  aqui, então o mesmo `user_id` pode aparecer em mais de um contato.
- **Telefone: 100% aproveitado.** Todos os 2.433 têm 10 ou 11 dígitos, e
  `phone_digits` sai com o DDI (`55` + número): 819 com 12 dígitos, 1.614 com 13.
  É a chave que o chat usa para casar o WhatsApp.
- **427 fotos ficam só como caminho** (`2025/11/foto_10.jpg`). O binário está no
  filesystem da intranet antiga e nenhum PHP deste repositório escreve essa
  coluna — o campo `photo` guarda o caminho relativo para um download futuro,
  no mesmo espírito do `legacy_path` de `migrate-sac-files.ts`.
- E-mails malformados (22: `zaira_gomes@brturbo.com,br`,
  `felipe@usuario@gmail.com`, `(67) 99187-5013@uc.com`…) são **preservados como
  estão**. Não casam com nenhum usuário e não há por que apagar o que o operador
  cadastrou.

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
| `responsaveis` | 2.433 | `entity_contacts` |
| `tiposresponsavel` | 9 | `entity_contact_types` |

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
