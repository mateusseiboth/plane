# Plane — Backlog de Funcionalidades

> Atualizado em: 2026-05-31
> Ordem de prioridade definida pelo time. Itens 1–4 fazem parte do primeiro ciclo de build.

---

## ✅ Concluído

- **Sidebar global**: itens "Todos os itens" e "Intake global" sempre visíveis; ícones LayersIcon/Intake; traduções pt-BR + en.
- **Rota `/global-intake/`**: seletor de projetos + InboxIssueRoot do projeto selecionado.
- **Entity selector no Create Intake modal**: EntityDropdown plugado nas properties; `entity_id` enviado ao backend na criação.

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

### 4. Importação: roles por setor *(pendente — fazer antes do build)*
**Regras:**
- Membros do setor "Qualidade" → role `5` (Viewer/Visualizador) em todos os projetos.
- Membros com flag de gestor de projeto → nova role customizada com permissões específicas.
- Script: `apps/api-ts/scripts/migrate-sac.ts` — ajustar criação de `projectMember`.

---

## 📋 Backlog

### 5. Work structure padrão em novos projetos
Quando um projeto é criado via UI, garantir que os estados padrão sejam:
- `Backlog` (backlog)
- `A Fazer / ToDo` (unstarted)
- `Em Andamento / In Development` + `Em Teste / In Test` (started)
- `Concluído / Done` (completed)
- `Cancelado / Cancelled` (cancelled)
- `Triagem` (triage, `isTriage: true`)

### 6. Permissões granulares *(fundação implementada)*
Roles novos adicionados em `EUserProjectRoles`: `GESTOR_PROJETO=18`, `TI=12`, `QUALIDADE=8`, `ATENDIMENTO=6`.
Arquivo de constantes: `packages/constants/src/project-permissions.ts`.
Hook frontend: `apps/web/core/hooks/use-project-role-permissions.ts`.
Backend: validação de transição de estado em `PATCH /:issue_id`.
ROLE labels atualizados em pt-BR no `packages/constants/src/workspace.ts`.

Roles: `TI`, `Qualidade`, `Atendimento`, `Gestor de Projeto`.

| Permissão | TI | Qualidade | Atendimento | Gestor |
|---|---|---|---|---|
| Visualizar issues | S | S | S | S |
| Criar/editar issues | S | S | S | S |
| Deletar issues | N | N | N | S |
| Comentar | S | S | S | S |
| Apagar comentários de outros | N | N | N | S (+ log) |
| Gerenciar estados/labels | N | N | N | N |
| Gerenciar membros do projeto | N | N | N | S |
| Configurações do projeto | N | N | N | N |

**Fluxo de estados restrito:**
- Atendimento: pode abrir intake apenas, não move estados.
- Qualidade: pode mover de intake → Avaliando → ToDo; de In Test → In Progress (devolução com erro).
- TI: pode mover de ToDo → In Progress → In Test.
- Gestor: acesso total de movimentação.

### 7. IA: melhoria de texto
- Botão "Melhorar com IA" em editores de rich text (work-item description, comentários).
- Config no god-mode: endpoint de IA local (Ollama) + modelo.

### 8. Edição de comentários: histórico
- Ao clicar em "editado", mostrar diff/versão anterior do comentário.
- Backend: endpoint para retornar versões do comentário (similar ao description-versions).

### 9. Entidades: estilização + editar *(verificar se já resolvido)*
- Confirmar que o botão "Nova Entidade" aparece corretamente estilizado.
- Modal de edição existe no código — verificar se abre corretamente.

### 10. Estado "Avaliando" no fluxo
- Novo estado entre intake e ToDo: o Qualidade coloca o item "Avaliando" antes de mover para ToDo.
- Backfill em todos os projetos existentes: criar o estado se não existir.
- Frontend: garantir que o estado aparece no kanban e nos filtros.

### 11. Entidades: entity_type nulo na importação
- Verificar query no migrate-sac: `entidade_tipo_id` pode ser NULL no banco SAC.
- `ENTITY_TYPE_MAP[entidades_tipo]` pode não encontrar o tipo se o texto não bater exatamente.
- Fallback: se não mapear, usar `2` (Outros) — já implementado como `?? 2`.

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
