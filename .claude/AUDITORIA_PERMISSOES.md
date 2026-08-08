# Auditoria do sistema de permissões — fork Quality/Plane

Data: 2026-08-03 · Escopo: `apps/api-ts` (backend oficial), `apps/web`, `packages/constants`, `packages/types`.
Ambiente de prova: api-ts em `http://localhost:8001`, Postgres `plane-dev-db`, workspace `quality`.

Todas as brechas abaixo foram **reproduzidas com curl** contra o servidor real, usando usuários de teste
criados com um papel por nível (`guest5`=5, `atend6`=6, `qual8`=8, `ti12`=12, `memb15`=15, `gest18`=18)
e um `outsider` **sem nenhuma associação a workspace**. Os dados de teste foram removidos ao final.

---

## 1. Resumo executivo

| # | Severidade | Brecha | Status |
|---|-----------|--------|--------|
| B1 | **Crítica** | `PATCH /api/v1/instances/` sem autenticação alguma — anônimo altera configuração da instância | Corrigida |
| B2 | **Crítica** | Comentários: editar/excluir/ler versões sem checagem de membro → IDOR cross-tenant | Corrigida |
| B3 | **Crítica** | `POST /issues/` sem checagem de papel → Visualizador e **Atendimento criam work items** (viola D2) | Corrigida |
| B4 | **Alta** | `PATCH /issues/:id` exigia só `role >= 5` → Visualizador/Atendimento editavam qualquer work item | Corrigida |
| B5 | **Alta** | Assets de workspace (`/workspaces/:slug/assets/*`) sem checagem de membro → leitura/escrita cross-tenant | Corrigida |
| B6 | **Alta** | `POST /states/:id/mark-default/`, `DELETE issue links/relations`, `DELETE module links`, `DELETE technical-visit/issues` sem checagem nenhuma | Corrigida |
| B7 | **Alta** | `bulk-update` exigia só `role >= 5`; `bulk-delete`/`bulk-archive` usavam limiar numérico | Corrigida |
| B8 | **Alta** | `WorkflowRole.level` do papel **member = 10** vs `EUserPermissions.MEMBER = 15` → membros caíam no fallback e **burlavam todo o workflow de estados** | Corrigida |
| B9 | **Média** | Gestão de membros de projeto travada em `isInstanceAdmin` (god-mode) em vez do papel de projeto → nem admin de workspace nem Gestor conseguiam | Corrigida |
| B10 | **Média** | `PATCH/PUT /roles/:role_id/...` sem escopo de workspace → admin do workspace A reescreve papel do workspace B | Corrigida |
| B11 | **Média** | Relatórios/analytics abertos a qualquer membro do workspace (regra diz `[ADMIN, MEMBER]`) | Corrigida |
| B12 | **Média** | UI: ~36 gates de *edição* usavam o conjunto de 6 papéis (com **Atendimento**) → botões de criar/editar/mover/excluir visíveis para Atendimento | Corrigida |
| B13 | **Média** | UI: todas as abas de configuração de projeto excluíam `GESTOR_PROJETO` | Corrigida |
| B14 | **Média** | UI: `stickies` e `views` usavam `[ADMIN, MEMBER, GUEST]` → sumiam para TI/Qualidade/Atendimento | Corrigida |
| B15 | **Baixa** | TI/Qualidade recebiam 403 em ciclos/módulos apesar de `PROJECT_WORK_ROLES` e da matriz de ações | Corrigida (TI liberado) |
| P1..P6 | — | Pendências documentadas (§6) — não alteradas por risco/ambiguidade | Aberto |

---

## 2. Sincronia dos enums e dos `Record` por papel

Verificado **OK**, sem divergências:

| Fonte | ADMIN | GESTOR_PROJETO | MEMBER | TI | QUALIDADE | ATENDIMENTO | GUEST |
|---|---|---|---|---|---|---|---|
| `packages/constants/src/user.ts` → `EUserPermissions` | 20 | 18 | 15 | 12 | 8 | 6 | 5 |
| `packages/types/src/enums.ts` → `EUserPermissions` + `TUserPermissions` | 20 | 18 | 15 | 12 | 8 | 6 | 5 |
| `packages/types/src/workspace.ts` → `EUserWorkspaceRoles` | 20 | 18 | 15 | 12 | 8 | 6 | 5 |
| `packages/types/src/project/projects.ts` → `EUserProjectRoles` | 20 | 18 | 15 | 12 | 8 | 6 | 5 |

`Record`s indexados por papel — todos completos (nenhum TS7053):

- `packages/constants/src/workspace.ts` → `ROLE` (7 chaves) e `ROLE_DETAILS` (7 chaves) ✔
- `packages/constants/src/project-permissions.ts` → `ROLE_PERMISSIONS`, `PROJECT_ROLE_LABELS`, `ALL_PROJECT_ROLES` (7 cada) ✔
- `apps/api-ts/src/utils/permissions.ts` → `DEFAULT_ROLES` (7) ✔

**Divergência encontrada (B8):** o `level` do papel `member` em `DEFAULT_ROLES` era **10**, e não 15.
Como `resolveRole()` procura o `WorkflowRole` pelo `level` igual ao `role` Int da associação, nenhuma linha
casava com `role = 15`; o fallback `[...DEFAULT_ROLES].reverse().find(d => 15 >= d.level)` devolvia o papel
**TI**, com `role.id = null`. E `canTransition()` retorna `true` quando `!role.id` → **membros moviam work
items para qualquer estado**, ignorando toda a matriz de workflow.

Prova (antes):

```
$ # memb15 tenta pular Triagem → Em Desenvolvimento
$ curl -X PATCH .../issues/$ISS -d '{"state_id":"<Em Desenvolvimento>"}' -H "Cookie: plane_auth=$MEMB15"
HTTP 200        # ← deveria ser 403; guest/atend/qual/ti receberam 403 corretamente
```

Prova (depois):

```
guest5=403  atend6=403  qual8=403  ti12=403  memb15=403  gest18=200
```

---

## 3. Matriz papel × capacidade — esperado vs. real (após correções)

Medido com chamadas reais à API (`403` = negado, `2xx` = permitido).

| Capacidade | GUEST 5 | ATEND 6 | QUAL 8 | TI 12 | MEMBER 15 | GESTOR 18 | ADMIN 20 |
|---|---|---|---|---|---|---|---|
| Listar / ler work items | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 | ✅ |
| **Criar work item** | ❌ 403 | ❌ 403 (D2) | ✅ 201 | ✅ 201 | ✅ 201 | ✅ 201 | ✅ |
| **Editar work item de terceiros** | ❌ 403 | ❌ 403 (D2) | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 | ✅ |
| Excluir work item de terceiros | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 204 | ✅ |
| **Abrir intake / chamado** | ❌ 403 | ✅ 201 | ✅ 201 | ✅ 201 | ✅ 201 | ✅ 201 | ✅ |
| Comentar | ❌ 403 | ✅ 201 | ✅ 201 | ✅ 201 | ✅ 201 | ✅ 201 | ✅ |
| Editar/excluir comentário de terceiros | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 204 | ✅ |
| Ciclos / módulos | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 201 | ✅ 201 | ✅ 201 | ✅ |
| Etiquetas (config) | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 201 | ✅ 201 | ✅ |
| Estados (config) | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 201 | ✅ 201 | ✅ |
| Membros do projeto | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 201 | ✅ |
| Relatórios / analytics | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 200 | ✅ 200 | ✅ |
| Transição fora do workflow | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (`STATE_MOVE_UNRESTRICTED`) | ✅ |
| Config de instância (god mode) | ❌ | ❌ | ❌ | ❌ | ❌ 403 | ❌ 403 | só `isInstanceAdmin` |

Notas de leitura:
- **Qualidade** não tem `CYCLE_MANAGE`/`MODULE_MANAGE` na matriz de ações (`DEFAULT_ROLES`), por isso 403 —
  isso **conflita** com `PROJECT_WORK_ROLES`, que a inclui. Ver pendência **P1**.
- No nível de **workspace** o papel é `min(projectRole, 15)`: Gestor aparece como 15 e por isso passa em
  `requireWorkspaceWriter` (>= 15); TI/Qualidade/Atendimento continuam 12/8/6 e não passam.

---

## 4. Brechas encontradas (com prova)

### B1 — `PATCH /api/v1/instances/` sem autenticação (crítica)

O `instanceModule` não usa `authPlugin`, e o handler não resolvia usuário nenhum.

```
$ curl -s -X PATCH http://localhost:8001/api/v1/instances/ \
       -H "Content-Type: application/json" -d '{"instance_name":"PWNED-BY-ANON"}'
{"id":"c1e13529-...","instanceName":"PWNED-BY-ANON","isSetupDone":true,...}
HTTP:200
$ docker exec -i plane-dev-db psql -U plane -d plane -tAc "select instance_name from instances;"
PWNED-BY-ANON
```

Além do nome, o corpo aceitava `is_setup_done`, `domain`, `is_telemetry_enabled`, `is_support_required`.

Depois: `anon=403  memb15=403  instance-admin=200`.

### B2 — IDOR total em comentários (crítica)

`PATCH`/`DELETE /issues/:id/comments/:comment_id/` e `GET .../versions/` só exigiam **estar autenticado**:
não validavam workspace, projeto, associação nem autoria. Um usuário **sem nenhum workspace** conseguiu
editar e apagar comentários de um admin:

```
$ # outsider@audit.test tem 0 workspace_members
$ curl -X PATCH .../issues/$ISS/comments/$CID/ -H "Cookie: plane_auth=$OUTSIDER" \
       -d '{"comment_html":"<p>OUTSIDER WAS HERE</p>"}'
PATCH HTTP:200
$ curl -X DELETE .../issues/$ISS/comments/$CID/ -H "Cookie: plane_auth=$OUTSIDER"
DELETE HTTP:204
$ curl .../comments/$CID/versions/ -H "Cookie: plane_auth=$OUTSIDER"
versions HTTP:200
```

Depois: `outsider PATCH=403  guest5 PATCH=403  guest5 DELETE=403  gest18 DELETE=204`.

### B3 — Regra D2 violada no backend: Atendimento criava work items (crítica)

`POST /issues/` só chamava `getProjectOrFail` (associação), sem checagem de papel:

```
guest5 -> 201   atend6 -> 201   qual8 -> 201   ti12 -> 201   memb15 -> 201   gest18 -> 201
```

Causa raiz dupla: (a) rota sem checagem; (b) a matriz de ações dava `ISSUE_CREATE`/`ISSUE_EDIT_OWN`/
`ISSUE_ASSIGN_SELF` ao papel Atendimento (`CONTRIBUTOR` em `apps/api-ts/src/utils/permissions.ts` e
`_contributor` em `packages/constants/src/project-permissions.ts`). Ambas corrigidas.

Depois: `guest5=403  atend6=403  qual8=201  ti12=201  memb15=201  gest18=201`,
com o intake preservado (`atend6 intake=201`) e comentários preservados (`atend6 comment=201`).

### B4 — `PATCH /issues/:id` com limiar `role >= 5` (alta)

Só a transição de estado era validada; nome, descrição, prioridade, datas e `entity_id` passavam para
qualquer membro, inclusive Visualizador:

```
guest5 rename -> 200   atend6 rename -> 200   ...
```

Depois: `guest5=403  atend6=403`, demais 200. A checagem agora é `ISSUE_EDIT_ALL`, com fallback para
`ISSUE_EDIT_OWN` quando o chamador é o autor.

### B5 — Assets de workspace sem checagem de associação (alta)

`POST/GET/PATCH/DELETE /workspaces/:slug/assets/...` confiavam apenas no slug da URL.

```
$ curl "http://localhost:8001/api/v1/workspaces/quality/assets/" -H "Cookie: plane_auth=$OUTSIDER"
HTTP 200   # antes — listagem de metadados de arquivos de outro tenant
```

Depois: `GET /assets/=403  POST /assets/=403`.

### B6 — Rotas de mutação sem checagem alguma (alta)

Provas com o `outsider` (não-membro):

```
POST   /states/:id/mark-default/          → 200   (mudou o estado padrão do projeto)
DELETE /issues/:id/links/:link_id/        → 204
```

Mesmo padrão em `DELETE /issues/:id/relations/:relation_id/`, `DELETE /issues/:id/issue-relation/:relation_id/`,
`DELETE /modules/:module_id/links/:link_id/` e `DELETE /technical-visits/:visit_id/issues/:issue_id/`.

Depois: `mark-default=403  link-delete(outsider)=403  link-delete(atend6)=403`.

### B7 — Operações em lote (alta)

```
$ curl -X POST .../issues/bulk-update/ -H "Cookie: plane_auth=$GUEST5" \
       -d '{"issue_ids":["'$ISS'"],"properties":{"priority":"urgent"}}'
{"updated":1}  HTTP:200
```

Depois: `guest5=403  atend6=403  ti12=200`.

### B9 — Gestão de membros de projeto presa a `isInstanceAdmin` (média)

Há **duas rotas duplicadas** para `POST/PATCH/DELETE /workspaces/:slug/projects/:project_id/members/...`:

- `apps/api-ts/src/modules/project/index.ts` (`member.role < 15`)
- `apps/api-ts/src/modules/member/index.ts` (`if (!user.isInstanceAdmin) 403`)

Na prática a versão do `memberModule` vence o roteamento, então **quem não é admin de instância nunca
conseguia gerenciar membros**, nem admin do workspace nem Gestor de Projeto — enquanto a matriz de ações
dá `MEMBER_MANAGE` a admin e gestor. Trocado por `roleCan(role, MEMBER_MANAGE)`.

Depois: `ti12=403  memb15=403  gest18=201`.

### B10 — IDOR entre workspaces na API de papéis (média)

`PATCH /workspaces/:slug/roles/:role_id/` e os `PUT .../visibility/` e `.../transitions/` usavam
`prisma.workflowRole.update({where: {id: role_id}})` sem filtrar por `workspaceId`. Um admin do workspace A
podia reescrever permissões/visibilidade/transições de um papel do workspace B informando o id. Corrigido
com uma busca prévia escopada em `workspaceId` (404 quando não pertence).

### B11 — Relatórios e analytics abertos demais (média)

Regra do fork: relatórios/analytics restritos a `[ADMIN, MEMBER]` — é o que a sidebar aplica
(`packages/constants/src/workspace.ts`, itens `analytics` e `reports`). O backend usava
`requireWorkspaceMember` (qualquer membro), então TI/Qualidade/Atendimento chegavam aos dados pela API.

Depois: `guest5=403 atend6=403 qual8=403 ti12=403 memb15=200 gest18=200 admin=200`.

### B12 — UI: gates de edição incluindo Atendimento (média, regra D2)

36 chamadas `allowPermissions([...6 papéis...])` — o conjunto de **visualização** — estavam atribuídas a
variáveis de **trabalho**: `isEditingAllowed`, `canEditProperties(BasedOnProject)`, `isRestoringAllowed`,
`isAllowed`, `canPerformEmptyStateActions`, `hasProjectMemberLevelPermissions`. Efeito: Atendimento via
drag-and-drop no kanban, edição inline em lista/planilha/calendário/gantt, menus de duplicar/arquivar/
excluir, e ações de ciclos/módulos/views. Substituídas por `PROJECT_WORK_ROLES`.

Três dessas ocorrências eram de fato **leitura** e foram mantidas no conjunto amplo (agora
`PROJECT_VIEW_ROLES` explícito, não mais array inline): busca de favoritos do workspace, item "Arquivados"
do menu do projeto na sidebar e o menu de ações do cabeçalho de projeto.

### B13 — UI: Gestor de Projeto sem acesso às configurações de projeto (média)

`packages/constants/src/settings/project.ts` listava só `[ADMIN]`, `[ADMIN, MEMBER]` ou
`[ADMIN, MEMBER, GUEST]` — **`GESTOR_PROJETO` (18) não aparecia em nenhuma aba**, apesar de a regra dizer
que Gestor abre as configurações de projeto. O mesmo em 17 gates `allowPermissions([EUserPermissions.ADMIN])`
das páginas/componentes de configuração de projeto.

### B14 — UI: itens que sumiam para os papéis customizados (média)

- `core/components/stickies/layout/stickies-list.tsx` — `[ADMIN, MEMBER, GUEST]` no nível de workspace:
  TI (12), Qualidade (8) e Atendimento (6) perdiam as stickies.
- `core/components/views/views-list.tsx` — `[ADMIN, MEMBER, GUEST]` no nível de projeto para
  `canPerformEmptyStateActions` (criar view), o que ao mesmo tempo liberava GUEST e bloqueava TI/Qualidade.

### B15 — TI bloqueado em ciclos/módulos (baixa)

`cycle` e `module` usavam `member.role < 15`, então TI (12) e Qualidade (8) tomavam 403 mesmo com a UI
exibindo os botões (`PROJECT_WORK_ROLES` inclui os dois) e com `DEFAULT_ROLES` dando `CYCLE_MANAGE`/
`MODULE_MANAGE` ao TI. Os limiares numéricos foram trocados por `roleCan(...)`, que é o mecanismo desenhado
e respeita a configuração viva de papéis.

---

## 5. Correções aplicadas

### 5.1 `apps/api-ts`

| Arquivo:linha | Mudança |
|---|---|
| `src/utils/permission-checks.ts:36` | novo `requireProjectAction(workspaceId, projectId, userId, action)` — associação + `roleCan` |
| `src/utils/permission-checks.ts:55` | novo `requireOwnOrAll(...)` — passa com `allAction` ou com `ownAction` sendo o autor |
| `src/utils/permissions.ts:57` | novo conjunto `INTAKE_OPERATOR` (D2) — sem `ISSUE_CREATE`/`ISSUE_EDIT_OWN`/`ISSUE_ASSIGN_SELF` |
| `src/utils/permissions.ts:84` | papel `atendimento` passa a usar `INTAKE_OPERATOR` |
| `src/utils/permissions.ts:98` | papel `member`: `level` 10 → **15** (alinha com `EUserPermissions.MEMBER`) |
| `src/utils/permissions.ts:~255` | `seedWorkflowRoles` agora realinha o `level` de papéis de sistema em todo boot; `RESEED_WORKFLOW=true` também reescreve `permissions` |
| `src/modules/instance/index.ts:149` | `PATCH /instances/` exige `isInstanceAdmin` (god mode) |
| `src/modules/issue/index.ts:185` | `POST /` → `ISSUE_CREATE` |
| `src/modules/issue/index.ts:299` | `PATCH /:issue_id` → `ISSUE_EDIT_OWN`/`ISSUE_EDIT_ALL` |
| `src/modules/issue/index.ts:463` | `DELETE /:issue_id` → `ISSUE_DELETE_OWN`/`ISSUE_DELETE_ALL` |
| `src/modules/issue/index.ts:500` | `POST comments/` → `COMMENT_CREATE` |
| `src/modules/issue/index.ts:~530-545` | `PATCH comments/:id` → comentário escopado em ws/projeto/issue + só o autor + `COMMENT_EDIT_OWN` |
| `src/modules/issue/index.ts:~575` | `GET comments/:id/versions/` → exige associação ao projeto |
| `src/modules/issue/index.ts:598` | `DELETE comments/:id` → `COMMENT_DELETE_OWN`/`COMMENT_DELETE_ALL` + escopo |
| `src/modules/issue/index.ts:660,675,...` | `POST links/relations/sub-issues/issue-relation/remove-relation` e os `DELETE` correspondentes → `ISSUE_EDIT_ALL` + escopo por ws/projeto |
| `src/modules/premium/index.ts:382,423,435` | `bulk-update` → `ISSUE_EDIT_ALL`; `bulk-delete`/`bulk-archive` → `ISSUE_DELETE_ALL` |
| `src/modules/cycle/index.ts:25,58,74,95,116` | `role < 15` → `CYCLE_MANAGE` |
| `src/modules/module/index.ts:60…208` | `role < 15` → `MODULE_MANAGE` (9 rotas) |
| `src/modules/module/index.ts:~236` | `DELETE modules/:id/links/:link_id/` ganhou associação + escopo |
| `src/modules/state/index.ts:110` | `POST /:state_id/mark-default/` ganhou associação, `role >= 15` e escopo do estado |
| `src/modules/technical-visit/index.ts:276` | `DELETE /:visit_id/issues/:issue_id/` ganhou `requireWorkspaceMember` |
| `src/modules/asset/index.ts:34,56,69,75,86` | rotas de asset de workspace ganharam `requireWorkspaceMember` + escopo do registro em `patch`/`delete` |
| `src/modules/member/index.ts:122,140,157` | gestão de membros de projeto: `isInstanceAdmin` → `roleCan(MEMBER_MANAGE)` |
| `src/modules/roles/index.ts` (PATCH + 2 PUT) | escopo por `workspaceId` antes de escrever (IDOR cross-tenant) |
| `src/modules/project/index.ts:546` | `POST /:project_id/inbox-issues/` → `INTAKE_CREATE` |
| `src/modules/reports/index.ts` (14 rotas) | `requireWorkspaceMember` → `requireWorkspaceWriter` (>= 15) |
| `src/modules/analytics/index.ts` (7 rotas) | idem |

### 5.2 `packages/constants` (rebuild do `dist` executado: `bun run build` ✔)

| Arquivo | Mudança |
|---|---|
| `src/project-permissions.ts` | novo `_intakeOperator`; `ROLE_PERMISSIONS[ATENDIMENTO]` deixa de herdar `_contributor` (D2); comentário `MEMBER (10)` → `(15)` |
| `src/settings/project.ts` | todas as abas passam a incluir `GESTOR_PROJETO`; abas de leitura (`general`, `members`) = conjunto de visualização + GUEST; abas de configuração = `[ADMIN, GESTOR_PROJETO, MEMBER]`; aba `permissions` permanece **só ADMIN** |

> `access` é tipado como `EUserProjectRoles[]`, portanto as listas foram escritas com o enum local em vez de
> importar `PROJECT_*_ROLES` (que é `EUserPermissions[]` — enums numéricos distintos não são atribuíveis).

### 5.3 `apps/web` (36 + ~24 gates)

- **36 gates de trabalho** (arrays inline de 6 papéis) → `PROJECT_WORK_ROLES`, em: `cycles/*` (4),
  `issues/issue-layouts/*` (20, incluindo kanban/list/spreadsheet/calendar/gantt roots e os
  `quick-action-dropdowns`), `modules/*` (5), `views/view-list-item-action.tsx`,
  `work-item-filters/filters-hoc/project-level.tsx`, `power-k/.../module/commands.tsx`.
- **3 gates de leitura** normalizados para `PROJECT_VIEW_ROLES`:
  `core/layouts/auth-layout/workspace-wrapper.tsx:69`,
  `core/components/workspace/sidebar/projects-list-item.tsx:116`,
  `core/components/navigation/tab-navigation-root.tsx:139`.
- **17 gates `[EUserPermissions.ADMIN]` de configuração de projeto** → `PROJECT_CONFIG_ROLES`:
  `settings/projects/[projectId]/{page,members,estimates,automations,features/*}`,
  `project-states/root.tsx:38`, `labels/project-setting-label-list.tsx:45`,
  `labels/label-drag-n-drop-HOC.tsx:70`, `project/member-list.tsx:56`,
  `project/project-settings-member-defaults.tsx:65`, `automation/auto-{archive,close}-automation.tsx`,
  `issues/issue-modal/components/default-properties.tsx:85`.
- **4 gates `canPerformEmptyStateActions` `[ADMIN]`** → `PROJECT_WORK_ROLES`:
  páginas de lista de `intake`, `modules`, `views`, `pages`.
- `stickies/layout/stickies-list.tsx:68` → `[...PROJECT_VIEW_ROLES, GUEST]`.
- `views/views-list.tsx:35` → `PROJECT_WORK_ROLES`.

### 5.4 Correções de dados aplicadas no banco de desenvolvimento

```sql
UPDATE workflow_roles SET level = 15 WHERE key = 'member' AND is_system = true;
UPDATE workflow_roles
   SET permissions = (SELECT COALESCE(jsonb_agg(p),'[]'::jsonb)
                        FROM jsonb_array_elements(permissions::jsonb) p
                       WHERE p::text NOT IN ('"issue.create"','"issue.edit.own"','"issue.assign.self"'))::jsonb
 WHERE key = 'atendimento' AND is_system = true;
-- religa associações órfãs ao WorkflowRole de mesmo nível
UPDATE workspace_members wm SET workflow_role_id = wr.id FROM workflow_roles wr
 WHERE wr.workspace_id = wm.workspace_id AND wr.level = wm.role AND wr.deleted_at IS NULL
   AND wm.workflow_role_id IS NULL AND wm.deleted_at IS NULL;
UPDATE project_members pm SET workflow_role_id = wr.id FROM workflow_roles wr
 WHERE wr.workspace_id = pm.workspace_id AND wr.level = pm.role AND wr.deleted_at IS NULL
   AND pm.workflow_role_id IS NULL AND pm.deleted_at IS NULL;
```

> **Ao promover para outros ambientes:** o `level` do papel `member` é realinhado automaticamente no boot
> pelo `seedWorkflowRoles`, mas as `permissions` já persistidas do papel `atendimento` **não** — rode o
> `UPDATE` acima ou suba uma vez com `RESEED_WORKFLOW=true`.

---

## 6. Pendências recomendadas (não alteradas)

**P1 — Conflito Qualidade × ciclos/módulos.** `PROJECT_WORK_ROLES` (constants) inclui Qualidade em
"criar/editar ciclos, módulos, views, páginas", mas `ROLE_PERMISSIONS`/`DEFAULT_ROLES` não dão
`CYCLE_MANAGE`/`MODULE_MANAGE`/`PAGE_CREATE` a Qualidade. A UI mostra os botões, o backend devolve 403.
Decidir qual é a verdade e alinhar (mexe em regra de negócio — não alterei).

**P2 — Duas matrizes de permissão paralelas.** `packages/constants/src/project-permissions.ts` e
`apps/api-ts/src/utils/permissions.ts` descrevem a mesma coisa e já divergem: só a do backend dá
`STATE_MANAGE` ao Gestor; só a do frontend tem as ações de transição granulares
(`STATE_TRIAGE_TO_REVIEWING` etc.), que no backend viraram linhas de `RoleStateTransition`. Recomendo eleger
o backend como fonte única e o pacote de constantes como espelho gerado.

**P3 — Rotas de membros de projeto duplicadas.** `projectModule` e `memberModule` registram os mesmos
caminhos com regras diferentes; hoje o `memberModule` vence, mas isso é frágil a mudanças de ordem de
montagem em `src/index.ts`. Remover uma das duas.

**P4 — `POST /instances/signup-screen-visited/` permanece anônimo** (é chamada pela tela de cadastro antes
do login). É idempotente e não vaza dados, mas convém adicionar rate limit.

**P5 — Abas de configuração de projeto agora abertas a MEMBER.** O backend já permitia `role >= 15` em
projeto/estados/etiquetas, então UI e API ficaram consistentes; se a intenção for restringir a
admin+gestor, mudar `PROJECT_CONFIG_ROLES` (e o limiar do backend) em conjunto.

**P6 — Superfícies ainda com gate genérico** (fora do escopo de correção segura):
`page` (páginas de workspace) e `premium` views/time-logs/reações usam apenas `wsMember`/`projMember`, sem
`PAGE_CREATE`/`VIEW_CREATE`; `workspace` stickies/favoritos/quick-links não validam propriedade do registro
em todos os `PATCH`; `POST /workspaces/` é aberto a qualquer autenticado (comportamento upstream do Plane).

---

## 7. Observação operacional

Durante a auditoria o `apps/api-ts` foi reiniciado. O client do Prisma no `node_modules` estava incompleto
(faltava `.prisma/client/query_compiler_fast_bg.js`, provavelmente de um `prisma generate` interrompido por
falta de permissão de escrita), o que derrubava **toda** requisição autenticada com
`MODULE_NOT_FOUND`. Restaurado copiando o loader do próprio pacote:

```
cp node_modules/.../@prisma/client/runtime/query_compiler_fast_bg.postgresql.js \
   node_modules/.../.prisma/client/query_compiler_fast_bg.js
cp node_modules/.../@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.js \
   node_modules/.../.prisma/client/query_compiler_fast_bg.wasm-base64.js
```

O servidor está no ar (`/api/v1/health/` → 200) e os dados de teste da auditoria foram removidos.

---

## 7. Mudança de modelo — 04/08/2026

**Visibilidade por papel foi REMOVIDA do produto.** Quem participa do projeto vê todos os
chamados em qualquer etapa; o recorte por setor virou **filtro** (templates prontos na UI,
em todos os layouts). Saíram: o filtro por `visibleStateIds` na listagem, `DEFAULT_VISIBILITY`,
o endpoint `PUT /roles/:id/visibility/`, o model `RoleStateVisibility` e a tabela.

**Transições continuam** e passaram a ser a **única** regra por papel, com fonte única:
`role_state_transitions` (semeada por `DEFAULT_TRANSITIONS`, aplicada por `canTransition()`,
exposta em `GET /workspaces/:slug/roles/`). O frontend consome essa matriz.

Eliminada a duplicação: `packages/constants` mantinha 7 ações sintéticas (`STATE_TRIAGE_TO_REVIEWING`,
`STATE_ANY_TO_CANCELLED`, …) e a função `canTransitionState()` — uma segunda matriz de transição
que **o backend nunca conheceu**, usada como fallback no `use-project-role-permissions` e como
matriz exibida na tela de permissões por projeto. Tudo removido em favor da configuração real.

Cobertura: `apps/api-ts/tests/contract/state-visibility.test.ts`.
