# Wiki do espaço de trabalho

Data: 2026-09-22 · Worker W11. Substitui o chamariz "Wiki" de plano pago (removido de
`apps/web/core/constants/plans.tsx`) e o "disco virtual" da intranet legada.

## 1. O modelo

**Página da wiki = `pages` sem nenhuma linha em `project_pages`.** Não há tabela nova nem
migration: a hierarquia já existia (`pages.parent_id`, `pages.sort_order`), assim como labels e
versões.

```
/workspaces/:slug/pages/...             ← a WIKI (mesmos handlers das páginas de sistema)
/workspaces/:slug/projects/:id/pages/...← páginas de SISTEMA
/workspaces/:slug/wiki/pages/           ← árvore da wiki em lista simples (parent_id, sort_order)
/workspaces/:slug/wiki/search/?search=  ← busca da wiki (título + texto)
```

`apps/api-ts/src/modules/page/index.ts` escolhe o escopo por **estratégia** (`ESCOPO_DO_SISTEMA`
/ `ESCOPO_DA_WIKI`, em `resolveScope`), pela presença de `project_id` na URL:

| | sistema | wiki |
| --- | --- | --- |
| quem pode | participar do sistema | `wiki.view` (ler) / `wiki.edit` (escrever) |
| o que enxerga | páginas vinculadas ao sistema | páginas sem sistema, públicas ou da própria pessoa |
| vínculo da página nova | o sistema da URL | nenhum |

Consequências que valem para os DOIS escopos (corrigidas junto):

- `loadPageOrFail` recebe o filtro do escopo: página de outro sistema não abre pela URL deste, e
  página de sistema não abre pela árvore do espaço (antes, qualquer membro lia/editava qualquer
  página do espaço por `/workspaces/:slug/pages/:id/`).
- O vínculo vem só da URL: `project_ids` no corpo do POST é ignorado (antes vinculava a página a
  qualquer sistema, sem conferir participação).

## 2. Permissões

Ações novas do catálogo (`apps/api-ts/src/utils/permissions.ts`, grupo "Wiki", escopo `workspace`):

- `wiki.view` "Ler a wiki": todas as funções de sistema (`TODOS`).
- `wiki.edit` "Escrever e organizar páginas da wiki": `ESCREVEM` (Qualidade, TI, Membro, Gestor).
  Atendimento e Visualizador só leem; a exceção por pessoa concede.

Travar, arquivar, excluir e mudar acesso continuam "dono ou `page.manage.all`" (`canManage`).
Mover na árvore e reordenar pedem só `wiki.edit` (a organização é coletiva; é reversível).

No web, `useWikiAcoes` (em `core/components/wiki/use-wiki.ts`) lê `/roles/me/` e leva as ações ao
`WorkspacePageStore` (`setMinhasAcoes`); o `WorkspacePage` decide o que mostrar. O item "Wiki" da
barra usa o campo novo `action` de `IWorkspaceSidebarNavigationItem`: `SidebarItemBase` esconde o
item sem a ação.

## 3. Árvore

Regras de servidor em `apps/api-ts/src/utils/arvore-de-paginas.ts`:

- pai precisa existir **no mesmo escopo**; a própria página ou uma descendente como pai é 400
  (um ciclo tiraria a subárvore inteira da tela);
- página nova entra depois das irmãs (`getNextSortOrder`, passo 10.000);
- arquivar/restaurar leva a subárvore (como o Django); restaurar a filha de um pai ainda
  arquivado solta ela do pai;
- excluir solta as filhas para a raiz.

Regras de tela em `packages/utils/src/wiki.ts` (fonte única, testadas em
`packages/utils/tests/wiki.test.ts`): `buildWikiTree` (mãe ausente ou ciclo sobe para a raiz),
`getSortOrderBetween` (subir/descer/mover), `getWikiMoveTargets`, `getWikiPageAncestors`
(trilha do cabeçalho) e `getPaginaPath` (endereço de qualquer página: com sistema abre no
sistema, sem sistema abre em `/wiki/:id`). Paleta, busca global, recentes e favoritos usam
`getPaginaPath`.

Mover/reordenar no web usa `movePageInTree`, que manda **só** `{parent_id, sort_order}`:
`BasePage.update` manda a página inteira (herdado do Plane) e trocaria o resto.

## 4. Editor, versões e live

- A página da wiki usa o mesmo `PageRoot` (`app/(all)/[workspaceSlug]/(projects)/wiki/[pageId]`),
  com `EPageStoreType.WORKSPACE` (agora objeto `as const`) e `documentType: "workspace_page"`.
- `apps/live`: `WorkspacePageService` (base `/api/workspaces/:slug`) e mapa por tipo em
  `services/page/handler.ts`; a exportação em PDF decide o tipo pela presença do sistema.
- **Versões**: o `live` grava o conteúdo por `/description/`, que antes não versionava nada. Agora
  `savePageVersion` (`@utils/versoes-da-pagina`) guarda o HTML anterior por **sessão de edição**
  (mesma janela do corpo do chamado, `isMesmaSessao`), poda em 20 e ignora conteúdo igual ou
  vazio. O PATCH da página (título, mover, reordenar) não gera versão sem mudar o conteúdo.
  A restauração continua no cliente (o `PageRoot` troca o conteúdo no editor e o `live` grava).

## 5. Bloco de anexo

`packages/editor/src/core/extensions/attachment/`: nó `attachmentComponent`
(`<attachment-component src name size mimetype>`), só no **editor de documentos** (páginas e
wiki), desligável por `"attachment"` em `disabledExtensions`.

- Entra pelo menu "/" ("Anexo", abre o seletor uma vez só na aba de quem inseriu) ou soltando um
  arquivo de tipo aceito no editor.
- Sobe pelo `fileHandler.upload` (o mesmo das imagens): na wiki vira asset do espaço, no sistema
  asset do sistema. O cartão baixa por `getAssetDownloadSrc` (rota de download com auditoria LGPD).
- O nó está em `DocumentEditorExtensionsWithoutProps`: sem isso o `live` perderia o anexo ao
  converter HTML em Yjs (teste `apps/live/tests/editor/attachment-roundtrip.test.ts`).
- PDF exportado: "Anexo: nome do arquivo".

## 6. Busca

`findPaginas` (`@utils/search`) é a fonte única: FTS `pt_unaccent` sobre título + texto
(`idx_pages_fts`) e trigrama/ILIKE no título (`idx_pages_name_trgm`), só páginas ativas e
visíveis. `findPaginasDaPessoa` recorta pelo que a pessoa enxerga (`wiki.view` + sistemas de que
participa) e alimenta `/search/` (paleta, campo `page`) e `/global-search/` (modal Ctrl+G, que
ganhou a seção "Páginas"). Radical português não junta plural em "-ões" com "-ão"
("certidao" não acha "certidões"); é limite do stemmer, igual na busca de chamados.

`buscarChamados` virou `findChamados` (verbo em inglês).

## 7. Importação do legado

`apps/api-ts/scripts/import-wiki-legado.ts` (idempotente, `DRY_RUN`), HTML em
`@utils/wiki-legado` (testes em `tests/unit/wiki-legado.test.ts`):

- `DISCO_DIR` (padrão: a pasta `arquivos_disco` da intranet) vira a página **Processos**, um
  título + bloco de anexo por arquivo; título pelo cadastro `arquivos` do MySQL quando o nome
  casa, senão pelo nome do arquivo.
- FAQ (`faq_categorias` > `faq_subcategorias` > `faq_questoes`): página "FAQ" com uma filha por
  categoria que tenha pergunta. **No MySQL de dev o FAQ tem 1 categoria "teste" e 0 perguntas**:
  nada é criado.
- Dona das páginas: `IMPORT_OWNER_EMAIL` ou o admin mais antigo do espaço.

```
DATABASE_URL=... WORKSPACE_SLUG=quality bun run scripts/import-wiki-legado.ts
```

## 8. Testes

- `apps/api-ts/tests/contract/wiki.test.ts` (22): árvore, mover/ciclo, arquivar/restaurar/excluir,
  privada, permissões com exceção por pessoa, versões por sessão, busca, paleta.
- `apps/api-ts/tests/contract/pages.test.ts`: + escopo de sistema e vínculo só pela URL.
- `apps/api-ts/tests/unit/catalogo-de-acoes.test.ts`: donos de `wiki.view`/`wiki.edit`.
- `packages/utils/tests/wiki.test.ts`, `apps/live/tests/services/page/handler.test.ts`,
  `apps/live/tests/editor/attachment-roundtrip.test.ts`, PDF em `pdf-rendering.test.ts`.

## 9. Pendências

1. Arrastar e soltar na árvore: hoje é "Subir", "Descer" e "Mover para" pelo menu da linha.
2. Mover página da wiki para um sistema (e vice-versa) pela tela: a API aceita
   (`POST /pages/:id/move/`), mas o `MovePageModal` do CE é um stub (`return null`).
3. Labels de página na wiki: o modelo tem `PageLabel`, a tela não mostra.
4. Anexo removido do texto não apaga o arquivo do armazenamento (a imagem tem esse controle).
5. Os `enum` do editor (`CORE_EXTENSIONS`, `ECustomImage*`) e `EPageAccess` seguem herdados do
   Plane; convertê-los mexe em dezenas de arquivos.
6. O restante das páginas continua sem filtro de página privada no escopo de sistema (a wiki
   filtra); a tela esconde, a API não barra.
