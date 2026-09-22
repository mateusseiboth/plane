# Chat: ferramentas do atendente e gestão (W05)

Data: 2026-09-22 · Worker W05. Frases prontas, chave de acesso remoto, envio sem o nome, pausa do
alerta de cliente sem resposta, cadastro (entidade, sistema, responsável) durante o atendimento,
dados técnicos do cliente, WhatsApp a partir do responsável, foto de perfil, feriados, gerenciador
de conversas e monitor ao vivo. Legado consultado em `siteintranet/intranet/`:
`popChatAtendimento.php`, `popChatAt_texto.php`, `popChatAt_enviachave.php`,
`popChatAt_posta_chave.php`, `popChatAt_pausar_alerta_semresp.php`,
`popChatAt_clientes_semresp.php`, `popChatAt_defineentsis*.php`, `popChatAt_defineresp.php`,
`zapi/gravarFotoZap.php`, `zapi/iniciarChat.php`, `sac_chatGer_lista.php`,
`popImprimeChatLista.php` e `chatger/`.

## 1. Mapa

```
apps/chat-backend/src/atendente/
  frases.ts / frases.service.ts          frases prontas (FRASES_PADRAO = 7 frases do SAC)
  chave.ts                               TIPO_CHAVE, parseChave
  whatsapp-texto.ts                      formatTextoDoWhatsapp: nome em negrito + corpo por tipo
  alerta.ts                              shouldAlertSla, readAlertaPausadoAte (pausa de 40 min)
  client-info.ts                         parseClientInfo / mergeClientInfo (só chaves conhecidas)
  cadastro-regras.ts                     parseCadastro (entity_id, project_id, entity_contact_id)
  sessao.service.ts                      sendChave, changeAlerta, readCadastro, updateCadastro
  whatsapp-do-responsavel.service.ts     startWhatsappDoResponsavel
  foto.ts / foto.service.ts              cópia da foto do WhatsApp para o storage
  fuso.ts                                readDataLocal, readInicioDoDia (fonte única do "dia local")
  feriados.ts / feriados.service.ts      calendário de feriados
  gerenciador-regras.ts / .service.ts    filtros compostos em AND + paginação
  monitor-regras.ts / monitor.service.ts computeTempos (fila, atendimento, resposta)
  plane.dao.ts                           SQL nas tabelas do api-ts (entities, entity_contact_projects)
  errors.ts                              AtendenteError e filhos (status + errors[] + extra)
  rotas.ts                               atendenteModule (plugado no index.ts)
prisma/sql/0014_atendente.sql

apps/web/core/
  services/atendente.service.ts
  components/chat/atendente/
    atendente-helpers.ts (+ .test.ts)    formatSegundos, insertFrase, listClientInfo, readErroDoCampo...
    use-atendente.ts                     hooks SWR (frases, cadastro, feriados, gerenciador, monitor)
    ferramentas-do-compositor.tsx        menu de frases, botão da chave, "Sem meu nome"
    alerta-sem-resposta.tsx              Pausar/Retomar alerta + MensagemDaChave
    painel-do-cadastro.tsx               painel lateral: responsável, entidade, sistema, dados técnicos
    aba-de-frases.tsx                    aba "Frases" da configuração (admin)
    calendario-de-feriados.tsx           dentro da aba Horários
    gerenciador-de-conversas.tsx         tela cheia, filtros, paginação e impressão
    monitor-ao-vivo.tsx                  topo do dashboard, revalida a cada 10 s
    whatsapp-do-responsavel.tsx          IniciarPeloResponsavel (Novo atendimento) + BotaoDeWhatsapp (contatos)
```

`attendant-app.tsx` mudou o mínimo: ferramentas no compositor, botão do alerta no cabeçalho,
render da mensagem `chave`, painel do cadastro no lado direito, botão "Gerenciador" e abertura de
`?sessao=<id>`. O dashboard passou a aparecer para `chat.gerenciar` (antes só administrador), porque
o monitor é de gestão.

## 2. Colunas novas (0014)

- `chat_frases_prontas` (id, workspace_id = slug, texto, ordem).
- `chat_sessions.sla_alert_paused_at`, `chat_sessions.client_info` (JSONB), índice
  `(workspace_id, created_at)` para o gerenciador.
- `chat_messages.without_sender_name`.
- `chat_bot_config.holidays` (JSONB `[{ date, label, recorrente }]`).

## 3. Contrato (chat-backend)

Erros: `{ detail, errors?: [{ path, message }] }`, `path` no nome do campo do formulário
(`chave`, `texto`, `entity_id`, `feriados[1].date`).

| Rota | Ação | Corpo / query | Resposta |
| --- | --- | --- | --- |
| `GET /workspaces/:slug/frases/` | atender | | `{ results: [{ id, texto, ordem }] }` |
| `GET/POST /workspaces/:slug/config/frases/` | administrar | `{ texto, ordem? }` | lista / 201 frase |
| `PATCH/DELETE .../config/frases/:id/` | administrar | `{ texto?, ordem? }` | frase / `{ ok }` |
| `POST .../config/frases/padrao/` | administrar | | inclui as 7 frases só se o espaço não tem nenhuma |
| `POST .../sessions/:id/chave/` | atender | `{ chave, without_sender_name? }` | 201 mensagem (`type: "chave"`); 409 se encerrada |
| `POST .../sessions/:id/sla-alert/pause/` e `/resume/` | atender | | sessão com `sla_alert_paused_until` |
| `GET/PATCH .../sessions/:id/cadastro/` | atender | `{ entity_id?, project_id?, entity_contact_id? }` | `{ session, entity, project, responsavel }` |
| `POST .../sessions/whatsapp/responsavel/` | atender | `{ entity_contact_id, project_id?, message? }` | 201 sessão; 409 `{ detail, session_id }` |
| `GET .../config/feriados/` | atender | | `{ results }` |
| `PUT .../config/feriados/` | administrar | `{ feriados: [...] }` (SUBSTITUI a lista) | `{ results }` |
| `GET .../gerenciador/` | gerenciar | `attendant_id, entity_id, project_id, from, to, q, channel, status, page, per_page` (≤ 500) | `{ count, page, per_page, total_pages, results }` |
| `GET .../monitor/` | gerenciar | | `{ gerado_em, fila, ativos, hoje, tempos }` |

WS: `agent.message` aceita `without_sender_name: true`. `message.new` agora vai COMPLETO ao
atendente (com `without_sender_name`, `send_error`) e reduzido ao cliente.

`POST /sessions/` (widget) aceita `client_info` (objeto ou JSON em texto). Conversa retomada pelo
mesmo navegador junta o que veio com o que já estava.

Sessão serializada ganhou `sla_alert_paused_until` e `client_info`.

## 4. Regras e decisões

- **Sem ação nova na matriz.** Atender = `chat.atender`; configurar frases e feriados =
  `chat.administrar` (configurar o chat, como o resto da configuração); gerenciador e monitor =
  `chat.gerenciar` (mesma dos relatórios).
- **Frases**: não há semente automática; a aba oferece "Usar as frases padrão" (7 do SAC). As três
  últimas do SAC eram a pesquisa de satisfação digitada à mão e ficaram de fora (o chat já faz a
  pesquisa). Inserir a frase coloca o texto no fim do rascunho; o atendente ainda revisa e envia.
- **Chave**: o texto gravado é a própria chave; o rótulo "Chave de acesso remoto" é do render
  (WhatsApp: `Chave de acesso remoto: *X*`, widget e tela do atendente com botão de copiar). Vale
  para WhatsApp e site.
- **Sem o nome**: vale POR MENSAGEM (o "Sem meu nome" desmarca depois de enviar). No WhatsApp some o
  `*Nome*:`; no widget some o rótulo e o `sender_user_id`. Reenvio de mensagem que falhou respeita a
  escolha (o flag está na mensagem).
- **Alerta**: `alert.sla` não vai mais ao socket do cliente. Pausa de 40 minutos (o SAC limpava em 39;
  arredondado para o ~40 pedido), vence sozinha pela hora gravada, sem timer. Pausar tira a borda
  vermelha da conversa na tela. Inatividade, abandono e fim do dia (W04) não foram tocados.
- **Cadastro durante o atendimento**: campo ausente não muda, vazio limpa. Escolher o responsável
  preenche a entidade dele, salvo se a entidade vier na mesma gravação. Id de outro espaço volta no
  campo ("... não encontrado(a) neste espaço."). O encerramento continua lendo `entity_id` da sessão.
- **WhatsApp do responsável**: telefone = `phone_digits` (ou `phone`) com DDI 55. Sistema = o
  informado ou, se o responsável cuida de um só sistema, esse. Uma conversa aberta por número
  (procura por todas as variantes do nono dígito): a segunda tentativa devolve 409 com a conversa,
  e a tela abre essa.
- **Foto**: só `https`, só `image/*`, até 2 MB, copiada para `responsaveis/<id>.jpg`. O endereço
  gravado leva `?v=<ms>` da cópia: é ele que diz quando renovar (30 dias), sem coluna nova numa tabela
  do api-ts. Foto do SAC (caminho relativo) é trocada na primeira mensagem. Só roda quando o robô já
  identificou o responsável pelo telefone.
- **Feriados**: fecham o dia inteiro, com ou sem expediente cadastrado; "Todo ano" compara dia e mês.
  Dia no fuso do espaço. O fim do dia do W04 não olha feriado (não mexido).
- **Gerenciador**: histórico INTEIRO, sem o recorte do dia da lista do atendente. Período sobre a
  abertura (`created_at`) no fuso do espaço. `q` procura protocolo, nome e telefone. Impressão da
  página atual (até 500 linhas por página); fica na trilha da LGPD pelo `PrintButton`.
- **Monitor**: o chat não grava quando a conversa saiu da fila, então "fila" = abertura até a
  primeira mensagem do atendente; "atendimento" = primeira mensagem do atendente até o encerramento
  (só finalizadas); "resposta" = do primeiro cliente sem resposta até a mensagem seguinte do
  atendente. Tudo sobre as conversas abertas hoje. Ligação fica de fora.

## 5. Renomeações (verbo em inglês)

`responsaveis.ts`: `findResponsavelPorId`, `findResponsavelPorTelefone`, `saveResponsavel`,
`updateResponsavel`, `createResponsavel`, `onlyDigitos`, `telefoneWithDdi`. `sessoes.ts`:
`withoutAvaliacao`, `hasAtendimento`. `encerramento.ts`: o `saveResponsavel` local virou
`saveResponsavelDaSessao`. **Pendência**: `src/bot/engine.ts` (em alteração pelo W15) ainda importa
`buscarResponsavelPorTelefone`, mantido como alias em `responsaveis.ts`; trocar o import e apagar o
alias quando os dois estiverem no preview. `tests/helpers/harness.ts` (`criarEntidade`,
`criarResponsavel`, `buscarResponsavel`) não foi renomeado: é usado pelos testes de todos os workers.

## 6. Testes

- chat-backend, puros: `tests/atendente-regras.test.ts` (40).
- chat-backend, no processo contra o banco: `tests/atendente.db.test.ts` (27): permissões, frases,
  chave, alerta (o `checkSla` não fala com o cliente e respeita a pausa), cadastro, WhatsApp do
  responsável, feriados, gerenciador, monitor e foto (download injetado).
- chat-backend, e2e contra servidor: `tests/atendente.e2e.test.ts` (2): "sem o nome" pelo WS e
  `client_info` no `POST /sessions/`.
- web: `core/components/chat/atendente/atendente-helpers.test.ts` (6), `bun test`.

## 7. Pendências

- Remover o alias `buscarResponsavelPorTelefone` (ver §5).
- O `POST /workspaces/:slug/sessions/whatsapp/` antigo (a partir de `chat_contacts`) só exige login,
  sem `chat.atender`. Não foi mudado para não quebrar quem usa; alinhar à matriz.
- A foto do responsável ainda não aparece na tela de Contatos (só no painel do atendimento).
- O monitor mede a fila até a primeira mensagem do atendente; gravar o instante da atribuição
  (`assigned_at`) daria a espera exata.
- Relatório impresso do gerenciador imprime a página atual; para listas maiores que 500, filtrar.
- `attendant-app.tsx`, `chat-config-panel.tsx`, `chat-dashboard.tsx` e `chat.service.ts` já não
  estavam formatados pelo oxfmt antes deste trabalho; não foram reformatados para não misturar diff.
