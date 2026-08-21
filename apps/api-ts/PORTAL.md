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

| Rota                    | O que faz                                                  |
| ----------------------- | ---------------------------------------------------------- |
| `POST /entrar`          | e-mail + senha → token (10 tentativas por IP a cada 5 min) |
| `GET /eu`               | retoma a sessão guardada no navegador                      |
| `GET /sistemas`         | os projetos liberados para a conta                         |
| `GET /solicitacoes`     | o que a conta abriu, da mais recente para a mais antiga    |
| `POST /solicitacoes`    | abre na triagem do sistema escolhido                       |
| `GET /solicitacoes/:id` | uma solicitação da conta                                   |

## Situação mostrada ao cliente

Recusada e duplicada são **desfecho da triagem**, não estado do chamado, e por
isso vêm antes de se olhar o estado. O resto mostra o estado real do chamado
(`Em Análise`, `Em Desenvolvimento`, `Concluído`…), com "Em triagem" enquanto
ninguém decidiu.

## Banco

Migration `20260821120000_portal_do_cliente`: `portal_accounts`,
`portal_account_projects` e `portal_requests`.

## Testes

- `tests/unit/portal-situacao.test.ts`, `portal-token.test.ts`, `portal-pagina.test.ts`
  — rodam sozinhos (`bun test tests/unit/portal-*`).
- `tests/contract/portal-do-cliente.test.ts` — precisa da API no ar contra o
  banco de teste (ver o README da raiz).
