# Relatórios de chamados, marcos por etapa e painel de TV

Data: 2026-09-22 · Worker W14. Legado de referência: `siteintranet/relatoriosmanuais/`,
`intranet/relatorio/` e `intranet/painel/`. Plano geral dos relatórios: `RELATORIOS_TODO.md`.

## 1. Onde está

```
apps/api-ts/src/modules/reports/
  index.ts                 os 14 relatórios antigos (tickets-overview … time-in-state)
  rotas-de-chamados.ts     rotas novas, finas (report.view + service)
  comum/                   filtros (parseFilters, issueWhere…), período em Brasília,
                           tipo pela etiqueta, chamado serializado, funções dos membros, erros
  marcos/                  motor de marcos (puro) + DAO do histórico de etapa + service
  analitico-por-usuario/   devolvidos/  sintetico-semanal/  balanco/  log-chamados/
  horas-analiticas/        visao-por-sistema/  visitas/  painel-tv/
```

Cada relatório: `<nome>.ts` puro (testado sem banco), `<nome>.dao.ts` só consulta,
`<nome>.service.ts` orquestra. Relatório que só lê pelo DAO dos marcos não tem DAO próprio.

Frontend (`apps/web`): `core/components/reports/{catalog.ts, filtros-do-relatorio.ts,
report-filters.tsx, renderers.tsx, renderers-chamados.tsx, painel-tv/}`, hook
`core/hooks/use-report.ts` (SWR), página `reports/[reportId]/page.tsx`, painel em
`app/(all)/[workspaceSlug]/(painel)/painel/[setor]/page.tsx`.

## 2. Motor de marcos (`marcos/marcos.ts`)

Lê `issue_activities` com `field = "state"`. **A trilha guarda o NOME da etapa** (de/para),
não o id; o grupo vem de `findGrupoDaEtapa` (etapas do espaço, pelo nome).

| Marco | Regra |
| --- | --- |
| atribuído | primeira linha de `issue_assignees` (inclui vínculo desfeito); na lista por usuário, a atribuição DAQUELA pessoa |
| início TI | primeira entrada em "Em Desenvolvimento" |
| finalizado TI | ÚLTIMA saída de "Em Desenvolvimento" que não seja para etapa cancelada (o legado lia o último "finalizado") |
| homologado | última saída de "Em Teste" para etapa do grupo `completed`, com quem moveu |
| encerrado | última entrada em etapa encerrada, só se o chamado CONTINUA encerrado; sem histórico, `completed_at` |
| devolução | cada volta "Em Teste" → "Em Desenvolvimento" |

**`completed_at` é gravado pelo banco.** Gatilho `issues_sync_completed_at` (migração
`20260923090000_data_de_conclusao`, helper `@utils/data-de-conclusao`): entrou numa etapa do
grupo `completed`, grava agora; saiu, limpa; data enviada junto na gravação (importador) vale.
Mesma regra do Plane original: **cancelado não é conclusão**. Vale para todo caminho (PATCH,
edição em massa, triagem, solicitação, criação, rascunho, importação). O backfill
(`backfill_issue_completed_at()`, `scripts/backfill-completed-at.ts`, roda na migração) usa a
última entrada na etapa atual pelo histórico, ou `updated_at` sem histórico, e limpa quem estava
reaberto. O motor de marcos continua tratando cancelado como encerrado (é o "encerrado" do SAC).
A edição em massa passou a gravar a mudança de etapa no histórico.

O "tempo em cada etapa" (`time-in-state`) lê o mesmo `findTransicoesDeEtapa`.

Nomes das etapas: `STATE` de `@utils/permissions` (fonte única, igual a `DEFAULT_STATES`).
Tipo do chamado: etiqueta Correção / Melhoria / Projeto (`DEFAULT_LABELS`), senão Outros;
com duas, Correção > Melhoria > Projeto.

## 3. Rotas (todas GET, `report.view`)

| Rota | O quê | Parâmetros além dos comuns |
| --- | --- | --- |
| `milestones-by-user/` | lista analítica por pessoa com os marcos | `user_id`, `perfil` (responsavel, homologacao), `situacao` (todos, abertos, encerrados) |
| `returned/` | devolvidos no período, com quem devolveu | |
| `weekly-summary/` | responsável × sistema × tipo: interações, concluídos, pendentes | período padrão: semana atual (segunda a domingo, Brasília) |
| `balance/` | balanço com saldo anterior, abertos, encerrados, diferença e saldo atual | `granularidade` (mes, ano); padrão: ano corrente / desde o 1º chamado |
| `ticket-log/` | atividades + comentários, mais recentes primeiro | `etapa` (etapa ATUAL do chamado), `funcao` (chave da função de quem agiu), `user_id`, `limit` (padrão 500, máx. 2000); devolve `funcoes` e `etapas` para os filtros |
| `tv-panel/` | painel do setor | `setor` (ti, qualidade), 400 se outro |

Comuns: `project_ids` (csv, vários sistemas), `entity_id`, `date_from`, `date_to`.

Relatórios estendidos:
- `by-system/`: cada linha ganha `situacoes` (pendente, em_andamento, a_homologar = "Em Teste",
  concluido, cancelado) e `por_tipo` (as mesmas contagens por tipo).
- `by-type/`: ganha `by_system` (matriz sistema × tipo).
- `trends/`: respeita `date_from/date_to` (antes: janela fixa de 12 meses); mês em Brasília.
- `visits-overview/`: filtros `uf` (da entidade), `city` (da visita, senão da entidade), `project_ids`
  (JSON `project_ids` da visita); ganha `by_system`.
- `time-tracking/`: ganha `by_analyst` (lançamentos de cada pessoa) e o filtro `user_id`. O período
  passou a valer para a DATA DO LANÇAMENTO; antes também exigia o chamado aberto no período, e
  hora lançada hoje em chamado antigo sumia.

## 4. Painel de TV (SUBSTITUÍDO — ver `.claude/paineis-tv.md`)

> O painel descrito abaixo foi trocado pelos **painéis de TV sem login** (W18):
> a rota `tv-panel/` dos relatórios e a tela que exigia login saíram, as colunas
> passaram a ser configuráveis pelo espaço e entraram mais três painéis
> (atendimento, mapa e backups). O que segue vale como histórico do que o SAC
> tinha e de como o mapeamento nasceu.

### Como era

`/:workspaceSlug/painel/ti` e `/qualidade`, fora do layout com menu (tela cheia; botão para
`requestFullscreen`). Entrada pela tela de Relatórios.

| Setor | Colunas (etapa) | Pessoas | Alerta sonoro |
| --- | --- | --- | --- |
| TI | A fazer, Em desenvolvimento, Em homologação (Em Teste) | responsáveis com função `ti` | urgente em A Fazer |
| Qualidade | Verificar (Triagem), Analisar (Em Análise), Homologar (Em Teste), com % | responsáveis com função `qualidade` | urgente em Triagem ou Em Teste |

- "Cliente parado" do SAC = prioridade urgente.
- Recarga pelo SSE (`useRealtimeRefetch` em eventos `issue`/`intake`) e, de segurança, a cada 60 s.
- Som: Web Audio (sem arquivo). O navegador exige um clique: botão "Ativar som". Toca quando
  aparece urgente novo e repete a cada 5 min enquanto houver (como o SAC).
- Setor novo = uma entrada em `PAINEIS` (`painel-tv/painel-tv.ts`).
- A função de cada pessoa sai de `comum/funcoes.dao.ts` (mesma resolução de `resolveRole`), só
  para agrupar. Permissão continua pela matriz de ações.

## 5. Decisões (conservadoras, registradas)

- Legado "Atribuído" (TI com dono e não iniciado) não virou coluna do painel: quem move o card
  vira responsável automaticamente, então todo chamado de A Fazer teria dono.
- Sintético semanal: concluído = "finalizado TI" no período (visão do TI, como o legado);
  pendente = em aberto e fora de "Em Teste", retrato de agora; interação = comentário da pessoa
  no período. A visão da Qualidade é o analítico com `perfil=homologacao`.
- O legado contava correção tipo 3 em Melhoria e em Projeto ao mesmo tempo (bug); aqui cada
  chamado tem um tipo só.
- Balanço: cancelado também sai do saldo; "diferença" = encerrados − abertos (o "saldo" do
  mensal do SAC); "saldo atual" é o acumulado (o do anual).
- Log consolidado: `etapa` filtra a etapa ATUAL do chamado; `funcao` filtra quem agiu.
- Impressão do chamado: rótulos do histórico espelham `describeAtividade` do api-ts (o api-ts
  não depende de `@plane/*`); campo novo na trilha entra nos dois mapas.
- Auditoria: impressão busca até 1000 registros dos filtros atuais; o CSV continua sendo a
  exportação completa. A impressão vai para a própria trilha (`print` em `audit_log`).
- Não viraram relatório: pendências de informativo/quiz/oráculo (`pendencias_qualidade.php`,
  informativos viraram outro sistema), horas úteis 07:30-17:45 com feriados
  (`listar_relatorio_semanal_horas.php`: aqui é o tempo lançado), "fora do horário" do painel.

## 6. Pendências

1. (Resolvido) `completed_at` agora é gravado pelo gatilho; as médias dos relatórios antigos
   contam os chamados concluídos pela tela. Chamado sem histórico recebe o `updated_at` no
   backfill, que é aproximação.
2. A matriz sistema × tipo e a visão por sistema carregam os chamados do filtro em memória
   (sem `_count` de relação). Para bases muito grandes, trocar por `groupBy` por etapa+etiqueta.
3. Painel: "fora do horário" do SAC e ícone por sistema não foram trazidos.
4. Chamado com etapa renomeada fora do padrão (`STATE`) não entra nos marcos de TI/homologação.
