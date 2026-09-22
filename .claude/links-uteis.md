# Links úteis

Data: 2026-09-22 · Worker W21.

Uma página que REÚNE os endereços que a equipe precisa passar para cliente, candidato e TV,
para ninguém ter de procurar (nem colar um link que não abre). Tela em
`/<slug>/links-uteis`, item "Links úteis" na barra lateral do espaço.

## 1. A decisão que sustenta tudo: caminho relativo

A API devolve **CAMINHO relativo** (`/portal?workspace=quality`), nunca endereço completo.
Quem monta `origem + caminho` é a tela, com `window.location.origin`.

Sem isso a equipe copiaria `http://localhost:3000/portal?...` de um ambiente de
desenvolvimento e mandaria para o cliente. Há teste, nos dois lados, de que nenhum caminho
carrega `http`/`localhost`.

```
GET /api/v1/workspaces/:slug/links-uteis/   → { grupos: TGrupoDeLinks[] }
```

## 2. Onde cada coisa mora

| Camada | Arquivo |
| --- | --- |
| Catálogo (puro, sem banco) | `apps/api-ts/src/modules/links-uteis/links-uteis.ts` |
| Contexto (configuração + permissão) | `apps/api-ts/src/modules/links-uteis/links-uteis.service.ts` |
| Sistemas do espaço | `apps/api-ts/src/modules/links-uteis/links-uteis.dao.ts` |
| Rota | `apps/api-ts/src/modules/links-uteis/index.ts` |
| Leitura do chat ligado (fonte única) | `apps/api-ts/src/utils/chat-config.ts` |
| Serviço do web | `apps/web/core/services/links-uteis.service.ts` |
| Hook | `apps/web/core/hooks/use-links-uteis.ts` |
| Montagem do endereço (puro) | `apps/web/core/components/links-uteis/helpers.ts` |
| Cartão | `apps/web/core/components/links-uteis/cartao-de-link.tsx` |
| Página | `apps/web/app/(all)/[workspaceSlug]/(projects)/links-uteis/page.tsx` |
| Item da barra lateral | `packages/constants/src/workspace.ts` (`links-uteis`) |

Testes: `apps/api-ts/tests/unit/links-uteis.test.ts` (catálogo),
`apps/api-ts/tests/contract/links-uteis.test.ts` (rota e permissões),
`apps/web/core/components/links-uteis/helpers.test.ts` (montagem do endereço).

## 3. O formato do cartão

```ts
type TCartaoDeLink = {
  chave, titulo,
  descricao,   // para que serve, em uma linha
  quemUsa,     // quem pode usar
  caminho,     // link pronto; vazio quando há campo ou aviso
  campo,       // { rotulo, exemplo, prefixo, sufixo, opcoes } — a tela monta prefixo+valor+sufixo
  aviso,       // configuração que falta; COM aviso não há link
};
```

Três estados, nunca misturados:

1. **Link pronto** (portal, painéis, webhooks, god mode).
2. **Link com campo**: o endereço só existe depois que a pessoa escolhe um valor.
   Lista fechada (o `system` do chat, com os sistemas do espaço) ou campo livre
   (o protocolo da transcrição). A tela escapa o valor com `encodeURIComponent`.
3. **Aviso no lugar do link**: falta configuração. Dizer "as inscrições estão desligadas"
   vale mais do que entregar um endereço que responde 403.

## 4. Quem vê o quê

| Grupo | Regra |
| --- | --- |
| Para o cliente, Para candidato, Painéis de TV, Internos úteis | todo membro do espaço |
| Integrações (Z-API, FreePBX) | `chat.administrar` (exigem token, então só quem administra) |
| Cartão "God mode" | administrador da instância (`isInstanceAdmin`/`isSuperuser`) |

A página **não criou ação nova** no `ACTION_CATALOG`: ela só reúne endereços, e o recorte é
feito no servidor com ações que já existiam. A rota exige apenas `requireWorkspaceMember`.

## 5. Os endereços, conferidos no código

| Cartão | Caminho | Onde está |
| --- | --- | --- |
| Portal do cliente | `/portal?workspace=<slug>` | `apps/api-ts/src/modules/portal`, nginx `location ~ ^/portal` |
| Chat do cliente | `/chat-api/client?workspace=<slug>&system=<IDENT>` | `apps/chat-backend/src/index.ts` `.get("/client")`; sem `?workspace=` a página recusa |
| Trabalhe conosco | `/trabalhe-conosco?workspace=<slug>` | `apps/api-ts/src/modules/trabalhe-conosco` |
| Painéis de TV | `/<slug>/painel/<setor>` | rota do web + `SETORES_DO_PAINEL` |
| Webhook da Z-API | `/chat-api/providers/zapi/webhook/<slug>/` | `apps/chat-backend/src/webhook/zapi.ts` |
| Ligações do FreePBX | `/chat-api/workspaces/<slug>/telefonia/ligacoes/` | `apps/chat-backend/src/ligacoes/routes.ts` |
| Transcrição | `/<slug>/chat-view/<protocolo>` | rota do web |
| God mode | `/god-mode/` | nginx `location /god-mode` |

## 6. Painéis de TV: a lista vem do catálogo do painel, não daqui

`buildPaineis` percorre **`SETORES_DO_PAINEL`** (`apps/api-ts/src/modules/reports/painel-tv/painel-tv.ts`)
e usa o `titulo` da própria strategy do painel. Hoje são `ti` e `qualidade`.

Setor novo (atendimento, mapa, backups) **aparece sozinho** assim que entrar naquele mapa:
nada a mexer aqui. E setor que ainda não existe nunca vira cartão, então a página não promete
uma URL que responde 404.

Os cartões levam ao endereço **sem `?key=`**: hoje o painel abre para quem está logado. Quando
a gestão de chaves de painel entrar, acrescente a chave ao cartão e ajuste o `quemUsa`.

## 7. Armadilhas

- **Chat ligado** sai de `Instance.configurations.chat.enabled`, lido por `readChatConfig()`
  (`@utils/chat-config`). A rota `GET /workspaces/:slug/chat-config/` passou a usar o mesmo
  leitor: era a mesma pergunta respondida em dois lugares.
- **Espaço sem sistema cadastrado** não gera link de chat: o `system=` ficaria vazio e o
  pré-chat abriria sem sistema. O cartão avisa em vez de entregar o link.
- **Inscrição de currículo** é `curriculo_config.site_enabled`, ligada na tela de Currículos.
  Há também a rota pública `GET /trabalhe-conosco/api/config?workspace=<slug>` para quem
  precisar da situação fora do Plane.
- **Em desenvolvimento sem nginx**, `/portal`, `/trabalhe-conosco` e `/chat-api/*` não
  respondem no endereço do vite: quem serve esses caminhos é o proxy. Os cartões continuam
  certos; é o ambiente que não tem a porta aberta.
