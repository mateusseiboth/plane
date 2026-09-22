# Portal do cliente: paridade com o `suporte/` legado (W10)

Data: 2026-09-22 · Worker W10. Doc completa do portal: `apps/api-ts/PORTAL.md`.
Legado de referência: `/home/mateusseiboth/dev/php/siteintranet/suporte` (rotas em
`config/routing.json`, `src/Controller/ServiceDesk/*`, `views/ServiceDesk/chamado*.twig`).

## O que entrou

| Legado (Service Desk)                         | Aqui                                                              |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `service-desk-envia-mensagem-chamado`         | `POST /portal/api/solicitacoes/:id/interacoes` (editor rico + anexos) |
| `service-desk-encerrar-chamado`               | `POST /portal/api/solicitacoes/:id/encerrar`                      |
| `service-desk-nova-iterecao` (reabrir)        | `POST /portal/api/solicitacoes/:id/reabrir` (motivo obrigatório)  |
| `service-desk-enviar-avaliacao`               | `POST /portal/api/solicitacoes/:id/avaliacao`                     |
| `service-desk-lista-visitas-tecnicas`         | `GET /portal/api/visitas?situacao=abertas|efetivadas|vencidas`    |
| `service-desk-visita-tecnica-relatorio`       | `GET /portal/api/visitas/:id`                                     |
| contas só por API/script                      | _Configurações > Portal do cliente_ (`portal.manage`)             |
| "abrir chamado" / falar com o suporte         | já era o "Abrir solicitação"; nada novo                           |

## Onde mora cada coisa

- `apps/api-ts/src/modules/portal/regras-do-cliente.ts`: PURO. `readAcoesDoCliente`
  (responder/encerrar/reabrir/avaliar), estado de destino ao reabrir e encerrar, escalas da
  avaliação, texto da interação. A página e a rota usam o mesmo resultado (`acoes`).
- `interacoes.ts`: as quatro ações. `conversa.ts`: marcas dos comentários.
  `avaliacao.ts`: DTO do portal e da equipe. `visitas.ts` (puro) + `visitas-do-cliente.ts`.
  `contas-admin.ts` (puro) + `contas-admin.service.ts`. `index.ts` ficou fino.
- Web: `app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/portal/`,
  `core/components/portal/contas/*` (regras testadas em `portal-conta-rules.test.ts`),
  `core/components/portal/portal-do-chamado.tsx` (no `main-content.tsx` do detalhe),
  `core/services/portal-contas.service.ts`, `core/hooks/use-portal-contas.ts`.

## Decisões (não deduzir de novo)

1. **Sem tabela de mensagem.** O que o cliente escreve é `issue_comments` com
   `external_source = "portal_cliente"`, `external_id` = tipo (`interacao`, `reabertura`,
   `encerramento`), `access = "EXTERNAL"`, `actor_id` nulo. `serializeComment` dá o nome
   "Conta (cliente)" via `issue.portalRequest.account` (entrou no `COMMENT_INCLUDE`).
2. **O portal só mostra o que foi escrito PARA o cliente**: comentários `portal_cliente`,
   `portal_resposta` e `portal_resposta_anterior`. Comentário interno nunca, qualquer que
   seja o `access`. Por isso a equipe ainda não responde "no meio do caminho" (ver pendências).
3. **Encerrar** = estado "Concluído" + resposta da equipe dispensada (marca `portal_resposta`
   / `dispensada`). **Reabrir** = "Em Análise" + a resposta/dispensa vigente vira
   `portal_resposta_anterior` + avaliação vigente ganha `superseded_at`. Assim a fila de
   pendências (consulta derivada de `resposta.ts`) volta a cobrar na próxima conclusão sem
   mexer na consulta.
4. **Mudança de estado do cliente não passa pela matriz de transições** (cliente não tem
   função). Destino fixo e conservador; trilha com `actor_id` nulo. `acompanharSolicitacao`
   e `notifyInteracaoDoCliente` aceitam autor nulo.
5. **Avaliação uma por conclusão**, tabela `portal_evaluations`
   (migration `20260922201000_portal_avaliacao_do_cliente`). Escalas iguais às do SAC.
6. **Visitas: só da entidade da conta.** Conta sem entidade não vê nada. Cancelada nunca.
   Resumo/conclusão só em "Aguardando Assinatura" ou "Concluída".
7. **Redefinir senha na tela**: link por e-mail quando há SMTP (reusa `sendPortalResetLink`
   de `senha.ts`, o mesmo do "esqueci minha senha"), senão senha provisória de 12
   caracteres devolvida UMA vez. O admin pode forçar a provisória (`modo: "provisoria"`).
   `GET portal-accounts` devolve `email_enabled` para a tela saber qual botão ligar (quem
   só tem `portal.manage` não lê `/email-config/`).
8. **Anexo da resposta** leva `attributes.interacao` e conta no limite daquela resposta.

## Pendências

- A equipe responder ao cliente com o chamado ainda aberto (o legado tinha "respondido").
  Hoje só a resposta ao concluir (`portal-answers`) chega ao portal. Caminho natural: uma
  ação no comentário para marcar `portal_resposta` sem exigir conclusão.
- O card "Aberto pelo portal / Avaliação" está no detalhe do chamado (`main-content.tsx`),
  não no peek.
- Relatório agregado das avaliações (média por sistema/atendente): não feito.
- Reabertura pela equipe (tirar de Concluído pelo quadro) não arquiva a avaliação nem a
  resposta; só a reabertura do cliente faz isso.
