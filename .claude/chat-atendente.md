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
    alerta-sem-resposta.tsx              useAlertaSemResposta (pausar/retomar alerta) + MensagemDaChave
    cabecalho-da-conversa.tsx            cabeçalho da conversa aberta: nome, etiquetas, ações e menu "Mais" (W41)
    acoes-do-cabecalho.ts (+ .test.ts)   quais ações a conversa tem e quais cabem pela largura (W41)
    cores-do-atendimento.ts (+ .test.ts) classes de bolha, status, etiquetas e avatar, só tokens do tema (W41)
    avatar-da-sessao.tsx                 SessionAvatar (inicial do cliente)
    painel-do-cadastro.tsx               painel lateral: responsável, entidade, sistema, dados técnicos
    aba-de-frases.tsx                    aba "Frases" da configuração (admin)
    calendario-de-feriados.tsx           dentro da aba Horários
    gerenciador-de-conversas.tsx         tela cheia, filtros, paginação e impressão
    monitor-ao-vivo.tsx                  topo do dashboard, revalida a cada 10 s
    whatsapp-do-responsavel.tsx          IniciarPeloResponsavel (Novo atendimento) + BotaoDeWhatsapp (contatos)
```

`attendant-app.tsx` mudou o mínimo: ferramentas no compositor, botão do alerta no cabeçalho,
render da mensagem `chave`, painel do cadastro no lado direito, botão "Gerenciador" e abertura de
`?sessao=<id>`. O dashboard passou a aparecer para `chat.gerenciar` (hoje `chat.relatorios`; antes só administrador), porque
o monitor é de gestão.

## 2. Colunas novas (0014)

- `chat_frases_prontas` (id, workspace_id = slug, texto, ordem). Desde a `0017`, `owner_user_id`:
  nulo = frase do espaço, preenchido = frase pessoal de quem cadastrou (W37).
- `chat_sessions.sla_alert_paused_at`, `chat_sessions.client_info` (JSONB), índice
  `(workspace_id, created_at)` para o gerenciador.
- `chat_messages.without_sender_name`.
- `chat_bot_config.holidays` (JSONB `[{ date, label, recorrente }]`).

## 3. Contrato (chat-backend)

Erros: `{ detail, errors?: [{ path, message }] }`, `path` no nome do campo do formulário
(`chave`, `texto`, `entity_id`, `feriados[1].date`).

| Rota | Ação | Corpo / query | Resposta |
| --- | --- | --- | --- |
| `GET /workspaces/:slug/frases/` | atender | | `{ results: [{ id, texto, ordem, escopo }] }`: as do espaço e as próprias |
| `POST /workspaces/:slug/frases/` | atender | `{ texto, ordem? }` | 201 frase pessoal (`escopo: "pessoal"`) |
| `PATCH/DELETE .../frases/:id/` | atender | `{ texto?, ordem? }` | frase / `{ ok }`; só a própria, senão 404 |
| `GET/POST /workspaces/:slug/config/frases/` | frases_do_espaco | `{ texto, ordem? }` | só as do espaço / 201 frase |
| `PATCH/DELETE .../config/frases/:id/` | frases_do_espaco | `{ texto?, ordem? }` | frase / `{ ok }`; só as do espaço, senão 404 |
| `POST .../config/frases/padrao/` | frases_do_espaco | | inclui as 7 frases só se o espaço não tem nenhuma frase do espaço |
| `POST .../sessions/:id/chave/` | atender | `{ chave, without_sender_name? }` | 201 mensagem (`type: "chave"`); 409 se encerrada |
| `POST .../sessions/:id/sla-alert/pause/` e `/resume/` | pausar | | sessão com `sla_alert_paused_until` |
| `GET/PATCH .../sessions/:id/cadastro/` | atender | `{ entity_id?, project_id?, entity_contact_id? }` | `{ session, entity, project, responsavel }` |
| `POST .../sessions/whatsapp/responsavel/` | atender | `{ entity_contact_id, project_id?, message? }` | 201 sessão; 409 `{ detail, session_id }` |
| `GET .../config/feriados/` | atender | | `{ results }` |
| `PUT .../config/feriados/` | configurar | `{ feriados: [...] }` (SUBSTITUI a lista) | `{ results }` |
| `GET .../gerenciador/` | ver_todas | `attendant_id, entity_id, project_id, from, to, q, channel, status, page, per_page` (≤ 500) | `{ count, page, per_page, total_pages, results }` |
| `GET .../monitor/` | relatorios | | `{ gerado_em, fila, ativos, hoje, tempos }` |

WS: `agent.message` aceita `without_sender_name: true`. `message.new` agora vai COMPLETO ao
atendente (com `without_sender_name`, `send_error`) e reduzido ao cliente.

`POST /sessions/` (widget) aceita `client_info` (objeto ou JSON em texto). Conversa retomada pelo
mesmo navegador junta o que veio com o que já estava.

Sessão serializada ganhou `sla_alert_paused_until` e `client_info`.

## 4. Regras e decisões

- **Ações da matriz** (finas desde a W38, ver `.claude/permissoes-v2.md` §9): atender =
  `chat.atender`; pausar o alerta = `chat.pausar`; frases do espaço = `chat.frases_do_espaco`;
  feriados = `chat.configurar`; gerenciador = `chat.ver_todas`; monitor = `chat.relatorios`;
  nota e comentário do cliente (bloco "Avaliação", lista, histórico, transcrição e impressão) =
  `chat.ver_avaliacao` (W42; antes saíam com `chat.configurar`, padrão só admin). Antes eram
  `chat.administrar` e `chat.gerenciar`.
- **Avaliação do cliente** (W42): o atendente pode não ver a nota que recebeu, para não descontar no
  cliente. O servidor apaga `rating_score`/`rating_comment` para quem não tem `chat.ver_avaliacao`
  (`applyVisaoDaAvaliacao`, `src/sessoes.ts`); a tela usa `permissoes.canVerAvaliacao`. No WhatsApp
  a resposta à pesquisa não vira mensagem da conversa (`isRespostaDaAvaliacao`, `src/rating.ts`).
  O relatório de avaliações por atendente segue em `chat.relatorios`.
- **Só o cliente avalia** (W43): `POST /sessions/:id/rate/` aceita apenas o token do cliente da
  conversa; a equipe recebe 403 "Só o cliente avalia o atendimento." (antes o atendente logado
  gravava ou sobrescrevia a nota). O WhatsApp grava pela resposta à pesquisa (`handleRatingReply`).
- **Histórico e anexo pela regra da lista** (W43, `src/acesso-a-sessao.ts`):
  `GET /sessions/:id/messages/` e `POST /sessions/:id/upload/` exigem, da equipe, `chat.atender`
  no espaço da conversa e `isSessaoVisivel` (próprias; dos outros com `chat.ver_todas`; fila e robô
  com `chat.ver_fila`). Sem login 401, sem a ação ali 403, conversa que não enxerga 404. Antes
  bastava estar logado no Plane, em qualquer espaço. O cliente segue com o `?token=` da conversa.
- **Transcrição pelo protocolo** (`GET /sessions/by-protocol/:protocol/`, tela `chat-view`): só a
  equipe com `chat.atender` no espaço da conversa, SEM `isSessaoVisivel`. O protocolo chega pelo
  link "Ver conversa" do chamado, e quem atende o chamado (TI, Qualidade) lê a conversa de outra
  pessoa sem `chat.ver_todas`. Outro espaço ou sem `atender`: 403; sem login: 401; o token do
  cliente não abre. A nota segue cortada por `chat.ver_avaliacao`.
  Iniciar WhatsApp (`POST .../sessions/whatsapp/`) passou a pedir `chat.atender` no espaço.
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

- chat-backend, puros: `tests/atendente-regras.test.ts` (43).
- chat-backend, no processo contra o banco: `tests/atendente.db.test.ts` (33): permissões, frases (do espaço e pessoais),
  chave, alerta (o `checkSla` não fala com o cliente e respeita a pausa), cadastro, WhatsApp do
  responsável, feriados, gerenciador, monitor e foto (download injetado).
- chat-backend, e2e contra servidor: `tests/atendente.e2e.test.ts` (2): "sem o nome" pelo WS e
  `client_info` no `POST /sessions/`.
- web: `core/components/chat/atendente/atendente-helpers.test.ts` (12), `bun test`.

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

## 8. Frases por atendente, sistema na transferência e quem vê a conversa (W37, 2026-10-09)

- **Frases pessoais**: cada atendente (`chat.atender`) cadastra, edita e apaga as próprias frases em
  `/frases/` (migração `0017`, `owner_user_id`). As do espaço continuam em `/config/frases/`
  (`chat.frases_do_espaco`). Frase de outro dono responde 404. Regras em `src/atendente/frases.ts`
  (`ESCOPO_DA_FRASE`, `buildDonoDaFrase`, `buildFiltroDasFrasesVisiveis`). Na tela, o menu do
  compositor mostra "Minhas frases" e "Do espaço" (`groupFrases`) e tem "Editar minhas frases",
  que abre o mesmo `EditorDeFrases` da aba Frases com `escopo="pessoal"`.
- **"Sistema: Selecione" depois de transferir**: o servidor sempre manteve o sistema (a transferência
  só troca `assigned_attendant_id`; `GET /cadastro/` devolve o `project`). A causa era a tela: as
  opções do seletor vinham de `joinedProjectIds`, os projetos de que a PESSOA participa. Quem recebe
  a conversa e não participa do sistema dela não tinha a opção, e o `SelectPesquisavel` caía no
  placeholder "Selecione". `withSistemaDaConversa` põe o sistema da conversa aberta nas opções (vale
  para o painel do cadastro, o encerramento e as ações da conversa).
- **Quem transferiu continua vendo**: é a regra, não defeito, quando a pessoa tem
  `chat.ver_todas`: ela vê as conversas dos outros (`src/visibilidade.ts`; fila e robô pedem
  `chat.ver_fila`). Quem não tem vê só as próprias; a transferência agora manda `session.transferred_out` a quem atendia
  e a quem transferiu (`src/transferencia.ts`), e a tela tira a conversa da lista na hora
  (`applyTransferenciaNaLista`), fechando-a se estava aberta.
- Testes: `tests/visibilidade-da-lista.test.ts` (10, puro), `tests/atendente-regras.test.ts`
  (+3, dono da frase), `tests/atendente.db.test.ts` (+6, frases pessoais),
  `atendente-helpers.test.ts` no web (+6).

## 9. Cabeçalho da conversa e cores da bolha (W41)

- **Cabeçalho**: `CabecalhoDaConversa` mede a própria largura (ResizeObserver) e
  `splitAcoesPorLargura` decide: a partir de 900 px todas as ações com rótulo; de 480 a 899 px só
  as principais (Assumir, Chamado, Encerrar) com rótulo e o resto (Link, Pausar, Alerta,
  Transferir) no menu "Mais"; abaixo de 480 px as principais só com ícone (`title` e
  `aria-label` com o nome). O nome do cliente trunca com reticências e nunca fica embaixo dos
  botões. `findAcoesDaConversa` repete as regras de antes (status, ligação, `permissoes.*` do W38).
  `useAcoesDaConversa` (chamado, pausa) e `useAlertaSemResposta` viraram hooks: o botão é do
  cabeçalho, que decide se ele aparece ou vai para o menu.
- **Cores**: o tema desliga a paleta padrão do Tailwind (`--color-*: initial` em
  `@plane/tailwind-config/variables.css`). `bg-indigo-600`, `bg-green-100` etc. não geram CSS: a
  bolha do atendente ficava transparente com texto branco. Use só tokens (`bg-accent-primary`,
  `text-on-color`, `bg-success-subtle`, `bg-label-*-bg-strong`...). O teste
  `cores-do-atendimento.test.ts` lê o tema e falha se uma classe de cor não existir.
- **Varredura da pasta**: `components/chat/classes-do-tema.ts` (`findClassesForaDoTema`) e o
  teste `classes-do-tema.test.ts` leem TODO `.ts/.tsx` de `components/chat/**` e falham se aparecer
  classe de cor que o tema não gera. Além da paleta (`amber`, `red`, `green`, `indigo`...), o tema
  também não tem `bg-primary`, `border-primary`, `border-accent-primary`, `border-danger-primary`,
  `ring-danger-primary`, `bg-tertiary`, `bg-surface-3`, `border-surface-1`, `text-secondary-text`:
  o botão de enviar, os botões primários da configuração e a borda vermelha de cliente sem resposta
  saíam sem cor. Equivalências usadas: `bg-primary` → `bg-accent-primary` (hover
  `bg-accent-primary-hover`), `border-primary` / `border-accent-primary` → `border-accent-strong`,
  `*-danger-primary` em borda/anel → `*-danger-strong`, `amber` → `warning`, `red` → `danger`,
  `green` → `success`, `indigo` → `accent`. Faixa da fila, estrela, contador de não lidas e ligação
  atendida têm helper em `cores-do-atendimento.ts`.

