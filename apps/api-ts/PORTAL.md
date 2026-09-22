# Portal do cliente

Endereço público onde o **cliente** — não o time — abre solicitações e acompanha
as que abriu:

```
https://<host>/portal?workspace=<slug-do-espaço>
```

A página é servida pela própria API (`apps/api-ts/src/modules/portal/pagina.ts`),
fora do `/api/v1`, sem nada do Plane junto: sem barra lateral, sem quadro, sem o
bundle do web. Quem entra faz três coisas — escolher o sistema, abrir a
solicitação e ver em que pé estão as suas.

## Como funciona

| Peça                                        | Onde                                 |
| ------------------------------------------- | ------------------------------------ |
| Página (HTML autocontido)                   | `src/modules/portal/pagina.ts`       |
| Rotas do cliente e administração das contas | `src/modules/portal/index.ts`        |
| Conta, senha e sistemas liberados           | `src/modules/portal/conta.ts`        |
| Abertura e leitura das solicitações         | `src/modules/portal/solicitacoes.ts` |
| Crachá próprio (JWT com `role: "portal"`)   | `src/modules/portal/token.ts`        |
| Situação na língua do cliente               | `src/modules/portal/situacao.ts`     |
| Resposta ao cliente ao concluir             | `src/modules/portal/resposta.ts`     |
| Limpeza do texto rico que o cliente escreve | `src/modules/portal/texto-rico.ts`   |
| Anexos: conferência, guarda e entrega       | `src/modules/portal/anexos.ts`       |
| O que o cliente pode fazer (regra pura)     | `src/modules/portal/regras-do-cliente.ts` |
| Responder, encerrar, reabrir e avaliar      | `src/modules/portal/interacoes.ts`   |
| Conversa (comentários marcados)             | `src/modules/portal/conversa.ts`     |
| Avaliação (formato do portal e da equipe)   | `src/modules/portal/avaliacao.ts`    |
| Visitas técnicas do cliente                 | `src/modules/portal/visitas.ts` e `visitas-do-cliente.ts` |
| Contas em Configurações (regra e gravação)  | `src/modules/portal/contas-admin.ts` e `contas-admin.service.ts` |

**A conta do portal não é usuário do Plane.** Ela mora em `portal_accounts`, não
ocupa cadeira, não aparece como membro nem como responsável, e o token dela é
recusado por qualquer rota autenticada do produto. O vínculo com a entidade
(prefeitura, câmara) é um campo, não uma identidade compartilhada.

**Acesso é concedido, nunca presumido.** Sem linha em `portal_account_projects` a
conta não abre solicitação para projeto nenhum, e a lista de "meus chamados" sai
de `portal_requests` — só o que aquela conta abriu.

**A solicitação entra na triagem**, pelo mesmo caminho do `POST /inbox-issues/`
do produto: nasce no estado de triagem do projeto, cai na caixa de entrada e a
equipe decide. O que muda é a origem (`intake_issues.source = "portal"`) e o
fato de não haver usuário por trás — `issues.created_by_id` fica nulo.

## Criar contas

Pela tela: _Configurações > Portal do cliente_ (`apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/portal/`).
Lista com busca e filtro (ativas, inativas, todas), criar, editar, vincular à
entidade, escolher os sistemas liberados, desativar/reativar e redefinir a
senha. Quem entra na tela é quem tem a ação `portal.manage` (só admin por
padrão; concessão por pessoa em _Funções e permissões_).

Pela API, com a mesma ação:

```
GET    /api/v1/workspaces/:slug/portal-accounts/                    → { results, email_enabled }
POST   /api/v1/workspaces/:slug/portal-accounts/                    { name, email, password, entity_id?, project_ids[] }
PATCH  /api/v1/workspaces/:slug/portal-accounts/:id                 { name?, email?, password?, entity_id?, is_active?, project_ids? }
DELETE /api/v1/workspaces/:slug/portal-accounts/:id
POST   /api/v1/workspaces/:slug/portal-accounts/:id/reset-password/ { modo?: "email" | "provisoria" }
```

- Erro de campo volta como `errors: [{ path, message }]` (`name`, `email`,
  `password`, `entity_id`, `project_ids`, `modo`). E-mail repetido é 409 com
  `path: "email"`.
- `entity_id` e `project_ids` têm de ser do espaço.
- Redefinir senha: sem `modo`, manda o link por e-mail quando há SMTP (mesmo
  fluxo do "esqueci minha senha"; a senha atual vale até o cliente usar o
  link) e gera senha provisória quando não há. `modo: "provisoria"` força a
  provisória: 12 caracteres sem 0/O/1/l/I, devolvida UMA vez no corpo
  (`password`), e as sessões abertas caem. `modo: "email"` sem SMTP é 400.

Ou pelo servidor, com o script (também serve para trocar senha esquecida):

```bash
WORKSPACE=quality EMAIL=contato@prefeitura.gov.br SENHA=umaSenhaBoa \
  NOME="Prefeitura de Exemplo" SISTEMAS=SIART,CONTAB \
  DATABASE_URL=postgresql://... bun run scripts/portal-conta.ts

# conferir o que existe
WORKSPACE=quality LISTAR=true DATABASE_URL=postgresql://... bun run scripts/portal-conta.ts
```

`SISTEMAS` aceita identificador (`SIART`) ou id do projeto; informá-lo substitui
a lista inteira, omiti-lo mantém a que já está lá.

## Rotas do cliente

Todas sob `/portal/api`, autenticadas pelo token do portal (`Authorization:
Bearer`), exceto `entrar`, `espaco`, `esqueci-senha` e `redefinir-senha`.

| Rota                                    | O que faz                                                  |
| --------------------------------------- | ---------------------------------------------------------- |
| `POST /entrar`                          | e-mail + senha → token (10 tentativas por IP a cada 5 min) |
| `POST /esqueci-senha`                   | `{ workspace, email }` → manda o link de nova senha        |
| `POST /redefinir-senha`                 | `{ workspace, conta, token, senha }` → troca a senha       |
| `GET /eu`                               | retoma a sessão guardada no navegador                      |
| `GET /sistemas`                         | os projetos liberados para a conta                         |
| `GET /solicitacoes`                     | o que a conta abriu, da mais recente para a mais antiga    |
| `POST /solicitacoes`                    | abre na triagem do sistema escolhido                       |
| `GET /solicitacoes/:id`                 | uma solicitação da conta                                   |
| `POST /solicitacoes/:id/anexos`         | anexa um arquivo (multipart, campo `arquivo`)              |
| `GET /solicitacoes/:id/anexos/:anexoId` | baixa um anexo da própria conta                            |
| `POST /solicitacoes/:id/interacoes`     | `{ texto_html }` responde a uma solicitação em andamento   |
| `POST /solicitacoes/:id/encerrar`       | `{ motivo? }` "já resolvi": vai para Concluído             |
| `POST /solicitacoes/:id/reabrir`        | `{ motivo }` reabre a concluída (volta para Em Análise)    |
| `POST /solicitacoes/:id/avaliacao`      | `{ nota_atendimento, expectativa, comentario? }`           |
| `GET /visitas?situacao=`                | visitas da entidade da conta: `abertas`, `efetivadas`, `vencidas` |
| `GET /visitas/:id`                      | relatório da visita, só leitura                            |

`GET /solicitacoes` e `GET /solicitacoes/:id` trazem `resposta` (`{ texto,
respondida_por, respondida_em }`) quando a equipe já respondeu, e `null`
enquanto não, mais `anexos[]` (`{ id, nome, tipo, tamanho, enviado_em }`),
`interacoes[]` (a conversa: `{ id, autor: cliente|equipe, tipo, nome,
texto_html, enviada_em }`), `avaliacao` (a vigente ou `null`) e `acoes`
(`{ responder, reabrir, encerrar, avaliar }`: é daí que a página desenha os
botões, e a rota confere a mesma regra antes de gravar).

## O cliente conversa com a solicitação (paridade com o suporte antigo)

Espelha o Service Desk do `suporte/` PHP (`service-desk-envia-mensagem-chamado`,
`service-desk-encerrar-chamado`, `service-desk-enviar-avaliacao`).

| Situação da solicitação           | Responder | Encerrar | Reabrir | Avaliar            |
| --------------------------------- | --------- | -------- | ------- | ------------------ |
| Triagem ou em andamento           | sim       | sim      | não     | não                |
| Concluída                         | não       | não      | sim     | sim, uma por conclusão |
| Cancelada pela equipe             | não       | não      | não     | não                |
| Recusada ou duplicada na triagem  | não       | não      | não     | não                |

Regra única em `readAcoesDoCliente` (`regras-do-cliente.ts`). Fora de hora: 409.

- **Responder**: editor rico igual ao da abertura, com anexos. Vira comentário
  do chamado com `external_source = "portal_cliente"`, `external_id =
  "interacao"`, `access = "EXTERNAL"` e `actor_id` nulo. A equipe vê o nome
  "Conta (cliente)" no comentário (`serializeComment` resolve pela conta do
  pedido). O sino toca para os responsáveis ativos; sem responsável, para a
  Qualidade do projeto (`notifyInteracaoDoCliente`). O anexo da resposta sobe
  com o campo `interacao` no multipart e conta no limite daquela resposta (5),
  não no da abertura.
- **Encerrar**: o chamado vai para "Concluído" (ou o primeiro estado do grupo
  `completed`), a solicitação fica atendida (`acompanharSolicitacao`), e a
  resposta da equipe fica dispensada (`issue_activities` com `field =
  "portal_resposta"`), para não cobrar retorno de quem disse que resolveu. O
  recado opcional entra na conversa (`external_id = "encerramento"`).
- **Reabrir**: exige motivo (400 com `path: "motivo"`). O chamado volta para
  "Em Análise" (a etapa em que a triagem põe o que aceitou; sem ela, o primeiro
  estado `started`; sem nenhum, o padrão do projeto), a solicitação volta a
  aceita. A resposta e a dispensa vigentes ganham a marca
  `portal_resposta_anterior` e a avaliação vigente ganha `superseded_at`: a
  próxima conclusão pede resposta da equipe e avaliação do cliente de novo. O
  histórico continua visível.
- **Avaliar**: as duas perguntas do suporte antigo, com os mesmos valores:
  expectativa (4 Sim, 3 Parcialmente, 2 Não, 1 Não era o que eu precisava) e
  atendimento (3 Ótimo, 2 Bom, 1 Ruim), mais comentário opcional. Tabela
  `portal_evaluations`. Com "Não" ou "Parcialmente" a página sugere reabrir.
- A mudança de estado feita pelo cliente **não** passa pela matriz de
  transições (a matriz é por função e o cliente não tem função). Fica na trilha
  do chamado sem autor, ao lado do comentário do cliente.

A equipe lê a conta que abriu e as avaliações no detalhe do chamado
(`apps/web/core/components/portal/portal-do-chamado.tsx`):

```
GET /api/v1/workspaces/:slug/portal-requests/:issue_id/   → { account, evaluations[] }   (issue.view)
```

404 quando o chamado não veio do portal.

## Visitas técnicas no portal

Só leitura e só da entidade gravada na conta (`portal_accounts.entity_id`);
conta sem entidade não vê visita nenhuma. Mesma consulta e mesmo serializer do
módulo `technical-visit` (`listVisitas`, `findVisita`, `serializeVisit`), com
o recorte do que sai para fora em `buildVisitaDoCliente`: anexos do relatório,
anotação de contato e ids de usuário não saem.

| Situação     | Regra                                                          |
| ------------ | -------------------------------------------------------------- |
| `abertas`    | não concluída nem cancelada, sem data ou de hoje em diante     |
| `efetivadas` | concluída                                                      |
| `vencidas`   | não concluída nem cancelada, marcada para antes de hoje         |

Cancelada nunca aparece. Resumo e conclusão só saem com a visita em
"Aguardando Assinatura" ou "Concluída" (antes disso é rascunho da equipe). A
página tem botão de imprimir.

## Falar com o suporte

O "Abrir solicitação" do portal já é o canal: nasce na triagem e avisa a
Qualidade. Não há formulário separado.

## Esqueci minha senha e sessão

O link vai por e-mail (configuração em _Configurações > E-mail (SMTP)_ ou nas
variáveis `SMTP_*`) e abre a própria página: `/portal/?workspace=&conta=&redefinir=`.
Vale uma vez, por 60 minutos, e só o hash fica gravado (`password_reset_tokens`,
`kind = portal`: o token do Plane não serve aqui, nem o contrário). A resposta do
pedido é a mesma para e-mail cadastrado ou não.

O token do portal leva a versão da sessão (`portal_accounts.token_updated_at`).
Senha trocada pelo link ou pelo administrador derruba os tokens emitidos antes.

## Texto com formatação

A caixa "O que está acontecendo" é um editor de verdade — negrito, itálico,
sublinhado, lista, link — e não um `textarea`. É um `contenteditable` de umas
poucas dezenas de linhas dentro da própria página, **não** o editor do produto
(`packages/editor`): aquele é React + TipTap e traria bundle, etapa de build e o
peso do app inteiro para uma página pública que o cliente abre duas vezes por
mês.

**O HTML que chega do navegador do cliente não vale nada por si.** Ele passa por
`modules/portal/texto-rico`, que trabalha com lista de permissão: sobrevivem
parágrafo, quebra, negrito, itálico, sublinhado, tachado, lista, citação, código
e link (`http`, `https`, `mailto`, sempre com `rel="noopener noreferrer
nofollow"`). Atributo nenhum passa, `script`/`style`/`iframe` somem com o
conteúdo junto, `div` vira parágrafo e `b`/`i` viram `strong`/`em` — que é o que
o editor do produto entende quando a equipe abre o chamado. O texto é cortado em
20 mil caracteres.

## Anexos

O anexo do portal é o **mesmo anexo do chamado**: `file_assets` para o binário
(via `@utils/storage`, ou seja, o S3 configurado ou o disco) e `issue_attachments`
para o vínculo. A equipe vê no painel de anexos de sempre, sem nada de especial
para o portal. Regras em `modules/portal/anexos`:

| Limite                   | Valor                                   |
| ------------------------ | --------------------------------------- |
| Arquivos por solicitação | 5                                       |
| Tamanho — vídeo          | 100 MB                                  |
| Tamanho — o resto        | 25 MB                                   |
| Envios por conta         | 20 a cada 10 minutos (`checkRateLimit`) |

Aceitos: imagem (png, jpg, gif, webp, heic, bmp), vídeo (mp4, mov, webm, mkv,
3gp), áudio (mp3, ogg, wav, m4a), pdf, txt/log/csv e docx/xlsx. **SVG e HTML são
recusados de propósito** — executam script no navegador de quem abrir —, assim
como executável, `.doc`/`.xls` antigos e qualquer coisa com macro.

Como quem envia é gente de fora, três coisas precisam contar a mesma história:
a extensão, o tipo informado pelo navegador e os **primeiros bytes do arquivo**.
O tipo gravado é sempre o nosso, nunca o do formulário, e o download sai com
`Content-Disposition: attachment` e `nosniff` — nada do que o cliente manda é
servido inline na nossa origem.

O corpo grande demais é recusado **antes** de ser lido (`onRequest` em
`modules/portal/index`), e o `location ~ ^/portal` do proxy leva
`client_max_body_size 101M` — o padrão global de 50M cortaria vídeo.

## Resposta ao cliente quando o chamado é concluído

Chamado que **nasceu no portal** não pode ser dado por encerrado em silêncio.
Ao entrar num estado do grupo `completed`, ele passa a figurar na fila de
respostas de quem trabalha nele, e a área de trabalho abre a janela pedindo o
retorno (`apps/web/core/components/portal/resposta-ao-cliente-modal.tsx`).

**A pendência é derivada, não carimbada.** Concluir acontece por muitos caminhos
— arrastar no quadro, trocar o estado no detalhe, no peek, na planilha, pela
triagem, pelo item de triagem, em massa, pela API. Nenhum deles precisa
colaborar: a fila é uma consulta (origem portal + estado concluído + sem
resposta + sem dispensa), então nenhum caminho fica de fora.

**A resposta é opcional, de propósito.** Recusar a conclusão sem resposta faria
o cartão voltar sozinho para a coluna anterior e travaria conclusão em massa e
automação. A conclusão passa; a cobrança vem atrás e só sai da fila quando
alguém responde ou clica em "concluir sem responder" — que fica gravado com
autor e hora, e vai para a trilha LGPD como qualquer conteúdo que sai da
aplicação.

**Onde a resposta mora, sem coluna nova.** A resposta é um comentário do próprio
chamado, com `access = "EXTERNAL"` e `external_source = "portal_resposta"` — daí
saem o texto, quem respondeu e quando, e a equipe lê no histórico o que foi dito
para fora. A dispensa é um `issue_activities` com `field = "portal_resposta"` e
`new_value = "dispensada"` (campo desconhecido não desenha nada na trilha da
tela).

| Rota (crachá do Plane)                        | O que faz                                    |
| --------------------------------------------- | -------------------------------------------- |
| `GET  /workspaces/:slug/portal-answers/pending/`     | o que este usuário precisa responder  |
| `POST /workspaces/:slug/portal-answers/:issue_id/`   | `{ resposta }` ou `{ pular: true, motivo? }` |

## Situação mostrada ao cliente

Recusada e duplicada são **desfecho da triagem**, não estado do chamado, e por
isso vêm antes de se olhar o estado. O resto mostra o estado real do chamado
(`Em Análise`, `Em Desenvolvimento`, `Concluído`…), com "Em triagem" enquanto
ninguém decidiu.

## Banco

Migration `20260821120000_portal_do_cliente`: `portal_accounts`,
`portal_account_projects` e `portal_requests`.
Migration `20260922201000_portal_avaliacao_do_cliente`: `portal_evaluations`.

## Testes

- `tests/unit/portal-situacao.test.ts`, `portal-token.test.ts`,
  `portal-pagina.test.ts`, `portal-texto-rico.test.ts`, `portal-anexos.test.ts`,
  `portal-regras-do-cliente.test.ts`, `portal-visitas.test.ts`,
  `portal-contas.test.ts` — rodam sozinhos (`bun test tests/unit/portal-`).
- `tests/contract/portal-interacoes.test.ts`, `portal-contas-admin.test.ts` e
  `portal-visitas.test.ts` — API no ar, com `EMAIL_TRANSPORT=fake`,
  `EMAIL_OUTBOX_DIR`, `SMTP_HOST` e `SMTP_FROM`. O limite de login do portal (10
  por IP a cada 5 min) fica na memória: reinicie o servidor entre execuções.
- `tests/contract/portal-do-cliente.test.ts`,
  `tests/contract/portal-resposta-ao-cliente.test.ts` e
  `tests/contract/portal-anexos.test.ts` — precisam da API no ar contra o banco
  de teste (ver o README da raiz).
