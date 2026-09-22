# "Seu trabalho": trilha de atividades e rótulos da tela

Tela `/:slug/profile/:userId` (abas Resumo, Atribuído, Criado, Inscrito, Atividade).
Este documento explica o que quebrou nela e onde cada peça mora hoje.

## 1. O defeito de origem: endpoint devolvia o objeto cru do Prisma

`GET /api/v1/workspaces/:slug/user-activity/:user_id/`
(`apps/api-ts/src/modules/workspace/index.ts`) fazia `prisma.issueActivity.findMany`
e devolvia o resultado direto. O frontend tipa a trilha em **snake_case**
(`IIssueActivity`, `packages/types/src/issues.ts`), então tudo chegava `undefined`
sem erro nenhum. É o mesmo defeito sistêmico descrito na memória
`api-snake-case-contract`.

O que a tela perdia:

| Campo esperado | O que chegava | Sintoma |
| --- | --- | --- |
| `actor_detail` | nada | avatar "?" e nome do autor em branco em TODA linha |
| `new_value` / `old_value` | `newValue` / `oldValue` | "definiu o estado como" sem o estado |
| `new_value` do prazo | idem | toda mudança de prazo virava "removeu a data de entrega" |
| `issue_detail` / `project_detail` | nada | o link do chamado virava "um chamado" |
| `workspace_detail` | nada | link do autor apontava para `/undefined/profile/undefined` |
| `total_pages` / `count` | nada | o botão "Carregar mais" da aba Atividade nunca aparecia |

### Onde está a correção

`apps/api-ts/src/utils/trilha.ts` — serializer único da trilha:

- `ATIVIDADE_INCLUDE`: traz o chamado (nome e `sequence_id`) para o link da frase.
- `readReferenciasDaTrilha`: carrega autor e projeto **em lote**. `IssueActivity` NÃO
  tem relação com `User` nem com `Project` no schema (só guarda os ids), então
  resolver linha a linha seria N+1.
- `serializeAtividade` / `serializeTrilha`: a forma `IIssueActivity`.
- `withoutMarcadorInterno`: filtro Prisma que tira os marcadores internos da trilha.

**Campo novo na trilha entra aqui e no mapa de frases do frontend** (§3), senão a
linha aparece em branco.

## 2. Marcadores internos não são atividade de usuário

`portal_resposta` (resposta ao cliente dispensada) e `intake_replica` (idempotência
da réplica para a solicitação) existem para o sistema se reencontrar. Não têm frase,
e na tela saíam como uma linha só com o avatar. Ficam de fora da listagem pelo
`withoutMarcadorInterno`.

## 3. Frontend: campo da trilha → frase

`apps/web/core/components/core/activity-fields.ts` (puro, com teste ao lado):

- `readActivityField`: normaliza o campo. Linha sem campo é a criação do chamado; a
  estimativa é gravada com o TIPO no nome (`estimate_points`, `estimate_categories`)
  e aponta para a mesma frase de `estimate_point`.
- `hasFraseDoCampo`: o mapa de frases tem texto para este campo?

`apps/web/core/components/core/activity.tsx` mantém o mapa `activityDetails` (uma
strategy por campo) e exporta `hasActivityMessage`. As duas listas da tela
(`profile/overview/activity.tsx` e `profile/activity/activity-list.tsx`) filtram por
ele: **melhor não listar do que listar em branco**.

Frases que dependiam de valor que a trilha não guarda:

- `assignees` e `labels` são gravados só como "a lista mudou" (sem quem entrou ou
  saiu). Quando `old_value` e `new_value` estão vazios, a frase vira "atualizou os
  responsáveis" / "atualizou as etiquetas" em vez de "removeu o responsável" seguido
  de nada.

## 4. Rótulos em português

- **Prioridade**: a trilha e a API guardam o valor cru (`low`, `high`). O rótulo sai
  de `readPriorityTranslationKey` (`packages/constants/src/issue/common.ts`), fonte
  única usada pelo gráfico "Chamados por prioridade" e pela frase da trilha
  (`PriorityLabel`). O valor que a API usa NÃO muda.
- `issue.priority.none` foi criado como "Nenhuma": `common.none` é "Nenhum", e
  prioridade é substantivo feminino.
- **Estado**: `STATE_GROUPS[...].label` (`packages/constants/src/state.ts`) já está em
  português. A "Carga de trabalho" tinha dois casos escritos à mão em inglês ("Not
  started", "Working on") que sobrescreviam o rótulo; o gráfico "Chamados por estado"
  usava `capitalizeFirstLetter(state_group)`, que devolvia o grupo cru.
- "You" e "created"/"Commented" viraram `common.you`, `activity.created_work_item` e
  `activity.commented` (`packages/i18n/src/locales/{pt-BR,en}/common.json`).

## 5. Testes

- Contrato: `apps/api-ts/tests/contract/trilha-do-perfil.test.ts` (autor, valores,
  chamado/projeto/espaço, forma snake_case, marcador interno fora).
- Puro: `apps/web/core/components/core/activity-fields.test.ts`.

## 6. Pendente (fora deste conserto)

- A trilha ainda não grava QUEM entrou ou saiu em `assignees`/`labels`. Gravar
  `old_value`/`new_value` + identificador em `apps/api-ts/src/modules/issue/index.ts`
  deixaria a frase completa ("adicionou o responsável Fulano").
- `GET .../issues/:id/activities/` (usado só por teste) e o feed `/history/` do
  chamado continuam com serialização própria; quando alguém mexer neles, o lugar
  certo é `@utils/trilha`.
- `apps/web/core/components/profile/activity/activity-list.tsx` mostra "Avião" como
  autor do arquivamento automático. É a marca do fork, não texto em inglês; quem
  cuidar da marca decide o nome.
