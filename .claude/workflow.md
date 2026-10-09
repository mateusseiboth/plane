# Fluxo do chamado: comentário antes de mudar a etapa

Pedido do dono do produto: ninguém movimenta um chamado sem deixar registro do
porquê. Desde o W35 é uma PERMISSÃO por função: "Precisa comentar antes de mudar
a etapa" (`issue.require_comment_to_move`, grupo Chamados em _Configurações >
Funções e permissões_). Marcada, a pessoa comenta antes; desmarcada, não precisa. Não é modal nem campo extra: a pessoa só precisa ter **comentado no
chamado DEPOIS da última mudança de etapa** (ou depois da criação, se ele nunca
mudou).

## A regra

`isMovimentacaoLiberada({ultimaMudancaDeEtapaEm, ultimoComentarioDoUsuarioEm, criadoEm})`
em `apps/api-ts/src/modules/issue/movimentacao.rules.ts` (função pura).

- Referência = última atividade `field = "state"` em `issue_activities`; sem
  nenhuma, a criação do chamado.
- Libera só se o último comentário **da própria pessoa** (`issue_comments.actor_id`,
  não apagado) for **estritamente depois** da referência. O comentário que liberou
  uma mudança não libera a próxima.
- Recusa: **400** com `{ detail, errors: [{ path: "state_id", message: "Comente no chamado antes de mudar a etapa." }] }`.

## Quem precisa comentar

`isComentarioExigido({credencial, role})` (mesmo arquivo): só exige quando as
duas coisas valem.

- Credencial `"sessao"` (gente na tela). `"chave-de-api"` é sempre isenta.
- A função efetiva da pessoa NO SISTEMA DO CHAMADO tem a ação
  `issue.require_comment_to_move`. É a mesma `role` que a rota já resolveu para
  checar edição (`requireOwnOrAll` no PATCH, `requireProjectAction` no lote), com
  as exceções por pessoa aplicadas: "Negar" dispensa a pessoa, "Conceder" obriga
  quem a função dispensa.
- A ação vem marcada para todas as funções (e a migração
  `20261009090000_comentar_antes_de_mover` marcou as já gravadas, inclusive as
  criadas na tela). Nada muda até alguém desmarcar.

Camadas: `movimentacao.dao.ts` lê os três marcos, `movimentacao.service.ts`
(`requireComentarioAntesDeMover({issueIds, userId, credencial, role})`) aplica
a regra a um ou vários chamados; com a ação desmarcada nem consulta o banco. Quem
chama passa só os chamados que de fato TROCAM de etapa: PATCH com o mesmo
`state_id` (o formulário reenvia tudo) não é movimentação.

## Onde vale

| Caminho | Rota | Vale? |
| --- | --- | --- |
| Arrastar no quadro, seletor de etapa do cartão | `PATCH .../issues/:id/` | sim, se a função tem a ação |
| Seletor de etapa na tela/espiada do chamado | `PATCH .../issues/:id/` | sim, se a função tem a ação |
| Concluir pela home (checkbox de Tarefas) | `PATCH .../issues/:id/` | sim, se a função tem a ação |
| Ação em lote | `POST .../issues/bulk-update/` | sim, se a função tem a ação; um chamado sem comentário recusa o lote inteiro |
| Criar o chamado (já numa etapa) | `POST .../issues/` | não |
| Aceite/recusa na triagem | `PATCH .../inbox-issues/:id/` | não |
| Chamado aberto pelo chat, portal do cliente | rotas próprias | não |
| Script ou integração com `X-Api-Key` | qualquer | não |

A distinção pessoa x script vem do `authPlugin` (`@middleware/auth`): além de
`user`, ele entrega `credencial`, `"sessao"` (cookie ou Bearer, gente na tela) ou
`"chave-de-api"` (`X-Api-Key`). Os testes de contrato antigos usam chave de API e
por isso continuam movendo sem comentar; o teste desta regra
(`tests/contract/comentario-antes-de-mover.test.ts`) entra por sessão. Marcar e
desmarcar por função e por pessoa: `tests/contract/permissao-comentar-antes-de-mover.test.ts`.

## Na tela

- Quadro (arrastar): a loja desfaz a mudança otimista e o cartão volta para a
  coluna de antes; o aviso mostra o `detail` da API (`use-group-dragndrop.ts`).
- Seletor de etapa do cartão (`all-properties.tsx`): mesmo aviso.
- Tela e espiada do chamado: `IssueStateField` mostra a mensagem junto do
  seletor (via `onFieldError` de `TIssueOperations.update`) além do aviso.
- Home: o aviso "Chamado não concluído" mostra o `detail`.
