# Pós-atendimento de chamados e de visitas (W12)

Data: 2026-09-22 · Worker W12. Base `preview` em `d64d72d55` (depois de W08 e W13).
Legado de referência: `intranet/sac_posAtendimento.php` (fila da Qualidade),
`sac_posAtendimento_at.php` (fila do atendente), `popFinalPos.php` (formulário) e
`concluiVisitaPos.php` / `concluiVisita.php` (gravação).

## 1. O que é (e o que não é)

A EQUIPE liga para o cliente depois que o chamado ou a visita terminou e registra como foi.
A Qualidade confere e marca como verificado.

**Não é a avaliação do portal do cliente.** Aquela é a nota que o próprio cliente dá, pelo
portal, sobre a solicitação dele (outro worker). Esta é o registro da equipe sobre o contato
feito depois do encerramento. As duas convivem, com tabelas e telas separadas; nenhuma lê a
outra.

## 2. Permissões (matriz de ações)

| Ação | Padrão | O que libera |
| --- | --- | --- |
| `posatendimento.record` | Atendimento, Qualidade, Gestor, admin | Ver a fila, registrar o pós de chamado e de visita, "Concluir e fazer pós-atendimento". |
| `posatendimento.verify` | Qualidade, Gestor, admin | Ver a fila, verificar (com comentário), usar o meio "Comunicador interno". |
| `report.view` (já existia) | Membro, Gestor, admin | Relatório de satisfação. |

- Grupo novo na tela de Funções: "Pós-atendimento". Escopo `workspace`.
- Fila: `requireWorkspaceAnyAction` (helper novo em `@utils/permission-checks`, qualquer uma
  das duas ações). Registrar: `requireWorkspaceAction(RECORD)`. Verificar: `(VERIFY)`.
  Relatório: `(REPORT_VIEW)`. Painel do detalhe: basta ser membro do espaço.
- Chamados sempre recortados pelos sistemas de que a pessoa participa
  (`findMemberProjectIds`), como a listagem de chamados do espaço. Chamado de outro sistema
  é 404. Visita é do espaço inteiro (mesma regra da tela de visitas).
- Sidebar: item `pos-atendimento` com `requiredActions` (campo novo e opcional em
  `IWorkspaceSidebarNavigationItem`, `@plane/constants`); `SidebarItemBase` esconde o item
  quando nenhuma das ações está em `useMyWorkspaceActions().can`.

## 3. Modelo (migração `20260922190000_pos_atendimento`)

`pos_atendimentos` (`PosAtendimento`):

| Coluna | Observação |
| --- | --- |
| `issue_id` / `visit_id` | Únicos. CHECK `pos_atendimentos_um_alvo`: exatamente um preenchido. FK com cascata. |
| `expectativa` | 4 sim, 3 parcialmente, 2 não, 1 não era o que precisava (`posatendimento_solucao`). Nulo só no histórico convertido dos comentários. |
| `classificacao` | 3 ótimo, 2 bom, 1 ruim (`posatendimento_satisfacao`). Nulo no histórico sem nota (238 linhas com 0 no SAC). |
| `problema_resolvido` | `sim`, `parcial`, `nao`. Campo NOVO, obrigatório só na visita. |
| `meio_contato` | 1 telefone, 2 e-mail, 3 MSN (só histórico), 4 chat, 5 remoto, 6 comunicador interno. |
| `observacao`, `recorded_by_id`, `recorded_at` | Quem ligou e quando. Sem FK (sobrevive à conta desativada). |
| `verified_by_id`, `verified_at`, `verification_comment` | Verificação da Qualidade. |
| `legacy_id` | Único: `posatendimento_id` do SAC (importação idempotente). |

`workspace_id` sem FK: o registro cascateia pelo chamado ou pela visita (evita mexer no model
`Workspace`, que todos os workers editam). Tabelas de código em
`modules/pos-atendimento/pos-atendimento.codes.ts` (objetos `as const`, sem `enum`).

## 4. API (`apps/api-ts/src/modules/pos-atendimento`)

`index.ts` (rotas finas) → `pos-atendimento.service.ts` (regra, dependências injetadas) →
`pos-atendimento.dao.ts` (Prisma). `pos-atendimento.query.ts` monta os `where` por pedaços
(situação, sistema, entidade, responsável, período) para chamado, visita e relatório.
`pos-atendimento.rules.ts` é puro (formulário, filtros, intercalação, agregação).
`pos-atendimento.legado.ts` é a tradução do SAC (puro). Erros tipados em
`pos-atendimento.errors.ts` (o `errorHandler` devolve `{detail, errors}`).

| Rota (`/api/v1/workspaces/:slug/pos-atendimento`) | Quem | O que faz |
| --- | --- | --- |
| `GET /` | record ou verify | Fila paginada (`per_page` até 1000, `cursor` `limite:página:0`). `situacao` = `pending` (padrão), `to_verify`, `verified`; `origem` = `all`, `issue`, `visit`; `project_id`, `entity_id`, `responsavel_id`, `desde`, `ate` (data pura = dia inteiro no fuso do escritório). |
| `GET /issues/:id/` · `GET /visits/:id/` | membro | Painel: `{concluido, pos}`. |
| `POST /issues/:id/` · `POST /visits/:id/` | record | Registra (201). 404 fora do alcance, 409 se já existe, 422 se não concluído, 400 com `errors[].path` (`expectativa`, `classificacao`, `problema_resolvido`, `meio_contato`, `observacao`). |
| `POST /:pos_id/verify/` | verify | `{comment?}`. 409 se já verificado. |
| `GET /report/` | report.view | `{total, classificacao, expectativa, por_sistema, por_entidade}` com contagem e percentual. Filtros: `origem`, `project_id`, `entity_id`, `desde`/`ate` (sobre a data do CONTATO, `recorded_at`). |
| `GET /report/items/` | report.view | Lista paginada no formato da fila, do contato mais recente; `classificacao` = 3, 2, 1 ou `none`. |

### Regras

- **Concluído**: chamado na etapa do grupo `completed`; visita com `status` Concluída (4).
  Na fila, "concluído em" = `completed_at` do chamado (ou a última alteração, quando o
  chamado foi concluído sem gravar a data) e `finished_at` da visita (ou a última alteração).
- **Abas**: pendente de pós = concluído e sem registro; pendente de verificação e verificado
  = registro com e sem `verified_at`, mesmo que o chamado tenha sido reaberto depois.
- **Ordem**: mais recente primeiro (o legado mostrava o mais antigo primeiro, o que com o
  histórico migrado enterraria o trabalho do dia). Chamados e visitas intercalados
  (`mergeByConcluidoEm`): cada origem traz `skip + take` e a página sai da intercalação.
- **Quem verifica e registra já deixa verificado** (regra do legado: `concluiVisitaPos.php`
  fazia isso para o setor Qualidade). Sem comentário de verificação nesse caso.
- **Meio de contato**: MSN recusado em registro novo; comunicador interno só para quem tem
  `posatendimento.verify` (no legado, só a Qualidade via a opção).
- Todos os campos são obrigatórios (legado: "Preencha todos os campos."), menos o
  comentário da verificação.
- Id malformado na URL vira 404 antes de chegar ao Postgres.
- **Relatório**: visita com dois sistemas conta nos dois, então a soma por sistema pode
  passar do total. "Sem sistema" e "Sem entidade" agrupam o que não tem.

## 5. Tela (`apps/web`)

| Arquivo | Papel |
| --- | --- |
| `core/services/pos-atendimento.service.ts` | APIService. |
| `core/hooks/use-pos-atendimento.ts` | SWR: `usePosFila`, `usePosPainel`, `useSatisfacao`, `useSatisfacaoItens`, `usePosPermissions`, `refreshPosAtendimento` (revalida toda chave `POS_ATENDIMENTO`). |
| `core/components/pos-atendimento/helpers.ts` | Puro e testado (`bun test core/components/pos-atendimento`). |
| `pos-fila.tsx`, `pos-filtros.tsx` | Fila com as três abas, filtros e paginação. |
| `pos-atendimento-modal.tsx` | Formulário; erros da API voltam para o campo (`mapVisitErrors`). |
| `verificar-modal.tsx` | Mostra o registro; com `verify` e pendente, marca verificado. |
| `pos-atendimento-panel.tsx` | Painel no detalhe do chamado (`main-content.tsx`, acima da atividade) e da visita (topo do detalhe). |
| `concluir-com-pos-button.tsx` | Ícone de telefone no cabeçalho do chamado. |
| `satisfacao-relatorio.tsx`, `satisfacao-print-document.tsx` | Relatório e impressão. |
| `app/(all)/[workspaceSlug]/(projects)/pos-atendimento/` | Páginas `/pos-atendimento` e `/pos-atendimento/satisfacao`. |

- **Gatilho no chamado**: "Concluir e fazer pós-atendimento" aparece para quem tem `record`
  enquanto o chamado não está concluído nem cancelado. Move para a primeira etapa do grupo
  `completed` do sistema (pela ordem) com o `updateIssue` do store, que passa pela matriz de
  transições da API; se a API recusar, o formulário não abre. Concluído e sem pós, o painel
  oferece "Fazer pós-atendimento".
- **Gatilho na visita**: botão "Concluir e fazer pós-atendimento" ao lado de "Concluir", nas
  mesmas situações. `save` do detalhe passou a devolver se gravou; a trava de encerramento da
  visita continua valendo e, se recusar, o formulário não abre.
- Sidebar: rótulo `sidebar.pos_atendimento` (`@plane/i18n`, pt-BR e en), ícone `PhoneCall`.
  Rebuild do dist de `@plane/constants` e `@plane/i18n` depois de mexer.

## 6. Importação do legado (`apps/api-ts/scripts/import-pos-atendimento.ts`)

```
DATABASE_URL=... MYSQL_HOST=10.1.2.32 MYSQL_USER=developer MYSQL_PASS=... MYSQL_DB=quality_site_dev \
  bun run scripts/import-pos-atendimento.ts        # DRY_RUN=true só relata
DATABASE_URL=... bun run scripts/import-pos-atendimento.ts   # sem MYSQL_HOST: comentários pos-N
```

- **Com MySQL**: relê `posatendimento`. Chamado migrado = `issues.external_source =
  'sac_migration'` e `external_id = chamados_id`; pessoa = `users.username = 'sac_<id>'`.
  O pós feito PELA VISITA (`visita.visita_posatendimento = 1`, ligado por
  `visita_chamados_id`) vai para a visita migrada (`technical_visits.legacy_id`); o resto vai
  para o chamado. Upsert por `legacy_id`: completa o que veio dos comentários (expectativa),
  mas não desfaz uma verificação feita no Plane depois.
- **Sem MySQL** (ou MySQL fora do ar): converte os comentários `pos-N` do §12 do
  `migrate-sac.ts`: classificação, meio de contato e verificado vêm do `metadata`; a
  observação e o comentário da Qualidade vêm das linhas do texto. **A expectativa fica
  nula**: o importador antigo gravou `solucao: Boolean(...)`. Nunca sobrescreve registro
  existente.
- O SAC tem 220 linhas repetidas no mesmo chamado: fica a mais recente (maior id); as
  outras são relatadas. Destino que já tem pós feito no Plane não é tocado.
- O legado não grava QUANDO foi verificado: o verificado importado fica com a data do contato.
- Os comentários `pos-N` continuam no chamado (histórico). Nada é apagado.
- `migrate-sac.ts` (no `.gitignore`) não foi alterado: o §12 continua gravando os comentários;
  o script novo roda depois dele.

Validação em `plane_w12` (seed + `migrate-sac.ts` com `CHAMADO_MIN_ID=28000
CHAMADO_MAX_ID=28904`: 900 chamados, 892 visitas, 20 comentários `pos-N`):

| Rodada | Resultado |
| --- | --- |
| comentários, `DRY_RUN` | lidos 20, gravaria 20 |
| comentários, 1ª | 20 gravados (expectativa nula, classificação e meio preenchidos) |
| comentários, 2ª | 0 gravados (idempotente) |
| MySQL, 1ª | 11.837 lidos, 271 gravados (todos de visita: os 20 do comentário eram de visita e MUDARAM do chamado para a visita, agora com expectativa), 11.557 sem chamado migrado no recorte, 9 repetidos no mesmo destino |
| MySQL, 2ª | 271 regravados, total continua 271 (upsert idempotente); 147 verificados |
| MySQL fora do ar | cai para os comentários, 0 gravados |

Com esses dados, a fila respondeu em 25 a 75 ms (1.335 pendentes, 124 visitas pendentes de
verificação, 147 verificados) e o relatório deu 271 registros (93,7% ótimo, 6,3% bom).

## 7. Testes

- `apps/api-ts/tests/unit/pos-atendimento-regras.test.ts`: formulário, filtros, `where`,
  intercalação, agregação.
- `apps/api-ts/tests/unit/pos-atendimento-service.test.ts`: service com DAO mockado.
- `apps/api-ts/tests/unit/pos-atendimento-legado.test.ts`: tradução do SAC e dos comentários.
- `apps/api-ts/tests/unit/catalogo-de-acoes.test.ts`: quem recebe as duas ações.
- `apps/api-ts/tests/unit/permission-checks.test.ts`: `requireWorkspaceAnyAction`.
- `apps/api-ts/tests/contract/pos-atendimento.test.ts`: 14 casos pela API de verdade.
- `apps/web/core/components/pos-atendimento/helpers.test.ts`.

## 8. Decisões conservadoras e pendências

- Visita pós do legado vai para a VISITA só quando `visita_posatendimento = 1`; os demais
  pós de chamados de visita ficam no chamado.
- A fila pendente mostra todo chamado concluído sem pós, inclusive o histórico migrado (o
  pós do SAC parou em 2018): use o filtro de período. Não há corte automático por data.
- Registro não é editável nem apagável (o legado também não deixava; o formulário abria
  travado depois de preenchido). Se precisar, é rota nova com ação própria.
- Sem notificação no sino e sem SSE: a fila revalida ao gravar pela própria tela.
- O relatório por período usa a data do contato, não a do encerramento.
- Porta 8112 estava ocupada pelo proxy do W11; os testes de contrato rodaram na 8122.
- Testes de e-mail (`sessao-e-senha`, `portal-senha`) precisam também de `SMTP_FROM` no
  servidor e no `bun test` (com só `SMTP_HOST`, o SMTP conta como não configurado).
- `migrate-sac.ts` foi COPIADO do checkout principal só para gerar os dados da validação e
  apagado depois (está no `.gitignore`); o teste `migrate-sac-etapas` só passa com ele presente.
