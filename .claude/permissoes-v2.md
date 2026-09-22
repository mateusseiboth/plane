# Permissões v2: matriz de ações como fonte única

Data: 2026-09-22 · Worker W02. Substitui as checagens por número de papel descritas em
`AUDITORIA_PERMISSOES.md` (que continua valendo como histórico das brechas B1..B15).

## 1. O modelo em uma tela

```
ACTION_CATALOG (apps/api-ts/src/utils/permissions.ts)   ← UMA linha por ação
   ├─ EProjectAction / ALL_ACTIONS / DEFAULT_ROLES       (derivados, nunca escritos à mão)
   ├─ GET /workspaces/:slug/roles/actions/               (a tela de Funções desenha daqui)
   └─ seedWorkflowRoles + mergeNewActions (no boot)      (ação nova chega às funções gravadas)

Permissão efetiva de uma pessoa =
   função (workflow_roles.permissions, via workflow_role_id ou pelo nível)
 + workspace_members.granted_actions   (concessão por pessoa)
 − workspace_members.revoked_actions   (negação por pessoa; vence tudo)
```

- **Função** = `WorkflowRole` do espaço (7 de sistema + as criadas na tela). O admin edita as ações
  de cada função em _Configurações > Funções e permissões_.
- **Exceção por pessoa** = mesma tela, seção _Exceções por pessoa_: para cada ação, "Da função",
  "Conceder" ou "Negar". Vale no espaço e em TODOS os sistemas dele.
- **Escopo** de cada ação: `project` (lida da associação ao sistema: `requireProjectAction`) ou
  `workspace` (lida da associação ao espaço: `requireWorkspaceAction`). O escopo é informativo para
  a tela; quem decide é o helper que a rota chama.
- **Admin do espaço** recebe toda ação do catálogo, inclusive as que vierem depois. Dentro de um
  sistema, `getProjectOrFail` o eleva a 20 e agora usa a função do espaço dele (antes herdava a
  função baixa gravada no vínculo com o sistema e tomava 403).
- **Sem função gravada** (espaço recém-criado antes do boot): o api-ts cai nos padrões em memória;
  o chat NEGA. As funções agora são gravadas no boot (`seedWorkflowRolesForAllWorkspaces`) e na
  criação do espaço, então isso só acontece em janela de segundos.

## 2. Como adicionar uma ação (uma linha)

1. **Backend: registre a ação** em `ACTION_CATALOG` (`apps/api-ts/src/utils/permissions.ts`):

   ```ts
   MURAL_PUBLICAR: {key: "mural.publicar", label: "Publicar no mural", group: G.ESPACO, scope: "workspace", roles: MEMBRO_E_GESTOR},
   ```

   - `key`: `assunto.verbo`, minúsculo. É o que vai para o banco: NUNCA renomeie depois.
   - `label`: pt-BR, curto, sem travessão (o teste reprova).
   - `group`: um dos `G.*` (ou crie um novo em `G`; a tela cria o grupo sozinha).
   - `roles`: funções de sistema que recebem por padrão. Use as listas prontas (`TODOS`, `OPERAM`,
     `ESCREVEM`, `MEMBRO_E_GESTOR`, `GESTOR`, `SO_ADMIN`) ou uma lista literal. Admin não entra na
     lista: recebe sempre. Na dúvida, `SO_ADMIN` e deixe o admin conceder.

   Pronto: `EProjectAction.MURAL_PUBLICAR` existe, a tela de Funções mostra a caixa com o rótulo, e
   no próximo boot a ação é somada às funções de sistema já gravadas que a têm no padrão, sem
   desfazer o que o admin editou (`mergeNewActions` + coluna `workflow_roles.known_actions`).

2. **Backend: cheque na rota** com o helper, nunca com número:

   ```ts
   import {EProjectAction, requireWorkspaceAction} from "@utils/permission-checks";
   await requireWorkspaceAction(ws.id, user.id, EProjectAction.MURAL_PUBLICAR);       // escopo do espaço
   await requireProjectAction(ws.id, project_id, user.id, EProjectAction.X);           // escopo do sistema
   const {role} = await requireOwnOrAll(ws.id, project_id, user.id, autorId, OWN, ALL); // dono ou todos
   requireRoleAction(role, EProjectAction.ISSUE_PRIORITY);                             // 2ª ação na mesma rota
   if (await hasWorkspaceAction(ws.id, user.id, EProjectAction.X)) { ... }              // só decidir o que mostrar
   ```

   Todos lançam `{status: 403, message: "Sua função não permite esta ação."}` e já aplicam as
   exceções por pessoa.

3. **Frontend: decida o que mostrar** pela mesma chave:

   ```ts
   const { can } = useMyWorkspaceActions(workspaceSlug);          // escopo do espaço
   if (can("mural.publicar")) ...
   const { canDo } = useProjectRolePermissions(projectId);         // escopo do sistema
   ```

   Para ação de ESPAÇO não precisa mexer em `@plane/constants`: a tela de Funções lê o catálogo da
   API e `can` aceita a chave. Para ação de SISTEMA consultada por `canDo`, acrescente a chave em
   `EProjectAction` de `packages/constants/src/project-permissions.ts` (com rótulo e grupo; o teste
   do pacote cobra) e rode o build do dist.

4. **Chat** (`apps/chat-backend`): só se a ação for do chat. Acrescente a chave em `CHAT_ACTION`
   (`src/permissoes.ts`) e use `hasChatAction(slug, userId, CHAT_ACTION.X)`. O teste
   `tests/permissoes-do-chat.test.ts` confere que a chave existe no catálogo do api-ts.

5. **Teste**: acrescente em `apps/api-ts/tests/unit/catalogo-de-acoes.test.ts` quem recebe a ação
   por padrão (`donosDe("mural.publicar")`) e um teste de contrato da rota (403 sem, 2xx com, e com
   concessão por pessoa).

## 3. Trava contra regressão

- `apps/api-ts/tests/unit/arquitetura-permissoes.test.ts` reprova em `src/` qualquer
  `role < 15`, `role >= 20`, `role === 8`, `role: {gte: ...}`, `requireWorkspaceWriter`,
  `requireWorkspaceAdmin`, `requireRoleAdmin` ou `NIVEL_ADMIN`.
- Uso legítimo (não é checagem de acesso) leva o marcador `// permissao-estrutural: <motivo>` na
  linha ou na linha de cima. Hoje: admin do espaço participa de todo sistema, dono exibido no
  cabeçalho, contagens de painel, seleção de quem é avisado.
- `apps/chat-backend/tests/arquitetura-permissoes.test.ts` faz o mesmo no chat.
- Quem edita funções só CONCEDE o que ele mesmo tem (`findActionErrors`), e não edita as próprias
  exceções. Sem isso, quem recebesse "Gerenciar funções" se daria "Configurar o espaço".

## 4. Varredura (estado final)

### apps/api-ts

| Onde                                                                                       | Antes                                             | Agora                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `roles/*` (POST/PATCH/DELETE, transições)                                                  | `requireRoleAdmin` (papel >= 18)                  | `role.manage` (Gestor, admin)                                                                                          |
| `roles` GET `/me/`, `/members/`, PUT `/members/:id/`                                       | não existiam                                      | ações efetivas; exceções por pessoa (`role.manage`)                                                                    |
| `reports/*` (14), `analytics/*` (7)                                                        | `requireWorkspaceWriter` (>= 15)                  | `report.view` (Membro, Gestor, admin)                                                                                  |
| `entity` POST/PATCH/DELETE                                                                 | `requireWorkspaceWriter`                          | `entity.manage`                                                                                                        |
| `webhook/*`, `integration/git`, `integration/slack`                                        | `requireWorkspaceWriter`                          | `integration.manage`                                                                                                   |
| `custom-webhook/*`                                                                         | `role < 20` inline                                | `workspace.settings` (admin)                                                                                           |
| `ai` provedores                                                                            | `requireWorkspaceWriter`                          | `ai.config`                                                                                                            |
| `ia-requisitos` PATCH configuração                                                         | `NIVEL_ADMIN` (20)                                | `workspace.settings`                                                                                                   |
| `invite` (convites do espaço)                                                              | `requireWorkspaceWriter`                          | `workspace.invite`                                                                                                     |
| `invite` (convites de sistema)                                                             | `role < 15`                                       | `member.manage` (Gestor, admin). **Membro perdeu.**                                                                    |
| `workspace` PATCH/DELETE espaço, storage, impressão, reindexar busca                       | `role < 20` / writer                              | `workspace.settings`. **Reindexar: Membro perdeu.**                                                                    |
| `workspace` membros (alterar, remover, redefinir senha)                                    | `role < 20`                                       | `workspace.members` (admin)                                                                                            |
| `workspace` convites POST/PATCH/DELETE                                                     | writer / `role < 15`                              | `workspace.invite` + escopo por espaço (IDOR corrigido no PATCH/DELETE/GET)                                            |
| `workspace` chat-config                                                                    | `role < 20`                                       | `chat.administrar`                                                                                                     |
| `workspace` label-sla                                                                      | `role < 18`                                       | `label.sla` (Gestor, admin)                                                                                            |
| `premium` import-jobs                                                                      | writer                                            | `import.manage`                                                                                                        |
| `premium` issue-types/properties                                                           | writer                                            | `issue.type.manage`                                                                                                    |
| `premium` intakes, deploy-boards                                                           | `role < 15`                                       | `project.settings`                                                                                                     |
| `premium` bulk-update                                                                      | `issue.edit.all`                                  | + `issue.priority` se mandar prioridade, + `state.unrestricted` se mandar etapa (o lote pulava a matriz de transições) |
| `project` PATCH, arquivar/restaurar                                                        | `role < 15`                                       | `project.settings` (Membro, Gestor, admin)                                                                             |
| `project` DELETE                                                                           | `role < 20`                                       | `project.delete` (admin)                                                                                               |
| `project` membros (rotas duplicadas do memberModule)                                       | `role < 15`                                       | `member.manage`                                                                                                        |
| `project` POST (criar sistema)                                                             | **nenhuma** (qualquer membro)                     | `project.create` (Gestor, admin)                                                                                       |
| `project` sync-members                                                                     | `role < 20`                                       | `workspace.members`                                                                                                    |
| `project` lista, `members/me`                                                              | `role >= 20`                                      | estrutural: admin participa de todo sistema                                                                            |
| `state` POST/PATCH/mark-default                                                            | `role < 15`                                       | `state.manage`                                                                                                         |
| `state` DELETE                                                                             | `role < 20`                                       | `state.delete` (admin)                                                                                                 |
| `label`                                                                                    | `role < 15`                                       | `label.manage`                                                                                                         |
| `estimate`                                                                                 | `role < 15`                                       | `estimate.manage`                                                                                                      |
| `intake-work-item` PATCH                                                                   | `role < 5` (qualquer um)                          | `intake.review` ou `intake.create` + `issue.priority` se mudar prioridade. **Visualizador perdeu.**                    |
| `issue` PATCH                                                                              | `issue.edit.*`                                    | + `issue.priority` quando a prioridade MUDA (`isPriorityChange`); transição agora usa a função com exceções            |
| `technical-visit` POST/PATCH/DELETE e vínculos                                             | **só ser do espaço**                              | `visit.manage` (todos menos Visualizador); W08: `visit.manage.all` (Gestor, admin) troca técnico e data, cancela e exclui, o técnico da visita preenche o relatório. Ver `.claude/visitas-tecnicas.md` |
| `audit` consulta/exportação                                                                | `role < 20`                                       | `audit.view` (admin) ou admin da instância                                                                             |
| `plugin` instalar/remover                                                                  | `role < 20`                                       | `plugin.manage`                                                                                                        |
| `portal` contas                                                                            | `requireWorkspaceAdmin`                           | `portal.manage`                                                                                                        |
| `page` travar/arquivar/apagar de outros                                                    | `role >= 20`                                      | `page.manage.all`                                                                                                      |
| `utils/workspace.ts`                                                                       | `requireWorkspaceWriter`, `requireWorkspaceAdmin` | removidos                                                                                                              |
| `utils/workspace.ts` `getProjectOrFail`                                                    | admin mantinha a função baixa do sistema          | admin usa a função do espaço                                                                                           |
| `utils/notifications.ts` (avisa Qualidade)                                                 | `role === 8`                                      | estrutural: escolhe quem é avisado                                                                                     |
| `analytics/advance.ts`, `user`, `workspace` (dono), `instance`                             | contagens / dono exibido                          | estrutural                                                                                                             |
| `instance/*`, `plugin-registry`, `widget`, `plugin-sdk-gateway`, `registry-access`, `auth` | `isInstanceAdmin` / `isSuperuser`                 | legítimo: god mode da instância, fora do espaço                                                                        |

### apps/chat-backend

| Onde                                           | Antes                                      | Agora                             |
| ---------------------------------------------- | ------------------------------------------ | --------------------------------- |
| `papeis.ts` `ehAtendente` / `listarAtendentes` | `role >= 6`                                | `chat.atender` (`listAtendentes`) |
| `podeGerenciar` (transferir, relatórios)       | `role >= 15`                               | `chat.gerenciar`                  |
| `ehAdmin` (fila, robô, avaliação)              | `role >= 20`                               | `chat.administrar`                |
| `config-routes.ts` `isWorkspaceAdmin`          | SQL próprio, `role >= 20`                  | `chat.administrar`                |
| `ws-ticket`                                    | **qualquer conta do Plane, qualquer slug** | `chat.atender` no espaço          |

`papeis.ts` foi removido; a fonte é `src/permissoes.ts` (função gravada + exceções por pessoa, lidas
do banco compartilhado).

### apps/web

| Onde                                                                       | Antes                                                  | Agora                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Tela _Funções e permissões_                                                | grupos/rótulos fixos de `@plane/constants`; só `ADMIN` | catálogo da API; `role.manage`; seção de exceções por pessoa          |
| `use-project-role-permissions`                                             | função por nível                                       | + exceções por pessoa (`/roles/me/`), `canChangePriority`             |
| Seletor de prioridade (detalhe, peek, lista/kanban, planilha, solicitação) | edição geral                                           | desabilitado sem `issue.priority`                                     |
| Chat do atendente `isManager`/`isAdmin`                                    | `allowPermissions([ADMIN, GESTOR])` / `[ADMIN]`        | `chat.gerenciar` / `chat.administrar`                                 |
| Demais `allowPermissions([...])` (~centenas, herdados do Plane)            | papel por nível                                        | **pendente** (ver §7): a API já barra; a tela ainda esconde por nível |

## 5. Ações novas deste lote

`issue.priority` (Gestor, admin; demais por concessão), `chat.atender`, `chat.gerenciar`,
`chat.administrar`, `project.create`, `project.delete`, `state.delete`, `estimate.manage`,
`report.view`, `workspace.invite`, `workspace.members`, `workspace.settings`, `role.manage`,
`audit.view`, `page.manage.all`, `label.sla`, `entity.manage`, `visit.manage`, `issue.type.manage`,
`import.manage`, `integration.manage`, `ai.config`, `plugin.manage`, `portal.manage`.

Depois do lote: `mural.publish` (Gestor, admin; mural de recados da home, ver `.claude/mural.md`).
`posatendimento.record` (Atendimento, Qualidade, Gestor, admin) e `posatendimento.verify`
(Qualidade, Gestor, admin), ver `.claude/pos-atendimento.md`. Helper novo
`requireWorkspaceAnyAction` (qualquer uma das ações, no escopo do espaço).

Os padrões reproduzem o corte por número que cada rota tinha (tabela acima), para nada mudar em
silêncio. Membro e Gestor passam a ter `state.manage`/`project.settings` na matriz (o backend já
deixava, por número).

"Infra" e "administrativo" (permissões por usuário do SAC) **não** viraram ação: o significado exato
não pôde ser conferido no legado (consulta ao MySQL bloqueada). Ver pendências.

## 6. SAC legado: setor → função

- Regra versionada em `apps/api-ts/src/utils/papel-do-setor.ts` (testes em
  `tests/unit/papel-do-setor.test.ts`). O `scripts/migrate-sac.ts` é da implantação (está no
  `.gitignore`); o diff para ele está em `.claude/patches/w02-migrate-sac.patch`.
- Setor sem regra (financeiro, comercial…) → **Atendimento (6)**. Antes era 10, que não existe e
  virava Qualidade pelo arredondamento.
- **Técnico** → Atendimento (registra visita, abre pedido, atende chat). **Representante e
  consultor** → Visualizador (5). Os três entram ATIVOS mesmo com e-mail de fora do domínio.
  "Suporte Técnico" continua fora (são contatos das prefeituras).
- Vínculo usuário × sistema criado com 10 → nível da pessoa pelo setor.
- Bases já migradas: `DATABASE_URL=... bun run scripts/fix-papeis-legado.ts` (idempotente,
  `DRY_RUN=true` relata). Com `REATIVAR_CAMPO=true` + variáveis `MYSQL_*` reativa representante,
  consultor e técnico que estão na ativa no SAC.

## 7. Pendências

1. Representante/consultor: restringir às entidades de cada um (o legado filtrava por carteira).
   Hoje veem todos os chamados dos sistemas a que estão vinculados.
2. "Infra" e "administrativo" do SAC: confirmar o que liberavam e, se fizer sentido, criar ação.
3. Frontend: centenas de `allowPermissions([...])` herdados do Plane seguem por nível. A API já é a
   fonte da verdade; migrar a tela aos poucos para `can("...")`.
4. Contas de campo reativadas usam a senha padrão da migração, como o resto: pedir troca.
5. `@plane/constants` ainda espelha parte do catálogo (`EProjectAction`, `ROLE_PERMISSIONS`) como
   fallback do front; o ideal é o front ler só a API.
6. Outros `enum` herdados do Plane em `packages/constants` (auth, issue) não foram convertidos
   (fora do escopo); `EProjectAction` já é objeto `as const` nos dois lados.
7. `apps/chat-backend`: `bun test` da pasta inteira falha porque `tests/horario-atendimento.test.ts`
   faz `mock.module("@db")` e o mock vaza para os e2e. Rodando cada arquivo, todos passam.
