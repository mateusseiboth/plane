# Plugins: onde fica e como se gerencia

Plugin é um pacote `.zip` com `manifest.json` + bundle ESM. Ele acrescenta
páginas e itens de menu ao produto, roda dentro da árvore React do host
(`apps/web/core/lib/plugin-module-runtime.ts`) e fala com a API pelo gateway do
SDK. O plugin de referência é o **backup-manager**, que vive em repositório
separado (`~/dev/backup-manager-plugin`).

## A tela

**Configurações do espaço > Administração > Plugins** — `/<slug>/settings/plugins`.

O que ela faz:

- **lista** o que está instalado (nome, slug, versão, descrição, ligado/desligado,
  data do último envio);
- **envia** um pacote `.zip` novo. O registro recusa versão igual ou menor que a
  instalada, e esse erro volta no campo do arquivo (`errors: [{path: "file"}]`);
- **liga e desliga** o plugin (desligado, ele some do menu e das rotas);
- **remove** (exclusão lógica; reenviar o mesmo slug reativa o MESMO cadastro,
  com a configuração e as permissões que ele já tinha);
- por plugin, abre dois painéis:
  - **Permissões**: grade função × permissão declarada no manifesto
    (`definedPermissions`), gravada em `plugin_permission_grants`;
  - **Configuração**: os campos chave/valor que o manifesto declara em
    `configSchema`, pela rota de configuração do gateway.

Arquivos:

| Onde | O quê |
|---|---|
| `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/plugins/` | página e cabeçalho |
| `apps/web/core/components/plugins/gestao/` | envio, lista, permissões, configuração e as regras puras |
| `apps/web/core/services/plugins.service.ts` | cliente HTTP |
| `apps/web/core/hooks/use-plugins-gestao.ts` | SWR |
| `apps/api-ts/src/modules/plugin-registry/gestao.ts` | rotas do espaço |
| `apps/api-ts/src/modules/plugin-registry/upload.ts` | pipeline do `.zip`, compartilhado com a rota global |
| `apps/api-ts/src/modules/plugin-registry/grants.ts` | regras puras da grade (validação e diff) |

### Existe outra tela, e ela não é a mesma coisa

`/settings/plugins` (sem o espaço na URL, no menu "Extensões" das configurações
do perfil, ao lado de Widgets) é a tela de INSTÂNCIA, para admin de instância e
grupo TI. Ela só envia, liga e desliga o pacote, porque nesse nível não existe
espaço e, sem espaço, não existe função a quem conceder permissão nem
configuração por espaço. Para permissões e configuração, use a tela do espaço.

## Permissão

A ação é `plugin.manage` (`ACTION_CATALOG` em
`apps/api-ts/src/utils/permissions.ts`, grupo "Cadastros e integrações"), padrão
só do Administrador. Não há catálogo espelhado no frontend: a tela pergunta ao
backend por `GET /workspaces/:slug/roles/me/` (`useMyWorkspaceActions`).

Ela também vale fora da tela:

- `POST /api/v1/plugins/` (a rota global, de chave de API) passou a aceitar quem
  tem `plugin.manage` em algum espaço, além de admin de instância, superusuário
  e grupo TI (`apps/api-ts/src/utils/registry-access.ts`);
- `PUT /api/v1/plugin-sdk/config` aceita quem tem `plugin.manage` no espaço, além
  de admin de instância e de quem tem a permissão `*.admin` do próprio plugin.

## Rotas

Todas exigem `plugin.manage` no espaço.

| Método | Rota | O quê |
|---|---|---|
| GET | `/api/v1/workspaces/:slug/plugins/` | lista os instalados |
| POST | `/api/v1/workspaces/:slug/plugins/` | envia o `.zip` (multipart `file`) |
| POST | `/api/v1/workspaces/:slug/plugins/:id/toggle/` | `{is_active}` liga ou desliga |
| DELETE | `/api/v1/workspaces/:slug/plugins/:id/` | remove |
| GET | `/api/v1/workspaces/:slug/plugins/:id/grants/` | funções, permissões do manifesto e a grade |
| PUT | `/api/v1/workspaces/:slug/plugins/:id/grants/` | grava a grade (idempotente) |

Continuam existindo as rotas de instância do registro (`/api/v1/plugins/...`:
envio, `active`, versões, arquivos do bundle) e as do gateway do SDK
(`/api/v1/plugin-sdk/...`: dados, configuração, permissões efetivas, proxy).

### A grade de permissões

O corpo do `PUT` é `{"grants": {"<id da função>": ["chave.da.permissao", ...]}}`.
A gravação é um **diff**: repetir a mesma grade não escreve linha nenhuma.

O que vai para o banco é o **nível** da função (`subject_id`), não o id: é o
nível que a associação da pessoa carrega (`workspace_members.role`) e é por ele
que o gateway resolve as permissões em tempo de execução
(`resolvePluginPermissions`).

Erro de validação volta por linha da grade:
`errors: [{path: "grants.<id da função>", message: "..."}]`.

## Testes

- `apps/api-ts/tests/contract/plugins-gestao.test.ts` — contrato (listar, enviar,
  ligar/desligar, grade, configuração e o 403 de quem não tem a ação);
- `apps/api-ts/tests/unit/plugin-grants.test.ts` — regras puras da grade;
- `apps/web/core/components/plugins/gestao/gestao-rules.test.ts` — grade e leitura
  dos erros de campo no frontend.
