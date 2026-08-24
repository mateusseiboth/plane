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

Pela API, como administrador do espaço:

```
GET    /api/v1/workspaces/:slug/portal-accounts/
POST   /api/v1/workspaces/:slug/portal-accounts/     { name, email, password, entity_id?, project_ids[] }
PATCH  /api/v1/workspaces/:slug/portal-accounts/:id  { name?, email?, password?, is_active?, project_ids? }
DELETE /api/v1/workspaces/:slug/portal-accounts/:id
```

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
Bearer`), exceto `entrar` e `espaco`.

| Rota                                    | O que faz                                                  |
| --------------------------------------- | ---------------------------------------------------------- |
| `POST /entrar`                          | e-mail + senha → token (10 tentativas por IP a cada 5 min) |
| `GET /eu`                               | retoma a sessão guardada no navegador                      |
| `GET /sistemas`                         | os projetos liberados para a conta                         |
| `GET /solicitacoes`                     | o que a conta abriu, da mais recente para a mais antiga    |
| `POST /solicitacoes`                    | abre na triagem do sistema escolhido                       |
| `GET /solicitacoes/:id`                 | uma solicitação da conta                                   |
| `POST /solicitacoes/:id/anexos`         | anexa um arquivo (multipart, campo `arquivo`)              |
| `GET /solicitacoes/:id/anexos/:anexoId` | baixa um anexo da própria conta                            |

`GET /solicitacoes` e `GET /solicitacoes/:id` trazem `resposta` (`{ texto,
respondida_por, respondida_em }`) quando a equipe já respondeu, e `null`
enquanto não, mais `anexos[]` (`{ id, nome, tipo, tamanho, enviado_em }`).

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

## Testes

- `tests/unit/portal-situacao.test.ts`, `portal-token.test.ts`,
  `portal-pagina.test.ts`, `portal-texto-rico.test.ts`, `portal-anexos.test.ts`
  — rodam sozinhos (`bun test tests/unit/portal-*`).
- `tests/contract/portal-do-cliente.test.ts`,
  `tests/contract/portal-resposta-ao-cliente.test.ts` e
  `tests/contract/portal-anexos.test.ts` — precisam da API no ar contra o banco
  de teste (ver o README da raiz).
