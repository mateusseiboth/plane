# Mural de recados (homepage)

Data: 2026-09-22 · Worker W13. Substitui o `intra_mural*.php` da intranet legada
(`envia_msg_mural.php`, `atualizaMural.php`, tabela `mural_lido`). Decisão do usuário: o mural
fica na HOME de cada pessoa, e só quem tem permissão publica.

## 1. Quem pode o quê

- **Ação `mural.publish`** ("Publicar recados no mural"), escopo `workspace`, grupo Espaço de
  trabalho. Padrão: **Gestor e admin**. Os demais recebem por exceção por pessoa (tela de Funções).
- Com a ação: publicar, editar, inativar/reativar, ver inativos no histórico e ver quem leu.
- Sem a ação: todo membro ativo do espaço LÊ (inclusive Visualizador).
- Checagem no servidor com `requireWorkspaceAction` (escritas e `/readers/`) e
  `hasWorkspaceAction` (decide se inativo existe para quem pergunta). No front, os botões somem
  por `useMyWorkspaceActions(slug).can("mural.publish")`.

## 2. Modelo (migração `20260922140000_mural_de_recados`)

- `mural_recados` (`MuralRecado`): título (até 200), `description_html` + `description_stripped`,
  `author_id`, `published_at`, `expires_at` (validade), `is_pinned`, `is_required`
  (leitura obrigatória), `is_active`, `attachment_id` (um `file_assets` do espaço).
  FK só para `workspaces` (cascata). Autor e anexo SEM FK de propósito: o recado sobrevive à conta
  desativada e ao anexo apagado (mesmo padrão de `issue_unreads`, e evita tocar no model `User`,
  que todos os workers editam).
- `mural_leituras` (`MuralLeitura`): `(recado_id, user_id)` + `read_at`. Existe = leu. A primeira
  leitura é a que vale (reabrir não muda a data).

## 3. API (`apps/api-ts/src/modules/mural`)

Camadas: `index.ts` (rotas finas) → `mural.service.ts` (regra, dependências injetadas) →
`mural.dao.ts` (Prisma). Regras puras em `mural.rules.ts`, erros tipados em `mural.errors.ts`,
contrato snake_case em `mural.serialize.ts`.

| Rota (`/api/v1/workspaces/:slug/mural`) | Quem | O que faz |
| --- | --- | --- |
| `GET /` | membro | Histórico paginado (`per_page`, `cursor`), `desde`/`ate` (data pura = dia inteiro no fuso do escritório), `inactive=true` só vale para quem publica |
| `GET /home/` | membro | Vigentes: TODO não lido, TODO fixado e os 3 lidos comuns mais novos. Ordem: não lido, fixado, mais novo |
| `GET /pending-required/` | membro | Obrigatórios vigentes ainda não lidos, do mais antigo ao mais novo |
| `GET /:id/` | membro | Um recado (inativo = 404 para quem não publica). Não grava leitura |
| `POST /` | `mural.publish` | Cria (201). Erro de campo volta 400 com `errors: [{path, message}]` |
| `PATCH /:id/` | `mural.publish` | Edita qualquer campo, inclusive `is_active` (inativar/reativar) |
| `POST /:id/read/` | membro | Grava a leitura (204, idempotente) |
| `GET /:id/readers/` | `mural.publish` | `{read: [pessoa + read_at], unread: [pessoa]}` sobre os membros ativos (sem bot) |

- Vigente = ativo e sem validade vencida. Vencido sai da home e do aviso, mas fica no histórico
  com `is_expired: true`.
- Validade em data pura (`2026-09-30`) vale até o FIM do dia (`vencimentoRecebido` de
  `@utils/prazo`). Validade no passado é recusada.
- Anexo: o front sobe o arquivo pela rota de assets do espaço (`/assets/v2/workspaces/:slug/`) e
  manda o `attachment_id`; a API só aceita arquivo do MESMO espaço. O download usa a rota de assets
  existente (que já audita o acesso).
- Texto rico: HTML do editor do projeto. Recado só com imagem é aceito.

## 4. Tempo real e sino

- Criar e editar publicam `{entity: "mural", action}` no SSE (`@utils/realtime`). O front
  (`useMuralRealtime` em `core/hooks/use-mural.ts`) revalida todas as chaves SWR `MURAL_*`.
- Criar grava uma notificação por membro ativo (menos o autor) com `entity: "mural"`,
  `entity_id` = id do recado, `triggered: "mural"`, e acende o sino de cada um
  (`notifyMuralPublished` em `@utils/notifications`). Editar NÃO notifica de novo.
- O cartão do sino é escolhido pela entidade (`ITEM_POR_ENTIDADE` em
  `notification-card/item.tsx`): `mural` → `NotificationMuralItem`, que abre
  `/:slug/mural/?recado=<id>`.

## 5. Tela (`apps/web`)

- `core/components/mural/`: `home-section` (seção no topo da home), `recado-card`,
  `recado-modal` (abrir grava a leitura; o obrigatório só com "Confirmar leitura"),
  `recado-form-modal` (editor rico, validade, anexo, fixado, obrigatório; erros voltam para o
  campo), `leitores`, `aviso-obrigatorio`, `modais` (estado compartilhado) e `helpers` (puro,
  testado em `helpers.test.ts`).
- Página `/:slug/mural` (`app/(all)/[workspaceSlug]/(projects)/mural/page.tsx`): histórico,
  filtro De/Até, "Mostrar inativos" para quem publica, paginação.
- Sidebar: item `mural` em `WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS` (`@plane/constants`),
  rótulo `sidebar.mural` (`@plane/i18n`), ícone `Megaphone`. Rebuild do dist dos dois pacotes.
- Aviso de entrada: `MuralAvisoObrigatorio` montado em `workspace-wrapper.tsx`, vale em qualquer
  tela do espaço. Não fecha sem confirmar.

## 6. Decisões (conservadoras) e limites

- `published_at` é o momento da criação, gravado pelo servidor. Não há agendamento (o legado
  deixava digitar data e hora; nada aqui dependia disso).
- Editar um recado não zera as leituras.
- Recado obrigatório conta como lido só pela confirmação explícita (no aviso ou no botão do
  recado). Os demais contam ao abrir.
- Não há exclusão: inativar é o "apagar" do legado (`atualizaMural.php`).
- Imagem colada no texto sobe como `PAGE_DESCRIPTION` e o anexo como `WORKSPACE_LOGO`
  (`EFileAssetType` é enum herdado do Plane, sem valor do mural). Só afeta o `entity_type` gravado
  em `file_assets.attributes`.
- Não migra os recados do MySQL legado (fora do escopo pedido).
