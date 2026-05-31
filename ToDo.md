# Plane — Backlog de Funcionalidades

> Atualizado em: 2026-05-31 (permissões granulares + visibilidade de entidade + estados)
> Ordem de prioridade definida pelo time. Itens 1–4 fazem parte do primeiro ciclo de build.

---

## ✅ Concluído

- **Sidebar global**: itens "Todos os itens" e "Intake global" sempre visíveis; ícones LayersIcon/Intake; traduções pt-BR + en.
- **Rota `/global-intake/`**: seletor de projetos + InboxIssueRoot do projeto selecionado.
- **Entity selector no Create Intake modal**: EntityDropdown plugado nas properties; `entity_id` enviado ao backend na criação.
- **Bug: typeId crash no accept** — campo `type_id` ignorado no PATCH `/issues/:id` (não existe no Prisma client atual).
- **Bug: Decline/Duplicate sumia da listagem** — PATCH `/inbox-issues/:id` agora só move para estado padrão ao aceitar (status=1); decline/duplicate ficam no estado de triagem. Status persistido em `IntakeIssue`.
- **Bug: status perdido entre sessões** — POST cria registro `IntakeIssue`; LIST e GET lêem status do `IntakeIssue` em vez de derivar do estado.
- **Bug: descrição do intake nunca terminava de carregar** — `fetchInboxIssueById` agora sempre limpa o loader via `runInAction` no branch else e no catch.
- **Bug: global-intake auto-selecionava primeiro projeto** — removido auto-select; todos os projetos aparecem no seletor; projeto ativado só quando `?projectId` está na URL.
- **Permissões granulares (item 6)** — `EProjectAction` enum com 35 ações individuais em `project-permissions.ts`; `ROLE_PERMISSIONS` mapeia cada role para o conjunto exato de ações; `useProjectRolePermissions` expõe todos os checks; backend `stateTransitionAllowed` atualizado para refletir a mesma matriz.
- **Entidade visível por padrão** — `getComputedDisplayProperties` inclui `entity: true` para kanban, lista e calendar; calendar agora exibe badge Building2 igual ao kanban.
- **Work structure padrão (item 5)** — `DEFAULT_STATES` inclui `Avaliando` (unstarted, roxo) e `Em Teste` (started, rosa).
- **Backfill estados (item 10)** — `POST /workspaces/:slug/projects/backfill-states/` cria `Avaliando` + `Em Teste` em projetos existentes.
- **Import roles por setor (item 4)** — `migrate-sac.ts` usa `projectRoleForSetor()` para mapear setor SAC → role Plane; armazena em `userProjectRoleMap` e usa ao criar `ProjectMember`.
- **Entidades: editar (item 9)** — modal de edição confirmado funcional (Pencil icon na tabela de entidades → `setModal({open: true, entity})`).
- **Entidade: entity_type nulo (item 11)** — fallback `?? 2` (Outros) já implementado no migrate-sac.

---

## 🔁 Em progresso / Próximo ciclo

### 1. Membros inativos nos seletores *(concluído)*
- Backend: `GET /projects/:id/members/` cruza com `WorkspaceMember.isActive` — exclui usuários suspensos.
- Frontend store: `getWorkspaceMemberIds` filtra `is_active !== false`.

### 2. Intake persistence *(concluído)*
- Criado helper `findTriageState(projectId)` que busca por `isTriage: true` e faz fallback para `group = "triage"` (backfill automático).
- Corrige projetos existentes que tinham estado de triagem sem a flag `isTriage = true`.

### 3. i18n: pt-BR como padrão *(concluído)*
- `FALLBACK_LANGUAGE = "pt-BR"` — novos usuários iniciam em português.
- `fallbackLng: ["pt-BR", "en"]` — chaves ausentes em pt-BR caem para en sem quebrar a UI.
- Chaves novas adicionadas: `sidebar.all_work_items`, `sidebar.global_intake`.

### 4. Importação: roles por setor *(concluído)*
- `projectRoleForSetor(setor)` mapeia texto do setor SAC para role Plane (GESTOR=18, TI=12, QUALIDADE=8, ATENDIMENTO=6, outros=10).
- `userProjectRoleMap` armazena role por userId; usado ao criar `ProjectMember` para novos projetos.

---

## 📋 Backlog

### 5. Work structure padrão em novos projetos *(concluído)*
Estados padrão criados ao criar novo projeto:
- `Backlog` (backlog) — padrão
- `Avaliando` (unstarted, #a855f7)
- `A Fazer` (unstarted)
- `Em Andamento` (started)
- `Em Teste` (started, #ec4899)
- `Concluído` (completed)
- `Cancelado` (cancelled)
- `Triagem` (triage, isTriage: true)

Backfill: `POST /workspaces/:slug/projects/backfill-states/` — adiciona `Avaliando` e `Em Teste` a projetos existentes.

### 6. Permissões granulares *(concluído — reescrita completa)*
35 ações individuais em `EProjectAction` (viewing, work-item mutations, state transitions per step, comments, attachments, intake, project admin).

**Permissões por role:**

| Ação | ATEND. | QUAL. | TI | MEMBER | GESTOR | ADMIN |
|---|---|---|---|---|---|---|
| Visualizar WI | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Criar WI | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Editar próprios | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Editar qualquer | | ✓ | ✓ | ✓ | ✓ | ✓ |
| Excluir WI | | | | ✓ (own) | ✓ (all) | ✓ |
| Triagem → Avaliando | | ✓ | | ✓ | ✓ | ✓ |
| Avaliando → A Fazer | | ✓ | | ✓ | ✓ | ✓ |
| A Fazer → Em Andamento | | | ✓ | ✓ | ✓ | ✓ |
| Em Andamento → Em Teste | | | ✓ | ✓ | ✓ | ✓ |
| Em Teste → Concluído | | | ✓ | ✓ | ✓ | ✓ |
| Em Teste → Em And. (devolução) | | ✓ | | ✓ | ✓ | ✓ |
| Qualquer → Cancelado | | ✓ | ✓ | ✓ | ✓ | ✓ |
| Mover irrestrito | | | | | ✓ | ✓ |
| Ler comentários | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Escrever comentários | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Deletar comentários de outros | | | | | ✓ | ✓ |
| Revisar intake | | ✓ | | ✓ | ✓ | ✓ |
| Gerenciar membros | | | | | ✓ | ✓ |
| Gerenciar estados | | | | | | ✓ |
| Config. projeto | | | | | | ✓ |

### 7. IA: melhoria de texto *(concluído)*
- Backend: `POST /workspaces/:slug/ai-assistant/improve-text/` com prompt pt-BR para melhorar ortografia/clareza.
- Provedor Ollama suportado sem API key.
- Frontend: `AiImproveButton` em `apps/web/core/components/editor/ai-improve-button.tsx` — injetado na `DescriptionInput` e no `CommentCreate`.
- `AIService.improveText()` adicionado ao `ai.service.ts`.

### 8. Edição de comentários: histórico *(concluído)*
- Backend: `IssueCommentVersion` adicionado ao schema Prisma; PATCH salva snapshot antes de sobrescrever.
- Endpoint `GET /:issue_id/comments/:comment_id/versions/` retorna histórico.
- Frontend: "(editado)" substituído por botão clicável → `CommentHistoryModal` exibe versões anteriores.

### 9. Entidades: editar *(concluído)*
- Modal de edição confirmado funcional com ícone Pencil na página `/settings/entities/`.

### 10. Estado "Avaliando" no fluxo *(concluído — ver item 5)*
- Estado criado em novos projetos e via endpoint de backfill.
- Frontend carrega estados dinamicamente — nenhuma mudança adicional necessária.

### 11. Entidades: entity_type nulo na importação *(concluído)*
- Fallback `?? 2` (Outros) já implementado no migrate-sac.

### 12. Tela de Visitas Técnicas *(concluído — base implementada)*
- Modelo `TechnicalVisit` já existia no Prisma schema.
- Backend: módulo `technicalVisitModule` em `apps/api-ts/src/modules/technical-visit/index.ts`.
  - CRUD completo, vinculação de issues, transições de status automáticas.
- Frontend: página `/visits/` com listagem, filtros por status, criação e transições rápidas.
- Sidebar: item "Visitas Técnicas" com ícone Wrench.
- Traduções pt-BR + en adicionadas.
- **Pendente:** relatório rich text, assinatura digital, PDF.

### 14. Chamados Urgentes — Banner + Notificações + Home *(concluído)*
- **Backend:** `GET /workspaces/:slug/urgent-issues/` retorna issues com `priority=urgent` não concluídas/canceladas.
- **Banner:** `CriticalIssuesBanner` aparece no topo de todas as páginas do workspace; polling 60s; mostra estado atual; dispensável por sessão.
- **Home widget:** `CriticalIssuesWidget` mostra lista completa de urgentes com estado + prazo na home page.
- **Desktop notifications:** `useDesktopNotifications` hook pede permissão, monitora notificações não lidas (30s) e dispara alarme recorrente 1h para urgentes sem mudança de estado.

### 15. Número de chamado legado em TODAS as views *(concluído)*
- Campo `legacy_ticket_number` adicionado a `TBaseIssue` (packages/types).
- Badge âmbar `#1234-2026` visível em: **kanban**, **lista**, **calendar**, **spreadsheet**.
- Índice já existia em `schema.prisma` (linha 401).

### 16. Busca Global Full-Text com Tolerância a Erros *(concluído)*
- **Backend:** `GET /workspaces/:slug/global-search/?q=term` — busca fuzzy em: títulos, descrições, comentários, `legacy_ticket_number`, nomes de projetos. Retorna `issues` e `intakes` separadamente.
- Algoritmo: tokenização + remoção de 1 char + transposição de chars adjacentes → ~5 variações por termo.
- Resultados ranqueados por score (legacy number > título > descrição).
- **Frontend:** `GlobalSearchModal` com `Ctrl+G`; mostra badge âmbar para legacy number, estado atual, projeto; navegação ↑↓↵; diferencia work items de intakes e navega para o lugar certo.
- Busca `/search/` (PowerK, `Ctrl+K`) mantida com formato backward-compatible.

### 17. Sistema de Widgets para Desenvolvedores *(concluído)*
- **Backend:** `POST /workspaces/:slug/widget-data/` — aceita objeto Prisma select + table + where + orderBy. Escopo automático ao workspace; campos sensíveis bloqueados; 11 tabelas whitelisted.
- **Guia:** `docs/widget-development-guide.md` com exemplos, design system, checklist e API completa.

### 13. Home: Widgets úteis *(concluído — fase 1)*
- Três widgets estáticos adicionados ao topo da home:
  - **Intakes Abertos**: lista os últimos intakes PENDING de todos os projetos.
  - **Meus Work Items**: issues assignadas ao usuário em estado aberto.
  - **Prazos Próximos**: issues com `target_date` nos próximos 7 dias.
- Componentes em `apps/web/core/components/home/widgets/{open-intakes,my-work-items,upcoming-dates}.tsx`.
- **Pendente:** widget de visitas agendadas, integração com sistema de habilitar/desabilitar.

---

## 🚧 Funcionalidades Novas

### 12. Tela de Visitas Técnicas
**Fluxo:**
1. Agendamento: entidade + responsável + data/hora.
2. Status: `Agendada → Em Andamento (saiu para visita) → Relatório em elaboração → Aguardando assinatura → Concluída`.
3. Relatório: editor rich text (igual work-items).
4. Botão "Enviar para assinatura digital":
   - Gera PDF do relatório.
   - Valida número de telefone (DDD + 9º dígito, ex: `(67) 99999-9999`).
   - Inicia processo de assinatura (integração futura via webhook).
5. Webhook de retorno marca visita como `Concluída`.
6. Home: "Minhas visitas agendadas" aparece para quem tem visita.

**Modelos de dados necessários:**
- `TechnicalVisit`: id, entityId, responsibleId, scheduledAt, status, reportHtml, reportPdf, signaturePhone, signatureRequestId, completedAt.
- Backend: módulo Elysia + Prisma migration.

### 13. Home: Widgets úteis
**Widgets planejados:**
- **Intakes em andamento**: últimas movimentações dos intakes abertos.
- **Minhas visitas agendadas**: visitas do usuário logado.
- **Meus work items**: todos os WI onde o usuário é responsável, de todos os projetos.
- **Datas importantes**: work items com `target_date` próxima (próximos 7 dias).
- **Work items com prazo vencendo**: WI com `target_date` <= hoje.
- **Notificações recentes**: atividades do inbox mostradas como feed.

**Infra:**
- Cada widget é um componente isolado com props de `workspaceSlug` + `userId`.
- Suporte a habilitar/desabilitar por widget (já existe parcialmente na UI com "widgets turn on").
- Futuramente: "widget store" para devs criarem novos widgets e publicarem.

---

## 📐 Arquitetura / Regras

- Backend: **apenas TypeScript** (`apps/api-ts/`). Django é somente referência.
- Prisma schema em `apps/api-ts/prisma/schema.prisma`.
- Frontend: Next.js + MobX + React Router em `apps/web/`.
- Traduções: `packages/i18n/src/locales/` — sempre atualizar `en/` e `pt-BR/`.
- Build do frontend: `pnpm build` na raiz ou `turbo build --filter=@plane/web`.
