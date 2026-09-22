# Registro de ligações do FreePBX

Data: 2026-09-22 · Worker W06. Substitui o módulo "tickets" da intranet legada: os
tickets morrem e viram parte do atendimento. O FreePBX chama uma API do chat que
registra a ligação; o atendente só marca quem era (se o telefone não identificou),
qual sistema queria suporte e um texto descritivo. A partir da ligação pode abrir
um chamado.

## 1. Modelo

```
chat_sessions (channel = "phone")        ← caixa, protocolo, histórico, relatórios
   └─ chat_ligacoes (1:1, session_id)    ← dados do PBX + conclusão + chamado vinculado
chat_telefonia_config (por espaço)       ← hash SHA-256 do token + 4 últimos caracteres
chat_ramais (espaço, ramal → user_id)    ← de quem é a ligação atendida no ramal
```

- `chat_ligacoes.call_id` é único por espaço (`workspace_id` = slug): é o que torna a
  entrada idempotente.
- Sistema atendido fica em `chat_sessions.project_id/identifier/name` (o mesmo campo
  da conversa). Quem ligou fica em `chat_sessions.entity_contact_id` (Responsáveis,
  `entity_contacts`) e `client_name`/`client_phone`.
- O chamado vinculado fica em `chat_ligacoes.ticket_kind` (`intake`/`issue`),
  `ticket_id`, `ticket_project_id`, `ticket_label` (`SIST-42`). Sem FK: `issues` é do
  api-ts.
- Migração: `apps/chat-backend/prisma/sql/0012_ligacoes.sql` (também cria o índice
  `chat_sessions(workspace_id, channel)`).

### Situação em que a ligação entra (`src/ligacoes/situacao-inicial.ts`)

| Status do PBX | Ramal conhecido                     | Situação                                                     |
| ------------- | ----------------------------------- | ------------------------------------------------------------ |
| `answered`    | sim (e a pessoa tem `chat.atender`) | `active`, com o atendente do ramal                           |
| `answered`    | não                                 | `queued`, sem atendente (espera "Assumir")                   |
| `missed`      | qualquer                            | `closed` (fim = `ended_at` ou agora); guarda o dono do ramal |

Ligação **não** entra em: SLA de primeira resposta (`reports.ts slaReport` e o alerta
de `timers.ts checkSla`), timer de inatividade (`checkIdle`) e fila automática
(`routeQueuedSession` / `drainQueuesForWorkspace`). Tudo pelo `WITHOUT_PHONE` /
`isPhoneSession` de `src/canais.ts`. Ao assumir, o aviso "fulano entrou no
atendimento" para o cliente não é enviado (não há cliente do outro lado); o evento
interno continua.

## 2. Contrato da API (chat-backend)

Base: a mesma do chat (`/chat-api` atrás do nginx; `http://localhost:8002` em dev).
Erros de validação: `400 { detail, errors: [{ path, message }] }`, com `path` no nome
do campo do formulário (`descricao`, `ramais[1].extension`).

### 2.1 Entrada do PBX

`POST /workspaces/:slug/telefonia/ligacoes/`

Autenticação: `Authorization: Bearer <token>` **ou** `X-Api-Token: <token>`. Token
ausente, errado ou revogado: `401 { detail: "Token de serviço inválido." }`.

| Campo           | Tipo                                                                                 | Obrigatório | Observação                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `call_id`       | string (até 128)                                                                     | sim         | `UNIQUEID`/`linkedid` do Asterisk. Mesmo valor = mesma ligação.                                                 |
| `caller`        | string                                                                               | não         | Número de origem, em qualquer formato. Casado com `entity_contacts.phone_digits` (com e sem DDI e nono dígito). |
| `extension`     | string/número                                                                        | não         | Ramal que atendeu (ou tocou).                                                                                   |
| `started_at`    | ISO 8601, `AAAA-MM-DD HH:MM:SS` ou epoch em segundos                                 | não         | Prefira epoch (`${CDR(start,u)}`): o formato sem fuso é lido no fuso do servidor do chat.                       |
| `ended_at`      | idem                                                                                 | não         |                                                                                                                 |
| `duration_sec`  | inteiro ≥ 0                                                                          | não         | `billsec`.                                                                                                      |
| `recording_url` | URL http(s)                                                                          | não         | Link para ouvir a gravação (o chat não copia o arquivo).                                                        |
| `status`        | `answered`/`missed` ou disposição do CDR (`ANSWERED`, `NO ANSWER`, `BUSY`, `FAILED`) | não         | Padrão `answered`.                                                                                              |

Respostas:

- `201` primeiro envio do `call_id`: cria a sessão + ligação, grava o evento "Ligação
  recebida de X no ramal Y." e, se houver atendente, manda `session.assigned` a ele
  pelo WS.
- `200` reenvio do mesmo `call_id`: atualiza **só** `ended_at`, `duration_sec` e
  `recording_url` (os que vierem). Dois envios simultâneos caem no índice único e o
  segundo vira atualização.

Corpo das duas: `{ session: <sessão serializada>, ligacao: <ligação> }`.

```jsonc
// ligacao
{
  "id": "uuid",
  "session_id": "uuid",
  "call_id": "1695390000.123",
  "caller": "(67) 98881-0001",
  "extension": "201",
  "status": "answered",
  "started_at": "2026-09-22T13:00:00.000Z",
  "ended_at": null,
  "duration_sec": null,
  "recording_url": null,
  "descricao": null,
  "concluded_by_id": null,
  "concluded_at": null,
  "ticket_kind": null,
  "ticket_id": null,
  "ticket_project_id": null,
  "ticket_label": null,
  "created_at": "...",
}
```

### 2.2 Atendente (`chat.atender`)

Visibilidade igual à da lista de atendimentos: quem tem `chat.administrar` vê todas;
os demais, as suas e as sem atendente. Ligação de outra pessoa responde 404.

| Rota                                                              | Corpo                                     | Resposta                                                                           |
| ----------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /workspaces/:slug/ligacoes/:sessionId/`                      |                                           | `{ session, ligacao, responsavel }` (`responsavel` traz `entity_id`/`entity_name`) |
| `POST .../assumir/`                                               |                                           | detalhe; `409` se já é de outra pessoa ou está encerrada                           |
| `POST .../concluir/`                                              | `{ project_id, descricao, contact? }`     | detalhe; `409` se já concluída                                                     |
| `POST .../chamado/`                                               | `{ kind: "intake" \| "issue", issue_id }` | detalhe; `404` se o chamado não é do espaço                                        |
| `GET /workspaces/:slug/sessions/:sessionId/historico-do-cliente/` |                                           | `{ results: [sessão + attendant_name + ligacao] }`, até 50, mais novas primeiro    |

Concluir:

- `project_id` (sistema) e `descricao` são obrigatórios.
- `contact` é obrigatório só quando o telefone não identificou ninguém
  (`entity_contact_id` nulo). Forma igual à do `agent.close`: `{ contact_id }` para um
  contato existente, ou `{ name, email?, phone?, entity_id?, type_id? }` para cadastrar
  (passa por `registrarEncerramento` → `salvarResponsavel`).
- Encerra a sessão (`closed_at` mantém o de ligação perdida), grava quem concluiu e
  quando, e o evento "Ligação concluída por Fulano.". Ligação sem atendente passa a ser
  de quem concluiu.

Chamado: o front cria a solicitação pela rota que já existe no api-ts
(`POST /api/workspaces/:slug/projects/:project_id/inbox-issues/`, com `name`,
`description_html` e `entity_id` já preenchidos) e depois chama `.../chamado/` com o id
devolvido. O chat confere que a issue existe no espaço e grava o número
`IDENTIFICADOR-sequencial`.

Lista: `GET /workspaces/:slug/sessions/?channel=phone` (ligações) ou
`?channel=whatsapp,native` (conversas). Canal desconhecido é ignorado.

### 2.3 Configuração (`chat.administrar`)

| Rota                                               | Corpo                                  | Resposta                                                                                                  |
| -------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /workspaces/:slug/config/telefonia/`          |                                        | `{ has_token, token_last4, updated_at, ramais: [{ id, extension, user_id, name }] }`                      |
| `POST /workspaces/:slug/config/telefonia/token/`   |                                        | `201 { token, token_last4 }`. O token só aparece aqui; o anterior deixa de valer.                         |
| `DELETE /workspaces/:slug/config/telefonia/token/` |                                        | `{ has_token: false }`                                                                                    |
| `PUT /workspaces/:slug/config/telefonia/ramais/`   | `{ ramais: [{ extension, user_id }] }` | configuração; a lista é SUBSTITUÍDA. Ramal vazio/repetido e pessoa sem `chat.atender` voltam em `errors`. |

### 2.4 Relatório (`chat.gerenciar`)

`GET /workspaces/:slug/reports/ligacoes/?days=30` (1 a 365):

```jsonc
{
  "days": 30,
  "total": 12,
  "answered": 10,
  "missed": 2,
  "concluded": 9,
  "by_attendant": [{ "id": "uuid", "name": "Ana", "count": 7, "missed": 1 }],
  "by_entity": [{ "id": "uuid", "name": "Prefeitura X", "count": 5 }],
  "by_system": [{ "id": "uuid", "name": "SIART", "count": 6 }],
}
```

Linhas sem atendente/entidade/sistema vêm com `id: null` e nome "Sem …".

## 3. Exemplo de configuração no FreePBX

1. No Avião: Atendimento → Configurações → **Telefonia**. Gere o token, copie o
   endereço e cadastre os ramais (ramal → atendente).
2. No FreePBX, em `/etc/asterisk/extensions_custom.conf`, um _hangup handler_ nas
   rotas de entrada manda a ligação ao encerrar (dá `Apply Config` depois):

```ini
; Toda ligação que entra pelas rotas de entrada ganha o handler de encerramento.
[from-pstn-custom]
exten => _X.,1,Set(CHANNEL(hangup_handler_push)=aviao-ligacao,s,1)

[aviao-ligacao]
exten => s,1,NoOp(Aviao: registrando ${UNIQUEID})
 ; Ramal que atendeu: "PJSIP/201-0000001a" -> "201".
 same => n,Set(RAMAL=${CUT(CUT(CDR(dstchannel),/,2),-,1)})
 same => n,Set(STATUS=${IF($["${CDR(disposition)}" = "ANSWERED"]?answered:missed)})
 ; Ajuste para onde as gravações ficam publicadas (UCP, nginx, etc.). Vazio = sem gravação.
 same => n,Set(GRAVACAO=${IF($["${MIXMONITOR_FILENAME}" = ""]?:https://pbx.exemplo.gov.br/gravacoes/${CUT(MIXMONITOR_FILENAME,/,-1)})})
 same => n,System(curl -s -m 5 -X POST \
     -H "X-Api-Token: pbx_COLE_O_TOKEN_AQUI" -H "Content-Type: application/json" \
     -d '{"call_id":"${UNIQUEID}","caller":"${CALLERID(num)}","extension":"${RAMAL}","started_at":${CDR(start,u)},"ended_at":${EPOCH},"duration_sec":${CDR(billsec)},"recording_url":"${GRAVACAO}","status":"${STATUS}"}' \
     https://aviao.exemplo.gov.br/chat-api/workspaces/quality/telefonia/ligacoes/ &)
 same => n,Return()
```

- `System(... &)` roda em segundo plano: o PBX não espera o Avião responder.
- Para avisar o atendente **enquanto** a ligação ainda está em curso, mande também um
  POST no atendimento (por exemplo, numa macro de `Dial` com a opção `U()`), só com
  `call_id`, `caller`, `extension` e `started_at`. O POST do encerramento, com o mesmo
  `call_id`, completa fim, duração e gravação (responde 200).
- Teste manual:

```bash
curl -i -X POST https://aviao.exemplo.gov.br/chat-api/workspaces/quality/telefonia/ligacoes/ \
  -H "Authorization: Bearer pbx_..." -H "Content-Type: application/json" \
  -d '{"call_id":"teste-1","caller":"67999990000","extension":"201","status":"answered"}'
```

## 4. Frontend (`apps/web`)

Arquivos novos em `core/components/chat/ligacoes/`:

- `painel-da-ligacao.tsx`: dados do PBX (gravação com player), quem ligou, "Assumir
  ligação", formulário de conclusão (sistema, contato quando não identificado,
  descrição, erros voltando para o campo) e "Abrir chamado" (cria a solicitação no
  api-ts com `entity_id` e vincula).
- `historico-do-cliente.tsx`: conversas e ligações da mesma pessoa, no painel lateral
  de qualquer atendimento.
- `config-de-telefonia.tsx`: aba **Telefonia** da configuração do chat (só com
  `chat.administrar`): endereço, token (mostrado uma vez) e ramais.
- `relatorio-de-ligacoes.tsx`: no dashboard do atendimento.
- `filtro-de-canal.tsx`: filtro Todos / Conversas / Ligações e a marca "Ligação" na
  lista.
- `ligacao-helpers.ts` (+ teste), `use-ligacoes.ts` (SWR), `services/ligacoes.service.ts`.

`attendant-app.tsx` mudou o mínimo: filtro por tipo, marca na lista, painel quando o
canal é `phone`, histórico no painel lateral; para ligação, somem o compositor de
mensagem e os botões "Assumir"/"Encerrar" do chat (as ações ficam no painel).
`chat.service.ts` ganhou `chatRequest` (reaproveitado pelo serviço de ligações) e o
parâmetro `canal` em `listSessions`.

## 5. Decisões e pendências

- **Sem ação nova na matriz.** Receber/assumir/concluir = `chat.atender`; configurar =
  `chat.administrar`; relatório = `chat.gerenciar`. O PBX não é pessoa: entra pelo token
  de serviço do espaço.
- **Ligação sem ramal conhecido fica `queued`**: pela regra da lista, só quem tem
  `chat.administrar` vê fila. O atendente comum só a vê se abrir pelo histórico. Se a
  operação quiser que qualquer atendente veja ligações sem dono, é mudar a regra da
  lista para o canal `phone`.
- **Ligação perdida guarda o dono do ramal** (aparece nos encerrados dele, para retornar).
- O histórico do cliente mostra só o resumo (canal, sistema, atendente, descrição), não
  o conteúdo das conversas, para qualquer atendente.
- Pendência: `modal-de-encerramento.tsx` tem a mesma busca de contato que
  `ligacoes/seletor-de-contato.tsx`. Não foi trocada para não colidir com o W04, que
  mexe no encerramento; trocar quando os dois estiverem no `preview`.
- Pendência: `resolveProject` de `src/index.ts` e `findProjetoDoEspaco` do DAO fazem a
  mesma consulta; unificar quando o `index.ts` estiver livre de trabalho paralelo.
- Pendência: `src/responsaveis.ts` ainda usa verbos em português (`buscar*`, `salvar*`,
  `atualizar*`); renomear junto com o bot quando não houver outro worker no chat.
- Pendência: WS `agent.close` numa sessão `phone` ainda passaria pelo encerramento de
  conversa (mensagem + pesquisa). A tela não oferece esse botão para ligação.
