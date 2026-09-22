# Correções W01: visitas do SAC, relatório de visitas, plugins e gateways de extensão

Branch `worktree-agent-afd286d461e9dcff1` (base `preview` em `03b0244e7`).

## 1. Visitas migradas com status errado

**Problema.** O importador (`scripts/migrate-sac.ts`, fora do git) gravava
`visita_situacao === 1 ? 1 : 0`. No Plane o 1 é "Em Andamento", então toda visita concluída
no SAC aparecia em andamento. O `WHERE visita_status = 1` deixava de fora as canceladas.

**Mapeamento** (conferido no PHP legado: `sac_visitas.php`, `criaRelatorioVisita.php`,
`includes/funcoesAjax.php` case 11):

| Legado                          | Plane                                         |
| ------------------------------- | --------------------------------------------- |
| `visita_status = 0` (cancelada) | `CANCELADA` (5), qualquer que seja a situação |
| `visita_situacao = 0`           | `AGENDADA` (0)                                |
| `visita_situacao = 1`           | `CONCLUIDA` (4)                               |
| situação desconhecida ou nula   | `AGENDADA` (0)                                |

- `src/modules/technical-visit/visit-status.ts`: `VISIT_STATUS` (`as const`), rótulos e
  `getVisitStatusLabel`. É a fonte única da rota, do relatório e do importador.
- `src/modules/technical-visit/legacy-visit-status.ts`: `mapLegacyVisitStatus`,
  `getLegacyImportStatusV1` (o que o importador antigo gravou), `planVisitStatusCorrections`
  e `LEGACY_VISITA_STATUS_SQL` (`v.visita_status IN (0, 1)`).
- `scripts/fix-legacy-visit-status.ts`: correção de bases já migradas. Lê
  `visita_id, visita_situacao, visita_status` do MySQL (`MYSQL_HOST/PORT/USER/PASS/DB`, mesmo
  padrão dos outros scripts), agrupa por (status antigo, status certo) e faz `updateMany` por
  `legacyId` com `status = <o que o importador antigo gravou>`. Visita já corrigida ou alterada
  pela tela fica como está, então rodar de novo não muda nada. `DRY_RUN=true` só conta.
  Rodar de `apps/api-ts` (o Bun lê os aliases do `bunfig.toml`):

  ```bash
  DATABASE_URL=... WORKSPACE_SLUG=quality DRY_RUN=true bun run scripts/fix-legacy-visit-status.ts
  ```

  Conferido contra o MySQL real (892 visitas: 731 concluídas, 130 agendadas, 26+5 canceladas)
  num workspace de teste: 3 alteradas na primeira passada, 0 na segunda, a visita com status
  mudado pela tela intacta.

- `.claude/patches/w01-migrate-sac.patch`: patch para o `migrate-sac.ts` do checkout principal
  (import do módulo, `visita_status` no SELECT, filtro `IN (0, 1)`, `status: mapLegacyVisitStatus(v)`).
  Aplicar com `git apply .claude/patches/w01-migrate-sac.patch` na raiz. Validado copiando o
  arquivo corrigido para o worktree: carrega e o `migrate-sac-etapas.test.ts` passa (15/15).

**Decisões.** Canceladas nunca foram importadas; o script só corrige as que já existem, e elas
chegam pelo importador corrigido. Linhas com `visita_status` nulo ou fora de 0/1 continuam fora
da importação (sem regra conhecida para elas). Reexecutar o importador corrigido sobrescreve o
status de visitas já migradas, como já fazia com os demais campos.

## 2. Relatório de visitas

`GET /workspaces/:slug/technical-visits/report/` contava "concluída" com `status: 1` (Em
Andamento) e calculava a duração média com o mesmo filtro. Agora usa
`VISIT_STATUS.CONCLUIDA` nos dois; "agendada" usa `VISIT_STATUS.AGENDADA`.
Teste: `tests/contract/technical-visit-report.test.ts`.

## 3. Plugin com slug existente

`Plugin.slug` é `@unique` na tabela inteira (inclusive linhas com `deletedAt`) e o upload só
criava. Sem migration: o upload reaproveita o cadastro (`src/utils/plugin-upload.ts`,
strategy map em `plugin-registry/index.ts`).

| Situação              | Resultado                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------- |
| slug novo             | cria, `ACTIVE`, 201                                                                       |
| versão maior          | atualiza o plugin + grava `PluginVersion`, **mantém o status**, 200                       |
| plugin excluído       | reativa o MESMO registro (config e permissões concedidas continuam), qualquer versão, 200 |
| versão igual ou menor | 409 com a versão atual na mensagem                                                        |

- A ação é decidida ANTES de gravar o pacote: versão recusada não sobrescreve o bundle em uso.
- `PluginVersion` tem uma linha por versão; reenviar uma versão que já existe atualiza a linha.
- Comparação semver número a número (`1.10.0 > 1.9.0`).
- Log de auditoria: `plugin.upload` (cadastro, nome mantido), `plugin.upgrade`, `plugin.reinstall`.
- Web: a lista do admin substitui a linha do plugin atualizado em vez de duplicá-la; mensagem de
  erro padrão em português.

**Decisão.** Atualização mantém o status atual: plugin desativado pelo admin da instância não
volta a ficar ativo com um upload do TI. Reenvio depois de excluir aceita qualquer versão (o
admin pode estar restaurando uma anterior).

## 4. Segredo da ponte de plugins

`PLUGIN_BRIDGE_SECRET` não tem mais valor padrão (`plugin-sdk-gateway/bridge-secret.ts`). Sem a
variável, `ALL /plugin-sdk/backend/*` responde 503 ("A integração deste plugin está
indisponível. Avise o administrador do sistema.") e loga
`[plugin-sdk] PLUGIN_BRIDGE_SECRET não configurado`. Documentado no README, em
`apps/api-ts/.env.example` e passado no `docker-compose-local.yml`. Conferido: com a variável o
proxy segue para o backend (502 com backend fora do ar); sem ela, 503.

## 5. Gateways sem checagem de membro

`/plugin-sdk` e `/widget-sdk`:

- Toda rota de dados exige `workspace_slug` (400 "Informe o workspace_slug.") e membro ativo
  (403). `src/utils/sdk-gateway-scope.ts`.
- Chamado (worker-items, actions, stats) e triagem ficam presos aos projetos de que o usuário é
  membro ativo: o recorte da listagem `GET /workspaces/:slug/issues/`. No core não há recorte
  por papel além disso (ver comentário em `utils/permissions.ts`: quem participa do projeto vê
  todos os chamados). O helper é `findMemberProjectIds` em `utils/workspace.ts`.
- Busca por id fora do escopo responde 404. `/stats/entity/:id` conta só chamados visíveis.
- `/users` e `/users/:id` só enxergam membros ativos do workspace. `/users/me` continua sem
  workspace (dado do próprio usuário).
- Config de workspace (GET/PUT), `/me/permissions` e o proxy de backend checam membro quando
  recebem workspace. O proxy não assina mais `X-Plugin-Workspace` de workspace alheio.
- Consultas unificadas em `src/utils/sdk-gateway-data.ts` (antes duplicadas nos dois gateways).
  O contrato de entidade continua diferente por gateway (o de plugin expõe ids externos).
- O filtro `status` de `/intakes` foi removido: `Intake` não tem essa coluna e o Prisma respondia 500.

**Bug encontrado no caminho.** Os dois gateways usavam `.derive({ as: "global" })`. O do widget,
montado antes, vazava para o gateway de plugin: TODA rota de `/plugin-sdk` respondia 400
"Cabeçalho X-Widget-Id ausente.". Passou para `as: "scoped"` (vale só para as rotas do próprio
gateway). O comentário em `src/index.ts` sobre montar os gateways por último continua válido e
não foi mexido; agora é só precaução.

## 6. SDK: workspace em toda chamada

`initializeSDK({ baseUrl, pluginId, workspaceSlug })` (e o equivalente do widget). O SDK
acrescenta `workspace_slug` a toda chamada ao gateway, a menos que a chamada informe outro.
`sdk.config.get()` sem escopo deixou de receber 400. `permissions.list()` sem argumento usa o
workspace aberto. O host passa o workspace da rota em `dynamic-plugin.tsx` e
`dynamic-widget.tsx`. `sdk.backend.*` não recebe o parâmetro automático (o plugin continua
mandando `?workspace_slug=` quando quer que o proxy assine o workspace).

Os consumidores usam o `dist/` dos pacotes (fora do git): depois do merge, rodar
`bun run build` em `packages/plugin-sdk` e `packages/widget-sdk`.

## Testes novos

- `apps/api-ts/tests/unit/visit-status.test.ts`, `plugin-upload.test.ts`, `sdk-gateway-scope.test.ts`
- `apps/api-ts/tests/contract/technical-visit-report.test.ts`, `plugin-upload.test.ts`,
  `sdk-gateway-scope.test.ts` (60 casos, os dois gateways)
- `packages/plugin-sdk/tests/workspace-slug.test.ts`, `packages/widget-sdk/tests/workspace-slug.test.ts`
  (`bun test`; script `test` adicionado aos dois pacotes)

## Pendências

- Aplicar `.claude/patches/w01-migrate-sac.patch` no checkout principal e rodar
  `fix-legacy-visit-status.ts` na base de produção (primeiro com `DRY_RUN=true`).
- `workspace/index.ts` ainda repete a consulta de projetos do membro em vários lugares; dá para
  trocar por `findMemberProjectIds` numa passada própria (arquivo compartilhado, fora do escopo).
- Widget não tem slug: o upload só recusa nome+versão repetidos e cria um registro novo a cada
  versão (sem atualização nem recusa de versão menor). Não mexido, fora do escopo.
- Plugins de terceiros que chamam o gateway sem passar pelo `initializeSDK` do host precisam
  mandar `workspace_slug`.
