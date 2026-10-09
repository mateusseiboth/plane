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
   - `description` (opcional): uma frase curta, sem travessão, que a tela de Funções e o painel de
     exceções mostram abaixo do rótulo. Use quando o rótulo sozinho não diz o efeito de marcar.
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

4. **Chat** (`apps/chat-backend`): só se a ação for do chat. O módulo do chat registra as
   próprias ações em `apps/api-ts/src/utils/acoes-do-chat.ts` (`ACOES_DO_CHAT`, que o
   `ACTION_CATALOG` espalha); é lá que entra a linha, não no `permissions.ts`. Repita a chave em
   `CHAT_ACTION` (`apps/chat-backend/src/permissoes.ts`, o container do chat não leva o api-ts) e
   use `authorizeChat(slug, headers, CHAT_ACTION.X)` na rota (ou `hasChatAction`). O teste
   `tests/permissoes-do-chat.test.ts` reprova se as duas listas divergirem. No web, a chave entra
   em `ACAO_DO_CHAT` (`core/components/chat/permissoes-do-atendimento.ts`). Ver §9.

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
| `workspace` chat-config                                                                    | `role < 20`                                       | `chat.configurar` (era `chat.administrar`, W38)                                                                        |
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
| `page` árvore do espaço (wiki, W11)                                                        | só ser do espaço                                  | `wiki.view` para ler, `wiki.edit` para escrever (ver `.claude/wiki.md`)                                                |
| `utils/workspace.ts`                                                                       | `requireWorkspaceWriter`, `requireWorkspaceAdmin` | removidos                                                                                                              |
| `utils/workspace.ts` `getProjectOrFail`                                                    | admin mantinha a função baixa do sistema          | admin usa a função do espaço                                                                                           |
| `utils/notifications.ts` (avisa Qualidade)                                                 | `role === 8`                                      | estrutural: escolhe quem é avisado                                                                                     |
| `analytics/advance.ts`, `user`, `workspace` (dono), `instance`                             | contagens / dono exibido                          | estrutural                                                                                                             |
| `instance/*`, `plugin-registry`, `widget`, `plugin-sdk-gateway`, `registry-access`, `auth` | `isInstanceAdmin` / `isSuperuser`                 | legítimo: god mode da instância, fora do espaço                                                                        |

### apps/chat-backend

| Onde                                           | Antes                                      | Agora                             |
| ---------------------------------------------- | ------------------------------------------ | --------------------------------- |
| `papeis.ts` `ehAtendente` / `listarAtendentes` | `role >= 6`                                | `chat.atender` (`listAtendentes`) |
| `podeGerenciar` (transferir, relatórios)       | `role >= 15`                               | ações finas (W38, §9)             |
| `ehAdmin` (fila, robô, avaliação)              | `role >= 20`                               | ações finas (W38, §9)             |
| `config-routes.ts` `isWorkspaceAdmin`          | SQL próprio, `role >= 20`                  | `chat.configurar`                 |
| `ws-ticket`                                    | **qualquer conta do Plane, qualquer slug** | `chat.atender` no espaço          |

`papeis.ts` foi removido; a fonte é `src/permissoes.ts` (função gravada + exceções por pessoa, lidas
do banco compartilhado).

### apps/web

| Onde                                                                       | Antes                                                  | Agora                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Tela _Funções e permissões_                                                | grupos/rótulos fixos de `@plane/constants`; só `ADMIN` | catálogo da API; `role.manage`; seção de exceções por pessoa          |
| `use-project-role-permissions`                                             | função por nível                                       | + exceções por pessoa (`/roles/me/`), `canChangePriority`             |
| Seletor de prioridade (detalhe, peek, lista/kanban, planilha, solicitação) | edição geral                                           | desabilitado sem `issue.priority`                                     |
| Chat do atendente `isManager`/`isAdmin`                                    | `allowPermissions([ADMIN, GESTOR])` / `[ADMIN]`        | uma ação por botão (`buildPermissoesDoAtendimento`, W38, §9)          |
| Demais `allowPermissions([...])` (~centenas, herdados do Plane)            | papel por nível                                        | **pendente** (ver §7): a API já barra; a tela ainda esconde por nível |

## 5. Ações novas deste lote

`issue.priority` (Gestor, admin; demais por concessão), `chat.atender`, `chat.gerenciar`,
`chat.administrar`, `project.create`, `project.delete`, `state.delete`, `estimate.manage`,
`report.view`, `workspace.invite`, `workspace.members`, `workspace.settings`, `role.manage`,
`audit.view`, `page.manage.all`, `label.sla`, `entity.manage`, `visit.manage`, `issue.type.manage`,
`import.manage`, `integration.manage`, `ai.config`, `plugin.manage`, `portal.manage`.

Depois do lote: `mural.publish` (Gestor, admin; mural de recados da home, ver `.claude/mural.md`) e
`chat.disparo` (Gestor, admin; disparo em massa no chat, ver `.claude/chat-disparo.md`).

W15: `ouvidoria.read`, `denuncia.read`, `curriculo.read` e `contato.export` (Gestor, admin; ver
`.claude/ouvidoria-denuncia-curriculos.md`). O menu lateral esconde ouvidoria e currículos de quem
não tem a ação (campo `action` do item em `packages/constants/src/workspace.ts`).

W12: `posatendimento.record` (Atendimento, Qualidade, Gestor, admin) e `posatendimento.verify`
(Qualidade, Gestor, admin), ver `.claude/pos-atendimento.md`. Helper novo
`requireWorkspaceAnyAction` (qualquer uma das ações, no escopo do espaço). O campo `action` do
item da sidebar aceita `string | string[]` (qualquer uma libera).

W35: `issue.require_comment_to_move` ("Precisa comentar antes de mudar a etapa", grupo Chamados,
escopo `project`, padrão TODAS as funções). É a primeira ação de **obrigação**: marcada = a pessoa
precisa comentar no chamado antes de mudar a etapa; desmarcada = move sem comentar. Ela não libera
nada, então o padrão marcado não dá poder a ninguém (o Visualizador continua sem mover). As exceções
por pessoa valem nos dois sentidos: "Negar" dispensa a pessoa, "Conceder" obriga quem a função
dispensa. O admin recebe a ação como toda outra; para dispensar um admin, use "Negar" na exceção.
A migração `20261009090000_comentar_antes_de_mover` marcou a ação em todas as funções já gravadas,
inclusive as criadas na tela (que `mergeNewActions` não alcança). Regra e caminhos em
`.claude/workflow.md`.

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

## 8. Trocar a função de alguém (Configurações > Membros)

`/workspaces/:slug/members/:pk/` (GET, PATCH, DELETE) endereça a pessoa pelo **id do usuário**
(`member.id` da listagem), igual a `reset-password` e `freeze`. Nunca pelo `id` da associação.

- `PATCH {role}` grava `workspace_members.role` **e** `workflow_role_id` (a função de sistema do
  mesmo nível), propaga para os vínculos de projeto (`syncFuncaoNosProjetos`) e devolve o membro
  no formato da listagem, mais `workflow_role: {id, key, name, level}`. `role` que não é inteiro
  responde 400 com `errors: [{path: "role", ...}]`.
- Id que não é de um membro do espaço responde **404** no GET, no PATCH e no DELETE. Antes o
  `updateMany` não casava ninguém e a rota devolvia 200 sem gravar: a tela mandava o id da
  associação, mostrava a função nova e, ao recarregar, cada linha voltava para a antiga (W34).
- Serviço: `apps/api-ts/src/modules/workspace/membro-do-espaco.service.ts`. Contrato:
  `tests/contract/troca-de-funcao-do-membro.test.ts` (duas pessoas de mesmo nome, listagem,
  detalhe, `/workspace-members/me/`, `/members/me/`, `/roles/me/`). No web,
  `core/store/member/workspace/workspace-member.store.test.ts`.

## 9. Ações do chat: o módulo registra as dele (W38)

Pedido do dono: as permissões do chat fazem parte da matriz, mas quem as registra é o próprio
módulo do chat, e o admin escolhe por função quem faz cada coisa (ex.: quem transfere).

- **Registro**: `apps/api-ts/src/utils/acoes-do-chat.ts` (`ACOES_DO_CHAT`, grupo "Atendimento
  (chat)", escopo `workspace`, com `description`). `ACTION_CATALOG` faz `...ACOES_DO_CHAT`: o
  catálogo continua uma linha por ação, a tela de Funções as desenha sem mudança.
- **Chat-backend**: `CHAT_ACTION` em `src/permissoes.ts` (mesma lista, conferida por teste). Cada
  rota pede a sua; sem ela, 403 com `detail` em português. A lista de atendimentos usa
  `src/visibilidade.ts` (`buildFiltroDaVisibilidade` e `isSessaoVisivel`, regra única com a da
  transferência do W37).
- **Web**: `core/components/chat/permissoes-do-atendimento.ts` (`buildPermissoesDoAtendimento`,
  `buildAbasDaConfiguracao`) decide os botões e as abas da configuração pelo `can` de
  `useMyWorkspaceActions`.

| Ação                    | Rótulo                              | Padrão (além do admin)                       | O que libera                                                                                   |
| ----------------------- | ----------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `chat.atender`          | Atender no chat                     | Atendimento, Qualidade, TI, Membro, Gestor   | conectar (ticket do WS), aparecer nas listas, assumir, responder, reenviar                     |
| `chat.pausar`           | Pausar atendimentos                 | Atendimento, Qualidade, TI, Membro, Gestor   | pausar e retomar a conversa e o alerta de cliente sem resposta                                 |
| `chat.encerrar`         | Encerrar atendimentos               | Atendimento, Qualidade, TI, Membro, Gestor   | encerrar (REST e `agent.close` do WS)                                                          |
| `chat.abrir_chamado`    | Abrir chamado pela conversa         | Atendimento, Qualidade, TI, Membro, Gestor   | `POST .../inbox-issues/from-chat/` (api-ts, junto com `intake.create`) e o vínculo no chat      |
| `chat.transferir`       | Transferir atendimentos             | Membro, Gestor                               | `POST .../sessions/:id/transfer/`                                                              |
| `chat.ver_todas`        | Ver conversas de outros atendentes  | Membro, Gestor                               | conversas dos outros na lista (inclusive encerradas), gerenciador, ligações dos outros, original de mensagem apagada e versões editadas |
| `chat.ver_fila`         | Ver a fila e o robô                 | nenhuma                                      | conversas `bot` e `queued` na lista (abas "Na fila" e "Bot")                                   |
| `chat.relatorios`       | Ver relatórios do chat              | Membro, Gestor                               | painel, monitor ao vivo, avaliações por atendente, prazos, atendimentos, registros, ligações   |
| `chat.ver_avaliacao`    | Ver a avaliação do cliente          | nenhuma                                      | nota e comentário do cliente na lista, no histórico, na transcrição (e impressão) e na resposta da transferência; bloco "Avaliação" da conversa (W42) |
| `chat.disparo`          | Disparar mensagens em massa         | Gestor                                       | `/disparo/*`                                                                                   |
| `chat.configurar`       | Configurar o chat                   | nenhuma                                      | robô, menu, filas, fluxos, horários, feriados, encerramento, atendentes, WhatsApp, telefonia, link de integrações em Links úteis, `PATCH /chat-config/` |
| `chat.frases_do_espaco` | Editar as frases prontas do espaço  | nenhuma                                      | `/config/frases/*` e a aba Frases                                                              |

Os padrões reproduzem o corte de antes (`chat.atender` = OPERAM; `chat.gerenciar` = Membro e
Gestor; `chat.administrar` = só admin), então nada mudou em silêncio.

**Migração** `apps/api-ts/prisma/migrations/20261009120000_acoes_finas_do_chat` (idempotente),
em toda função gravada (de sistema e criada na tela) e nas exceções por pessoa:

- `chat.atender` ganha `chat.pausar`, `chat.encerrar`, `chat.abrir_chamado` (vinham juntos);
- `chat.gerenciar` vira `chat.transferir`, `chat.relatorios`, `chat.ver_todas`;
- `chat.administrar` vira todas as ações do chat;
- na NEGAÇÃO por pessoa: negar `chat.administrar` vira negar `chat.ver_fila`, `chat.configurar`,
  `chat.frases_do_espaco` (o que só ela dava); as outras duas, como acima;
- as legadas saem; `known_actions` recebe as chaves novas (senão o boot, via `mergeNewActions`,
  devolveria a ação às funções de sistema de onde o admin a tirou).

Contrato: `apps/api-ts/tests/contract/conversao-das-acoes-do-chat.test.ts` (grava função com as
legadas, roda o SQL do arquivo, lê pela API). Catálogo: `tests/unit/acoes-do-chat.test.ts`.
Chat: `tests/permissoes-do-chat-rotas.db.test.ts` (cada rota recusa sem a ação e passa com ela),
`tests/permissoes-do-chat.e2e.test.ts` (transferir, lista, avaliação, `agent.close`),
`tests/visibilidade-da-lista.test.ts`. Web: `permissoes-do-atendimento.test.ts` e `cabecalho-da-lista.test.ts`
(menu "Mais ações": gerenciador por `chat.ver_todas`, dashboard por `chat.relatorios`, configurações
por `chat.configurar` ou `chat.frases_do_espaco`).

**Ver a avaliação do cliente (W42).** Pedido do dono: "às vezes não queremos que o atendente veja
a avaliação que recebeu para não gerar vingança em atendimentos posteriores". A nota saía com
`chat.configurar`; agora tem ação própria, `chat.ver_avaliacao` (padrão: só o admin). A migração
`apps/api-ts/prisma/migrations/20261009140000_ver_avaliacao_do_chat` (idempotente) a deu a toda
função com `chat.configurar` e repetiu nas exceções por pessoa a concessão e a negação de
`chat.configurar`: ninguém ganhou nem perdeu a nota no deploy. `known_actions` não muda: o boot
(`mergeNewActions`) soma a ação à função de sistema do admin. O relatório de avaliações por
atendente continua em `chat.relatorios` (pedir as duas tiraria o relatório de Membro e Gestor, que
o têm por padrão). No WhatsApp a resposta à pesquisa deixou de virar mensagem da conversa. Contrato:
`tests/contract/conversao-da-avaliacao-do-chat.test.ts`; chat: `tests/permissoes-do-chat.e2e.test.ts`
(lista, histórico, transcrição, transferência, admin), `tests/zapi-webhook.db.test.ts` e
`tests/avaliacao-do-cliente.test.ts`; web: `permissoes-do-atendimento.test.ts` e
`core/components/print/documents/campos-da-avaliacao.test.ts`.

**Diferença de comportamento** (de propósito): `GET /dashboard/` do chat não conferia nada além de
login; agora pede `chat.relatorios`. Quem tem `chat.ver_todas` (Membro e Gestor por padrão) passa
a ver, na própria lista, as conversas atribuídas aos outros; antes só as via pelo gerenciador.
