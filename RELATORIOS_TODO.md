# Plano de Ação — Módulo de Relatórios Gerenciais (SAC / Plane TS)

> Objetivo: entregar um conjunto rico de **relatórios gerenciais** sobre chamados, visitas
> técnicas, sistemas, entidades, usuários, tempo gasto, prioridade e interações — todos
> **visíveis em tela** na aplicação e com opção de **gerar PDF para impressão**.
>
> Stack: Backend `apps/api-ts` (Bun + Elysia + Prisma 7). Frontend `apps/web` (React Router + MobX).
> Toda nova funcionalidade é **exclusivamente TypeScript** (Django em `api/` é somente leitura).

---

## 0. Contexto de domínio (mapeamento SAC → Plane)

| Conceito SAC          | Modelo Plane        | Observação |
|-----------------------|---------------------|------------|
| Chamado               | `Issue`             | `priority`, `stateId` (group), `entityId`, `legacyTicketNumber`, `completedAt`, `createdAt` |
| Sistema               | `Project`           | 1 sistema = 1 projeto |
| Entidade / Cliente    | `Entity`            | workspace-scoped (`name`, `city`, `state`, `entityType`) |
| Assunto / Tipo        | `Label`             | usado p/ tipo de atividade (correção/melhoria/projeto/dúvida) |
| Mensagem / Interação  | `IssueComment`      | contagem por chamado/usuário |
| Tempo gasto           | `IssueTimeLog`      | `durationMinutes`, `loggedDate`, `memberId` |
| Técnico / Atendente   | `User` / `IssueAssignee` | |
| Visita técnica        | `TechnicalVisit`    | `status` 0-5, motivos `mot_*`, `technicianId`, `entityId`, `city`, datas |
| Status do chamado     | `State.group`       | backlog / unstarted / started / completed / cancelled |
| Prioridade            | `Issue.priority`    | urgent / high / medium / low / none |

---

## 1. Catálogo de Relatórios

Cada relatório tem: **visão em tela** (cards de KPI + tabelas + barras) e **exportação PDF/impressão**.
Todos aceitam filtros de período (`date_from`, `date_to`), projeto(s) e entidade quando aplicável.

### A. Chamados
1. **Visão Geral de Chamados** (`tickets-overview`)
   - KPIs: total, abertos, em andamento, concluídos, cancelados, taxa de conclusão, tempo médio de resolução (dias), tempo médio de primeira resposta.
   - Distribuições: por prioridade, por status (group), por tipo de atividade (label).
2. **Chamados por Sistema** (`by-system`)
   - Ranking de sistemas (projetos) com mais chamados, % do total, abertos vs concluídos, tempo médio de resolução por sistema, prioridade predominante.
3. **Chamados por Entidade** (`by-entity`)
   - Ranking de entidades/clientes, total de chamados, abertos/fechados, tempo médio, distribuição de prioridade, cidade/UF.
4. **Chamados por Prioridade / Urgência** (`by-priority`)
   - Distribuição por prioridade, tempo médio de resolução por prioridade, urgentes/altos **em aberto há mais tempo** (lista crítica com idade em dias).
5. **Chamados por Tipo de Atividade** (`by-type`)
   - Correção / Melhoria / Projeto / Dúvida (via labels), volume e tempo médio por tipo.

### B. Produtividade & Pessoas
6. **Produtividade por Usuário/Técnico** (`productivity`)
   - Por responsável: chamados atribuídos, resolvidos, taxa de resolução, tempo médio de resolução, tempo total registrado (h), nº de interações.
7. **Tempo Gasto (Time Tracking)** (`time-tracking`)
   - Horas registradas por usuário, por sistema e por entidade no período; total geral; média por chamado; ranking de chamados que mais consumiram tempo.
8. **Interações / Mensagens** (`interactions`)
   - Total de interações, média por chamado, chamados com mais interações (possível gargalo), interações por usuário, por sistema.

### C. Visitas Técnicas
9. **Visão Geral de Visitas** (`visits-overview`)
   - Total e distribuição por status, por motivo (atualização/correção/treinamento/melhoria/comercial/outros), por técnico, por entidade, por cidade; duração média (início→fim); visitas agendadas no período.

### D. Gerencial / Temporal
10. **Tendência Temporal** (`trends`)
    - Série mensal/semanal: chamados criados vs concluídos; evolução do backlog; sazonalidade.
11. **Backlog Aging** (`backlog-aging`)
    - Chamados abertos por faixa de idade: 0-7d, 8-30d, 31-90d, 90+d; por sistema/entidade; chamados "envelhecidos" críticos.
12. **SLA / Tempo de Resolução** (`sla`)
    - Distribuição de tempos de resolução (faixas), % resolvidos em ≤24h / ≤72h / ≤7d / >7d, por prioridade.
13. **Dashboard Executivo** (`executive`)
    - Consolidação dos principais KPIs em uma só tela para a gerência (saúde geral, top sistemas, top entidades, alertas de urgentes/backlog).

---

## 2. Backend — `apps/api-ts/src/modules/reports/index.ts`

- Prefixo: `/workspaces/:slug/reports`.
- Padrão dos módulos existentes: `new Elysia({ prefix }).use(authPlugin)`, `getWorkspaceOrFail`, `requireWorkspaceMember`.
- Filtros comuns parseados em helper `buildBaseWhere(query, wsId)`: `project_ids`, `entity_id`, `date_from`, `date_to`.
- Usar `prisma.groupBy`, `count`, e `$queryRaw` para médias temporais (EXTRACT EPOCH) como já feito em `analytics`.
- Endpoints (GET):
  - [ ] `/tickets-overview/`
  - [ ] `/by-system/`
  - [ ] `/by-entity/`
  - [ ] `/by-priority/`
  - [ ] `/by-type/`
  - [ ] `/productivity/`
  - [ ] `/time-tracking/`
  - [ ] `/interactions/`
  - [ ] `/visits-overview/`
  - [ ] `/trends/`
  - [ ] `/backlog-aging/`
  - [ ] `/sla/`
  - [ ] `/executive/`
- [ ] Registrar `reportsModule` em `apps/api-ts/src/index.ts`.

## 3. Frontend — `apps/web`

- [ ] Serviço `reports.service.ts` (estende `APIService`) com 1 método por endpoint.
- [ ] Rota `:workspaceSlug/reports` e `:workspaceSlug/reports/:reportId` em `app/routes/core.ts`.
- [ ] Páginas em `app/(all)/[workspaceSlug]/(projects)/reports/`.
- [ ] Entrada no sidebar: item `reports` em `packages/constants/src/workspace.ts` + ícone em `ce/.../sidebar/helper.tsx` + label i18n `sidebar.reports`.
- [ ] Landing de relatórios: grade de cards por categoria com descrição e link.
- [ ] Componentes reutilizáveis: `ReportShell` (cabeçalho + filtros + botão "Gerar PDF / Imprimir"), `KpiCard`, `BarList`, `ReportTable`.
- [ ] Filtros de período/projeto/entidade na barra de cada relatório.

## 4. Exportação PDF / Impressão

- [ ] Abordagem: **impressão nativa do navegador** (`window.print()`) com folha de estilo `@media print`
      que oculta sidebar/chrome e formata o relatório (cabeçalho com logo + período + data de geração).
      Permite "Salvar como PDF" de forma confiável para qualquer relatório (tabelas longas, várias páginas).
- [ ] Componente `PrintableReport` que envolve o conteúdo, injeta cabeçalho/rodapé de impressão e dispara `print()`.
- [ ] (Opcional futuro) export branded via `@react-pdf/renderer` (já é dependência) para download direto `.pdf`.

## 5. Validação

- [ ] `pnpm --filter web typecheck` / build do `api-ts`.
- [ ] Testar cada endpoint com workspace de exemplo.
- [ ] Conferir impressão (layout A4, quebras de página).

---

## Progresso

- [x] Exploração da arquitetura
- [x] Plano escrito (este arquivo)
- [x] Backend: módulo reports — 13 endpoints (`apps/api-ts/src/modules/reports/index.ts`)
- [x] Backend: registro no index (`apps/api-ts/src/index.ts`)
- [x] Frontend: serviço (`reports.service.ts`) + rotas (`app/routes/core.ts`) + sidebar (`constants/workspace.ts`, `helper.tsx`, `sidebar-item.tsx`) + i18n
- [x] Frontend: landing (`reports/page.tsx`) + 13 relatórios (`components/reports/{catalog,ui,renderers}`) + detalhe (`reports/[reportId]/page.tsx`)
- [x] Frontend: PDF/impressão (botão "Gerar PDF / Imprimir" + `@media print` na página de detalhe)
- [x] Validação: typecheck dos arquivos novos sem erros (backend e frontend)

### Próximos passos sugeridos
- [ ] Testar endpoints com workspace real e ajustar performance (índices) para grandes volumes.
- [ ] (Opcional) Export branded em `.pdf` via `@react-pdf/renderer` além do print nativo.
- [ ] (Opcional) Filtro multi-projeto (atualmente seleção única por sistema).
- [ ] (Opcional) Gráficos (linhas/pizza) com biblioteca de charts no lugar das barras.
- [ ] Cobrir o módulo `reports` com testes de contrato (`apps/api-ts/tests/contract`).
