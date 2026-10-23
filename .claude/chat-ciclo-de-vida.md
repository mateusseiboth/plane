# Chat: ciclo de vida da conversa (W04)

Data: 2026-09-22 · Worker W04. Cobre encerramento classificado, abandono, inatividade, pausa, fim do
dia, webhook Z-API, falha de envio, chamado aberto a partir da conversa e relatórios de atendimento.
Legado consultado: `siteintranet/intranet/` (`popChatAt_encerrachat.php`, `popChatAt_fimchatmot.php`,
`sac_chat_regrasupdate.php`, `chatger/buscaCliAbandonouResp.php`, `zapi/menuRetomarAtendimento.php`,
`zapi/cron.php`, `zapi/receber.php`, `popChatAt_pausachat.php`, `popChatAt_abrechamCria.php`,
`relatorio/chatSemanal*`, `relatorioChatAbandSiste`, `relatorioChatAtendimento`).

## 1. Mapa

```
apps/chat-backend/src/
  ciclo-de-vida/
    abandono.ts            TIPO_ABANDONO (1..5 do SAC), CAUSA_DO_FIM, classifyAbandono, isAbandonado
    encerrar.ts            closeAtendimento: o ÚNICO caminho de encerramento (atendente, cliente,
                           robô, inatividade, pausa vencida, fim do dia)
    encerramento-regras.ts parseCatalogoDeMotivos, validateEncerramento (entidade obrigatória)
    inatividade(-regras).ts  robô/fila (pergunta e fecha em 10+10 min) e em atendimento (1/99)
    pausa(-regras).ts      pausar, retomar, vencer em 3 dias (abandono 4)
    fim-do-dia(-regras).ts corte no horário configurado ou no fim do expediente, no fuso da empresa
    rotas.ts               REST do atendente (chat.encerrar, chat.pausar, chat.abrir_chamado, chat.atender)
  encerramento.ts          closeWithEncerramento: valida, grava classificação e cadastro, encerra
  chamado.ts               linkChamado: só aceita chamado com external_id = id da sessão
  outbound.ts              falha de envio (status failed + send_error) e resendMessage
  webhook/regras.ts        isWebhookAutorizado, isMensagemAntiga (2 dias)
  webhook/zapi.ts          rota do webhook (saiu do index.ts)
  relatorios/atendimentos.ts  aggregateAtendimentos (puro), readPeriodo, buildFiltroDosRegistros
  relatorios/rotas.ts      painel, relatórios e registros (chat.relatorios)
  acesso.ts                authorizeChat: guarda REST pela matriz de ações
  sequencia.ts             runInSequence: timers encerram um por vez (limite da Z-API)
  prisma/sql/0013_ciclo_de_vida.sql

apps/api-ts/src/
  modules/chat-chamado/    POST /workspaces/:slug/projects/:pid/inbox-issues/from-chat/
  utils/intake.ts          createSolicitacao: fonte única do POST /inbox-issues/ e do chat
                           findErrosDaSolicitacao: módulo do sistema e entidade do espaço (422 no campo)

apps/web/core/
  components/chat/modal-de-encerramento.tsx  entidade, motivo, funcionalidade, observação
  components/solicitacao/modal-de-solicitacao.tsx  sistema, título, módulo, entidade, complemento
                                             rico, cliente parado; o mesmo modal pela conversa
                                             (from-chat) e pelo botão "Nova solicitação" (avulsa)
  components/solicitacao/bloco-da-wiki.tsx   "Na wiki" abaixo do complemento: páginas da wiki da
                                             Quality parecidas com título + complemento (600 ms,
                                             3+ palavras) e o botão "Sugerir solução" (IA da
                                             Quality); ver nota abaixo
  components/chat/acoes-da-conversa.tsx      Chamado / link do chamado, Pausar/Retomar, FalhaDeEnvio
  components/chat/relatorios-de-atendimento.tsx  relatórios + registros + impressão (no painel)
  components/chat/aba-de-encerramento.tsx    config: motivos, pergunta 1/99, fim do dia
  hooks/use-chat-atendimento.ts              SWR: motivos, módulos, relatório, registros
```

## 2. Colunas novas (0013)

`chat_sessions`: `entity_id`, `close_reason` (rótulo do motivo, texto, para o histórico não mudar
quando o catálogo mudar), `close_module_id` + `close_module_name` (funcionalidade = módulo do
sistema), `close_note`, `end_kind`, `abandon_type` (1..5), `paused_at`, `issue_id`,
`issue_project_id`, `issue_label`. `chat_messages.send_error`. `chat_bot_config`: `close_reasons`
(catálogo `[{key,label}]`, padrão Acesso, Dúvida, Correção, Melhoria, Senha),
`active_idle_prompt_message`, `end_of_day_enabled` (padrão **false**), `end_of_day_time`,
`end_of_day_message`. `chat_provider_config.webhook_token`.

A migration preenche o histórico do SAC a partir de `flow_state.legacy` (motivo pelo
`serviceType`, observação, `end_kind`). O SAC não guardou o TIPO do abandono: essas conversas ficam
`end_kind = "abandono"` e `abandon_type` nulo ("Não informado" no relatório). O
`scripts/migrate-sac-chat.ts` passou a gravar as mesmas colunas nas próximas importações.

## 3. Regras

**Como terminou** (`end_kind` = causa): `atendente`, `cliente` (respondeu 99), `cliente_saiu`
(fechou o chat do site), `inatividade`, `pausa_vencida`, `fim_do_dia`, `robo`, `abandono` (SAC).

**Tipo de abandono** (`classifyAbandono`), só para `cliente_saiu`, `inatividade` e `pausa_vencida`:

| Situação no fim                            | Tipo                  |
| ------------------------------------------ | --------------------- |
| status `bot` ou `queued`                   | 3 Na fila de espera   |
| em atendimento, atendente nunca escreveu   | 2 Antes de iniciar    |
| cliente fechou o chat com conversa andando | 1 Durante a conversa  |
| pausa passou de 3 dias                     | 4 Não voltou da pausa |
| silêncio depois da pergunta de inatividade | 5 Inatividade         |

Finalizado x abandonado: abandonado = `abandon_type` preenchido OU `end_kind = "abandono"`.

**Encerramento pelo atendente**: entidade obrigatória. Vale a informada, ou a da sessão, ou a do
contato identificado/escolhido. Motivo, se vier, tem de estar no catálogo. Funcionalidade tem de ser
módulo do sistema atendido. Nada é gravado se a validação recusar. A tela exige também o motivo.

**Inatividade em atendimento**: última palavra do atendente há mais de 10 min → robô pergunta
(`active_idle_prompt_message`). 1 continua (aviso ao atendente), 99 encerra (`end_kind = cliente`,
não é abandono), outra coisa repete a pergunta (a mensagem chega ao atendente). Sem resposta em mais
10 min → abandono 5. O atendente voltar a escrever zera a pergunta. Vale para WhatsApp e chat do
site. Ligação (`channel = "phone"`, W06) fica fora de todos os timers.

**Fim do dia**: desligado por padrão (liga em Configurações > Encerramento). Corte = horário
configurado ou, vazio, o fim do último intervalo do expediente do dia. Só WhatsApp, só o que foi
aberto ANTES do corte de hoje: idempotente sem guardar estado, e reiniciar não repete nada.

**Pausa**: faz sentido mesmo com o widget em WebSocket. A conversa do site já sobrevive a recarregar
a página, mas sem pausa a inatividade encerraria em 20 min quem foi buscar um documento. Pausada: fora
da inatividade; o cliente que escreve retoma sozinho; 3 dias sem voltar = abandono 4. Liberada para
qualquer conversa escrita (site e WhatsApp); a aba "Ativas" mostra as pausadas.

**Webhook Z-API**: `webhook_token` é um campo NOVO, separado do `client_token` (que é o token da
conta usado para ENVIAR). Decisão conservadora: usar o `client_token` para validar a entrada
derrubaria o webhook de quem já tem `client_token` configurado e cuja Z-API não manda o cabeçalho.
Com `webhook_token` vazio, aceita tudo (decisão do usuário). Preenchido, exige o valor no cabeçalho
`Client-Token` ou em `?token=` na URL cadastrada na Z-API; comparação em tempo constante.
Mensagem com `momment` de 2 dias ou mais é descartada. Reação vira mensagem do cliente
"Reagiu com 👍" apontando (`reply_to_id`) para a mensagem reagida; figurinha vira imagem; contato
vira texto com nome e telefones; chamada perdida vira aviso do sistema. Reação e chamada perdida
SEM conversa aberta não abrem conversa nova (o robô responderia a quem só ligou). Toda busca de
sessão do webhook filtra `channel = "whatsapp"` para não cair na ligação do W06.

**Falha de envio**: erro da Z-API (ou provedor desligado) marca a mensagem `failed` com o motivo,
avisa o atendente por `message.status` e a tela mostra "Não enviada · Reenviar".

**Chamado a partir da conversa**: o api-ts cria pela mesma `createSolicitacao` do
`POST /inbox-issues/`, com a transcrição (texto ESCAPADO) na descrição, os arquivos da conversa
como anexos (`file_assets` + `issue_attachments`, mesmo caminho do portal), prioridade (`urgent` =
cliente parado), módulo, entidade da conversa e `external_source = "chat"`,
`external_id = <sessão>`. Uma conversa, um chamado (409). Depois a tela chama
`POST /workspaces/:slug/sessions/:id/chamado/` no chat, que confere o `external_id` e guarda o
atalho (`issue_label`), posta "Chamado SIA-42 aberto a partir desta conversa." e o cabeçalho passa
a mostrar o link. Arquivo do WhatsApp (`ext:`) só por https; arquivo do chat vem de
`CHAT_INTERNAL_URL` (padrão `http://chat-backend:8002`). Arquivo que falha é pulado e contado.
A tela NÃO redireciona mais para a triagem: o atendente segue na conversa.

**Wiki no modal de solicitação** (W48, fonte corrigida no W49 em 23/10/2026): a wiki é a **wiki da
Quality** (Wiki.js, `https://wiki.qualitysistemas.inf.br`), consultada pelo serviço **IA da Quality**
(`https://ia.qualitysistemas.inf.br`, repositório InteligenciaArtificial; o SIART usa o mesmo serviço).
NÃO são as páginas do Plane. Enquanto o atendente descreve o problema, `useSugestoesDaWiki` chama
`GET /workspaces/:slug/wiki/sugestoes/?q=&project_id=` (módulo `apps/api-ts/src/modules/wiki-sugestoes/`,
`intake.create`): o texto perde as palavras vazias (`wiki-sugestoes.rules.ts`), vira OU de até 8 termos
COM acento (a busca da wiki distingue "emissão" de "emissao"; palavras soltas são ligadas por E e um relato
longo não acharia nada) e vai para `GET /api/wiki/search` do serviço. Voltam até 5 páginas
`{id, name, trecho, url, sistema}`: `url` é a página pública na wiki da Quality (abre em nova aba),
`sistema` é o primeiro pedaço do `path` (`siart/...`, `Planejar/...`, `web/...`), e o trecho é o `summary`
ou, como ele quase sempre vem vazio, o começo do conteúdo (`GET /api/wiki/document/:id`, ~300 caracteres
de texto puro), ou as tags. Páginas em que algum pedaço do `path` (`siart/...`, `web/SIART/...`) ou alguma
tag é o identificador ou o nome do sistema escolhido sobem (`isPaginaDoSistema`, sem acento e caixa,
sublinhado vale espaço). "Sugerir solução" (sempre visível)
chama `POST .../wiki/sugestoes/resolver/ {texto, paginas}`, que pergunta a `POST /api/ai/query` (a IA da
Quality responde com a base de conhecimento da wiki) citando os títulos das páginas; volta
`{sugestao (até 600 caracteres), paginas_consultadas}`. Cliente HTTP em `clientes/ia-da-quality.ts`
(`IA_DA_QUALITY_URL`, `WIKI_DA_QUALITY_URL`, tetos de 6 s na busca e 30 s na resposta): fora do ar, erro,
tempo estourado ou o erro que o serviço devolve com 200 (`source_info.source = "Error"`) viram `[]` ou
`{sugestao: null, motivo}`; a tela diz "A IA da Quality não respondeu agora." Nada disso bloqueia o envio.
Trilha LGPD só no `resolver/` (o relato inteiro sai para a IA): `entity=page`, `action=export`,
`metadata.servico="wiki-sugestoes"`, `operacao="resolucao"`, tamanho do texto e ids das páginas, nunca o
conteúdo. A busca não grava: saem só até 8 termos, e cada pausa na digitação é uma busca.

**Relatórios** (`chat.relatorios`): período padrão = últimos 7 dias; filtros entidade, sistema,
motivo, atendente. Agregação em memória (uma passada), sem `_count` de relação.

**Auditoria**: troca de visibilidade do atendente grava `audit_logs` com
`entity = "chat_attendant"`, `entity_id = <usuário>`, `action = "update"`.

**Configuração do robô** (`PATCH /config/bot/`) passou a exigir `chat.configurar` (era `chat.administrar`): além das
mensagens, é ali que se liga o encerramento automático do fim do dia.

## 4. Testes

- chat-backend, sem servidor: `ciclo-de-vida.test.ts`, `zapi-webhook-regras.test.ts`,
  `relatorios-atendimento.test.ts`, `migrate-sac-chat.test.ts`.
- chat-backend, no processo contra o banco (`module.handle`, relógio por argumento):
  `ciclo-de-vida.db.test.ts`, `ciclo-de-vida-rotas.db.test.ts`, `zapi-webhook.db.test.ts`,
  `config-ciclo-de-vida.db.test.ts`.
- e2e contra servidor: `whatsapp`, `audit`, `responsaveis`, `message-actions` (o harness grava
  `webhook_token` e `postWebhook` manda `Client-Token`; `agent.close` agora leva `entity_id`).
- api-ts: `tests/unit/chat-chamado.test.ts`; contrato `tests/contract/chamado-do-chat.test.ts`
  (a API sob teste precisa de `CHAT_INTERNAL_URL=http://localhost:8299`, servido pelo teste).

Rode os testes do chat arquivo por arquivo (o mock de `horario-atendimento.test.ts` vaza).

## 5. Pendências

- Remover o `webhook_token` pela tela (hoje o campo vazio mantém o valor; a API aceita `""`).
- Legado: o tipo do abandono das conversas do SAC não foi migrado (ficam "Não informado"); a
  entidade das conversas antigas também não (o SAC guarda o id numérico da entidade).
- O SAC abria ticket automático para abandono e para encerramento sem chamado; os tickets viraram
  registro de ligações (W06) e isso não foi reproduzido.
- `semAvaliacao`/`houveAtendimento` (sessoes.ts) e `salvarResponsavel`/`buscar*` (responsaveis.ts)
  seguem com verbo em português: arquivos compartilhados com outros workers, renomear num passo só.
