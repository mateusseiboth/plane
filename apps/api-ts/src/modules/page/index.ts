import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getProjectOrFail, getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";
import { EProjectAction, hasWorkspaceAction, requireWorkspaceAction } from "@utils/permission-checks";
import {
  detachFilhas,
  detachFromParentArquivado,
  findSubarvore,
  getNextSortOrder,
  requireParentValido,
  setArchivedSubarvore,
} from "@utils/arvore-de-paginas";
import { savePageVersion } from "@utils/versoes-da-pagina";
import { findPaginas } from "@utils/search";

/**
 * Contexto mínimo que os handlers de página consomem. Tipar só o que é usado
 * permite registrar a MESMA função nas duas árvores de rota (workspace e
 * projeto), que diferem apenas pelo `project_id` a mais em `params`.
 */
type PageContext = {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  user: { id: string };
  set: { status?: number | string };
};

/**
 * Relações necessárias para serializar uma página. `projects` é obrigatório: o
 * frontend monta a URL de toda ação seguinte (editar, travar, duplicar) a partir
 * de `project_ids[0]`; sem ele a página até abre, mas nenhum botão funciona.
 */
const PAGE_RELATIONS = {
  labels: { include: { label: true } },
  projects: true,
  children: { where: { deletedAt: null }, select: { id: true } },
} as const;

/** `UserFavorite.entityType` das páginas — mesmo valor usado pelo Django. */
const TIPO_FAVORITO_PAGINA = "page";

/** Conjunto vazio reaproveitado: evita alocar um Set por página serializada. */
const SEM_FAVORITOS: ReadonlySet<string> = new Set();

/**
 * Página no formato que o frontend consome (`TPage`, snake_case). O objeto cru do
 * Prisma chega com `isLocked`/`descriptionHtml`/`ownedById`, que a UI lê como
 * `undefined` — bloqueio, conteúdo e dono somem da tela.
 */
function serializePage(p: any, favoritas: ReadonlySet<string> = SEM_FAVORITOS) {
  return {
    id: p.id,
    name: p.name,
    access: p.access,
    color: p.color ?? "",
    description_html: p.descriptionHtml ?? "<p></p>",
    description_json: p.descriptionJson ?? undefined,
    description_stripped: p.descriptionStripped ?? "",
    is_locked: p.isLocked ?? false,
    is_global: p.isGlobal ?? false,
    is_favorite: favoritas.has(p.id),
    archived_at: p.archivedAt ?? null,
    deleted_at: p.deletedAt ?? undefined,
    owned_by: p.ownedById ?? null,
    created_by: p.createdById ?? null,
    updated_by: p.updatedById ?? p.createdById ?? null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    workspace: p.workspaceId,
    parent: p.parentId ?? null,
    parent_id: p.parentId ?? null,
    sort_order: p.sortOrder ?? 0,
    logo_props: p.logoProps ?? undefined,
    label_ids: (p.labels ?? []).map((l: any) => l.labelId ?? l.label?.id).filter(Boolean),
    project_ids: (p.projectPages ?? p.projects ?? []).map((pp: any) => pp.projectId).filter(Boolean),
    sub_pages_count: (p.children ?? []).length,
  };
}

/**
 * Versão no formato `TPageVersion`. A tela de histórico lê `description_html` e
 * `last_saved_at`; devolvendo o objeto cru do Prisma a versão abre em branco.
 */
function serializePageVersion(v: any) {
  return {
    id: v.id,
    page: v.pageId,
    workspace: v.workspaceId,
    owned_by: v.ownedById ?? null,
    created_by: v.ownedById ?? null,
    updated_by: v.ownedById ?? null,
    last_saved_at: v.lastSavedAt,
    description_binary: null,
    description_html: v.descriptionHtml ?? "<p></p>",
    description_json: v.descriptionJson ?? undefined,
    description_stripped: v.descriptionStripped ?? "",
    created_at: v.createdAt,
    updated_at: v.createdAt,
    deleted_at: null,
  };
}

/** O que a rota faz com a página: ler ou escrever. Decide a ação exigida na wiki. */
type Acesso = "read" | "write";

/**
 * As duas árvores de rota das páginas, como estratégias. Diferem em três pontos:
 *  - quem pode (`authorize`): no sistema, participar dele; na wiki, a ação da
 *    matriz (`wiki.view` para ler, `wiki.edit` para escrever);
 *  - o que se enxerga (`filtro`): no sistema, as páginas vinculadas a ele; na
 *    wiki, as SEM vínculo com sistema e, entre elas, as públicas ou da pessoa;
 *  - a que sistemas uma página nova se vincula (`vinculos`).
 * O escopo vem só da URL: o corpo não escolhe sistema (antes, `project_ids` no
 * corpo vinculava a página a qualquer sistema, sem conferir participação).
 */
type EscopoStrategy = {
  authorize: (workspaceId: string, params: Record<string, string>, userId: string, acesso: Acesso) => Promise<unknown>;
  filtro: (workspaceId: string, params: Record<string, string>, userId: string) => Record<string, unknown>;
  vinculos: (params: Record<string, string>) => string[];
};

const ACAO_DA_WIKI: Record<Acesso, EProjectAction> = {
  read: EProjectAction.WIKI_VIEW,
  write: EProjectAction.WIKI_EDIT,
};

const ESCOPO_DO_SISTEMA: EscopoStrategy = {
  authorize: (workspaceId, params, userId) =>
    getProjectOrFail(workspaceId, params.project_id, userId, { allowInstanceAdmin: true }),
  filtro: (workspaceId, params) => ({
    workspaceId,
    deletedAt: null,
    projects: { some: { projectId: params.project_id } },
  }),
  vinculos: (params) => [params.project_id],
};

const ESCOPO_DA_WIKI: EscopoStrategy = {
  authorize: (workspaceId, _params, userId, acesso) =>
    requireWorkspaceAction(workspaceId, userId, ACAO_DA_WIKI[acesso]),
  filtro: (workspaceId, _params, userId) => ({
    workspaceId,
    deletedAt: null,
    projects: { none: {} },
    OR: [{ access: 0 }, { ownedById: userId }],
  }),
  vinculos: () => [],
};

const pickEscopo = (params: Record<string, string>): EscopoStrategy =>
  params.project_id ? ESCOPO_DO_SISTEMA : ESCOPO_DA_WIKI;

/**
 * Autoriza a requisição no escopo em que ela chegou e devolve o filtro das
 * páginas que ela enxerga. Devolve `isAdmin` porque a UI libera travar/arquivar/
 * apagar para o dono OU para quem tem `page.manage.all`; sem isso o admin veria
 * o botão e levaria 403.
 */
async function resolveScope(params: Record<string, string>, userId: string, acesso: Acesso) {
  const ws = await getWorkspaceOrFail(params.slug);
  await requireWorkspaceMember(ws.id, userId);
  const escopo = pickEscopo(params);
  await escopo.authorize(ws.id, params, userId, acesso);
  return {
    ws,
    filtro: escopo.filtro(ws.id, params, userId),
    vinculos: escopo.vinculos(params),
    isAdmin: await hasWorkspaceAction(ws.id, userId, EProjectAction.PAGE_MANAGE_ALL),
  };
}

/** Carrega a página com as relações da serialização, presa ao escopo da URL. */
function loadPageOrFail(filtro: Record<string, unknown>, pageId: string) {
  return prisma.page.findFirstOrThrow({
    where: { ...filtro, id: pageId },
    include: PAGE_RELATIONS,
  });
}

/** Chave do favorito de página: um registro por (usuário, página). */
function chaveFavorita(workspaceId: string, pageId: string, userId: string) {
  return { workspaceId, userId, entityType: TIPO_FAVORITO_PAGINA, entityId: pageId };
}

/**
 * Quais das páginas informadas o usuário marcou como favoritas. `is_favorite`
 * vinha sempre `false`: a estrela apagava sozinha a cada recarga da listagem.
 */
async function favoritasDoUsuario(userId: string, pageIds: string[]): Promise<ReadonlySet<string>> {
  if (!pageIds.length) return SEM_FAVORITOS;
  const favoritos = await prisma.userFavorite.findMany({
    where: { userId, entityType: TIPO_FAVORITO_PAGINA, entityId: { in: pageIds }, deletedAt: null },
    select: { entityId: true },
  });
  return new Set(favoritos.map((f) => f.entityId));
}

/** Serializa uma página resolvendo antes se ela é favorita do usuário. */
async function serializePageForUser(page: any, userId: string) {
  return serializePage(page, await favoritasDoUsuario(userId, [page.id]));
}

/** Serializa uma lista com uma única consulta de favoritos para todas. */
async function serializePagesForUser(pages: any[], userId: string) {
  const favoritas = await favoritasDoUsuario(
    userId,
    pages.map((p) => p.id)
  );
  return pages.map((p) => serializePage(p, favoritas));
}

/** Aplica um patch e já devolve a página no formato do frontend. */
async function savePage(pageId: string, data: any, userId: string) {
  const page = await prisma.page.update({ where: { id: pageId }, data, include: PAGE_RELATIONS });
  return serializePageForUser(page, userId);
}

const HTML_TAGS = /<[^>]+>/g;

/** Só o dono ou quem tem `page.manage.all` mexe no ciclo de vida da página. */
function canManage(page: { ownedById: string }, userId: string, isAdmin: boolean) {
  return page.ownedById === userId || isAdmin;
}

/** Filtro de "arquivadas ou não" das listagens. */
const filtroDeArquivo = (arquivadas: boolean) => ({ archivedAt: arquivadas ? { not: null } : null });

/** Ordem da árvore: a posição entre as irmãs, e a mais antiga primeiro no empate. */
const ORDEM_DA_ARVORE = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

/**
 * Campos do PATCH da página e como cada um vira coluna. `parent_id` e
 * `sort_order` são o mover e o reordenar da árvore.
 */
const CAMPOS_DO_PATCH: Record<string, (valor: any) => Record<string, unknown>> = {
  name: (valor) => ({ name: valor }),
  description_html: (valor) => ({
    descriptionHtml: valor,
    descriptionStripped: String(valor).replace(HTML_TAGS, ""),
  }),
  description: (valor) => ({ descriptionJson: valor }),
  access: (valor) => ({ access: valor }),
  color: (valor) => ({ color: valor }),
  sort_order: (valor) => ({ sortOrder: Number(valor) }),
  parent_id: (valor) => ({ parentId: valor ?? null }),
};

function buildPatchData(corpo: Record<string, unknown>, userId: string) {
  return Object.entries(CAMPOS_DO_PATCH)
    .filter(([campo]) => corpo[campo] !== undefined)
    .reduce<Record<string, unknown>>((data, [campo, paraColuna]) => ({ ...data, ...paraColuna(corpo[campo]) }), {
      updatedById: userId,
    });
}

/** O frontend manda o pai como `parent_id`; chamadas antigas, como `parent`. */
const readParentId = (corpo: Record<string, any>): string | null => corpo.parent_id ?? corpo.parent ?? null;

// ── Handlers ────────────────────────────────────────────────────────────────
// Cada handler é registrado nas DUAS árvores de rota (wiki do espaço e sistema).

async function listWorkspacePages({ params, query, user }: PageContext) {
  const { filtro } = await resolveScope(params, user.id, "read");
  const where: any = { ...filtro, ...filtroDeArquivo(query.archived === "true") };
  return paginate({
    query: (skip, take) =>
      prisma.page.findMany({ where, skip, take, include: PAGE_RELATIONS, orderBy: { updatedAt: "desc" } }),
    count: () => prisma.page.count({ where }),
    cursor: query.cursor,
    transform: (items) => serializePagesForUser(items, user.id),
  });
}

/**
 * `ProjectPageService.fetchAll` itera o retorno com `for..of` e tipa como
 * `TPage[]`: aqui a resposta é uma lista simples de páginas serializadas, não o
 * envelope paginado (que a UI não consegue percorrer).
 */
async function listProjectPages({ params, query, user }: PageContext) {
  const { filtro } = await resolveScope(params, user.id, "read");
  const pages = await prisma.page.findMany({
    where: { ...filtro, ...filtroDeArquivo(query.archived === "true") },
    include: PAGE_RELATIONS,
    orderBy: { updatedAt: "desc" },
  });
  return serializePagesForUser(pages, user.id);
}

/**
 * Árvore da wiki: TODAS as páginas ativas que a pessoa enxerga, em lista simples
 * com `parent_id` e `sort_order`. A tela monta a hierarquia; uma lista só evita
 * uma requisição por nível ao abrir a barra lateral.
 */
async function listWikiTree({ params, user }: PageContext) {
  const { filtro } = await resolveScope(params, user.id, "read");
  const pages = await prisma.page.findMany({
    where: { ...filtro, archivedAt: null },
    include: PAGE_RELATIONS,
    orderBy: ORDEM_DA_ARVORE,
  });
  return serializePagesForUser(pages, user.id);
}

/** Busca dentro da wiki: título e texto das páginas que a pessoa enxerga. */
async function searchWiki({ params, query, user }: PageContext) {
  const { ws } = await resolveScope(params, user.id, "read");
  const achadas = await findPaginas({
    workspaceId: ws.id,
    userId: user.id,
    termo: query.search ?? query.q ?? "",
    limite: 50,
    includeWiki: true,
    projectIds: [],
  });
  return achadas.map(({ id, name, parent_id, excerpt }) => ({ id, name, parent_id, excerpt }));
}

/**
 * `ProjectPageService.fetchArchived` alimenta a aba "Arquivadas" e tipa o
 * retorno como `TPage[]`: a chamada não passa `?archived=true`, o filtro é a
 * própria rota. Envelope paginado aqui deixaria a aba vazia.
 */
async function listArchivedPages({ params, user }: PageContext) {
  const { filtro } = await resolveScope(params, user.id, "read");
  const pages = await prisma.page.findMany({
    where: { ...filtro, ...filtroDeArquivo(true) },
    include: PAGE_RELATIONS,
    orderBy: { archivedAt: "desc" },
  });
  return serializePagesForUser(pages, user.id);
}

/**
 * `ProjectPageService.fetchFavorites`, também tipado como `TPage[]`. Só páginas
 * ativas: arquivar remove o favorito, como no Django.
 */
async function listFavoritePages({ params, user }: PageContext) {
  const { ws, filtro } = await resolveScope(params, user.id, "read");
  const favoritos = await prisma.userFavorite.findMany({
    where: { workspaceId: ws.id, userId: user.id, entityType: TIPO_FAVORITO_PAGINA, deletedAt: null },
    select: { entityId: true },
    orderBy: { sequence: "asc" },
  });
  const ids = favoritos.map((f) => f.entityId);
  if (!ids.length) return [];

  const pages = await prisma.page.findMany({
    where: { ...filtro, id: { in: ids }, archivedAt: null },
    include: PAGE_RELATIONS,
    orderBy: { updatedAt: "desc" },
  });
  const favoritas = new Set(ids);
  return pages.map((p) => serializePage(p, favoritas));
}

/**
 * Marca/desmarca a página como favorita. Fábrica porque as duas pontas só
 * diferem pelo estado final: o frontend chama POST e DELETE na mesma URL e
 * ignora o corpo da resposta.
 */
const favoriteHandler =
  (favoritar: boolean) =>
  async ({ params, user, set }: PageContext) => {
    const { ws, filtro } = await resolveScope(params, user.id, "read");
    const page = await loadPageOrFail(filtro, params.page_id);
    await (favoritar ? markFavorita(ws.id, page, user.id) : unmarkFavorita(ws.id, page.id, user.id));
    set.status = 204;
    return null;
  };

/**
 * Idempotente e sem lixo: favoritar duas vezes não duplica a linha, e ligar a
 * estrela de novo reaproveita o registro que o DELETE apenas marcou como
 * excluído (senão cada clique deixaria uma linha morta em `user_favorites`).
 */
async function markFavorita(workspaceId: string, page: { id: string; name: string }, userId: string) {
  const chave = chaveFavorita(workspaceId, page.id, userId);
  const existente = await prisma.userFavorite.findFirst({ where: chave, orderBy: { createdAt: "desc" } });
  if (existente?.deletedAt === null) return;
  if (existente) {
    await prisma.userFavorite.update({ where: { id: existente.id }, data: { deletedAt: null, name: page.name } });
    return;
  }
  await prisma.userFavorite.create({ data: { ...chave, name: page.name } });
}

/** Exclusão lógica, como no resto do módulo de favoritos do workspace. */
function unmarkFavorita(workspaceId: string, pageId: string, userId: string) {
  return prisma.userFavorite.updateMany({
    where: { ...chaveFavorita(workspaceId, pageId, userId), deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

async function createPage({ params, body, user, set }: PageContext) {
  const { ws, filtro, vinculos } = await resolveScope(params, user.id, "write");
  const b = (body ?? {}) as any;
  const parentId = readParentId(b);
  await requireParentValido({ escopo: filtro, parentId });

  // A página nasce SEM nome e ganha um ao ser digitado no título do editor: é
  // assim que o botão "Nova página" funciona, ele manda só o `access`. Exigir
  // nome aqui devolvia 400 e nenhuma página era criada.
  const page = await prisma.page.create({
    data: {
      workspaceId: ws.id,
      ownedById: user.id,
      name: typeof b.name === "string" ? b.name : "",
      descriptionHtml: b.description_html ?? "<p></p>",
      descriptionStripped: (b.description_html ?? "").replace(HTML_TAGS, ""),
      descriptionJson: b.description ?? null,
      access: b.access ?? 0,
      color: b.color ?? "",
      isGlobal: b.is_global ?? false,
      parentId,
      sortOrder: b.sort_order ?? (await getNextSortOrder(ws.id, parentId)),
      createdById: user.id,
    },
  });

  // Na árvore de sistema o vínculo vem da URL: sem ele a página some da
  // listagem. Na wiki não há vínculo nenhum.
  if (vinculos.length) {
    await prisma.projectPage.createMany({
      data: vinculos.map((pid) => ({ projectId: pid, pageId: page.id, workspaceId: ws.id })),
      skipDuplicates: true,
    });
  }

  set.status = 201;
  return serializePageForUser(await loadPageOrFail(filtro, page.id), user.id);
}

async function getPage({ params, user }: PageContext) {
  const { filtro } = await resolveScope(params, user.id, "read");
  return serializePageForUser(await loadPageOrFail(filtro, params.page_id), user.id);
}

async function updatePage({ params, body, user, set }: PageContext) {
  const { filtro, isAdmin } = await resolveScope(params, user.id, "write");
  const page = await loadPageOrFail(filtro, params.page_id);
  if (page.isLocked && !canManage(page, user.id, isAdmin)) {
    set.status = 403;
    return { detail: "A página está bloqueada." };
  }

  const b = (body ?? {}) as Record<string, any>;
  if (b.parent_id !== undefined) await requireParentValido({ escopo: filtro, parentId: b.parent_id, pageId: page.id });

  await savePageVersion({ antes: page, htmlNovo: b.description_html, autorId: user.id });
  return savePage(page.id, buildPatchData(b, user.id), user.id);
}

/** Excluir não leva as filhas junto: elas sobem para a raiz (como no Django). */
async function deletePage({ params, user, set }: PageContext) {
  const { filtro, isAdmin } = await resolveScope(params, user.id, "write");
  const page = await loadPageOrFail(filtro, params.page_id);
  if (!canManage(page, user.id, isAdmin)) {
    set.status = 403;
    return { detail: "Apenas o dono da página pode excluí-la." };
  }
  await detachFilhas(page.id);
  await prisma.page.update({ where: { id: page.id }, data: { deletedAt: new Date() } });
  set.status = 204;
  return null;
}

/** Fábrica dos handlers de trava: muda só o valor gravado e a mensagem de erro. */
const lockHandler =
  (locked: boolean) =>
  async ({ params, user, set }: PageContext) => {
    const { filtro, isAdmin } = await resolveScope(params, user.id, "write");
    const page = await loadPageOrFail(filtro, params.page_id);
    if (!canManage(page, user.id, isAdmin)) {
      set.status = 403;
      return {
        detail: locked ? "Apenas o dono da página pode bloqueá-la." : "Apenas o dono da página pode desbloqueá-la.",
      };
    }
    return savePage(page.id, { isLocked: locked }, user.id);
  };

/**
 * Arquivar e restaurar levam a subárvore inteira: uma filha ativa sob um pai
 * arquivado ficaria fora da árvore (nenhum ancestral dela aparece). Restaurar a
 * filha de um pai que continua arquivado a solta do pai.
 */
const archiveHandler =
  (archived: boolean) =>
  async ({ params, user, set }: PageContext) => {
    const { ws, filtro, isAdmin } = await resolveScope(params, user.id, "write");
    const page = await loadPageOrFail(filtro, params.page_id);
    if (!canManage(page, user.id, isAdmin)) {
      set.status = 403;
      return {
        detail: archived ? "Apenas o dono da página pode arquivá-la." : "Apenas o dono da página pode restaurá-la.",
      };
    }
    // Página arquivada sai dos favoritos (mesma regra do Django): senão ela
    // continuaria listada na barra lateral apontando para um item invisível.
    if (archived) await unmarkFavorita(ws.id, page.id, user.id);
    if (!archived) await detachFromParentArquivado(page);
    await setArchivedSubarvore(page.id, archived ? new Date() : null);
    return serializePageForUser(await loadPageOrFail(filtro, page.id), user.id);
  };

async function updatePageAccess({ params, body, user, set }: PageContext) {
  const { filtro, isAdmin } = await resolveScope(params, user.id, "write");
  const page = await loadPageOrFail(filtro, params.page_id);
  if (!canManage(page, user.id, isAdmin)) {
    set.status = 403;
    return { detail: "Apenas o dono da página pode alterar o acesso." };
  }
  const access = Number((body as any)?.access ?? page.access);
  return savePage(page.id, { access, updatedById: user.id }, user.id);
}

async function listPageVersions({ params, user }: PageContext) {
  const { ws, filtro } = await resolveScope(params, user.id, "read");
  await loadPageOrFail(filtro, params.page_id);
  const versions = await prisma.pageVersion.findMany({
    where: { pageId: params.page_id, workspaceId: ws.id },
    orderBy: { lastSavedAt: "desc" },
  });
  // `fetchAllVersions` tipa o retorno como `TPageVersion[]`; o envelope paginado
  // quebraria o `.map` da linha do tempo do histórico.
  return versions.map(serializePageVersion);
}

async function getPageVersion({ params, user }: PageContext) {
  const { ws, filtro } = await resolveScope(params, user.id, "read");
  await loadPageOrFail(filtro, params.page_id);
  return serializePageVersion(
    await prisma.pageVersion.findFirstOrThrow({
      where: { id: params.version_id, pageId: params.page_id, workspaceId: ws.id },
    })
  );
}

/**
 * O servidor `live` e o fallback do editor pedem o estado do documento Yjs em
 * binário puro (`Y.encodeStateAsUpdate`), não JSON. Página sem binário responde
 * com corpo vazio de propósito: `apps/live` trata `byteLength === 0`
 * reconstruindo o Yjs a partir de `description_html` e regravando aqui.
 */
async function getPageDescription({ params, user }: PageContext) {
  const { filtro } = await resolveScope(params, user.id, "read");
  const page = await loadPageOrFail(filtro, params.page_id);
  return new Response(page.descriptionBinary ?? new Uint8Array(), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="page_description.bin"',
    },
  });
}

/**
 * `TDocumentPayload.description_binary` trafega em base64 (o `live` gera com
 * `convertBinaryDataToBase64String`); a coluna guarda os bytes decodificados.
 * Gravar a string crua faria o `Y.applyUpdate` do próximo fetch estourar.
 */
function decodeBinario(valor: unknown): Uint8Array<ArrayBuffer> | undefined {
  if (typeof valor !== "string") return undefined;
  return Uint8Array.from(Buffer.from(valor, "base64"));
}

/**
 * Gravação do conteúdo, feita quase sempre pelo `live`. O conteúdo anterior vira
 * versão (por sessão de edição, ver `@utils/versoes-da-pagina`).
 */
async function updatePageDescription({ params, body, user, set }: PageContext) {
  const { filtro, isAdmin } = await resolveScope(params, user.id, "write");
  const page = await loadPageOrFail(filtro, params.page_id);
  if (page.isLocked && !canManage(page, user.id, isAdmin)) {
    set.status = 403;
    return { detail: "A página está bloqueada." };
  }

  const b = (body ?? {}) as any;
  const html: string = b.description_html ?? page.descriptionHtml;
  await savePageVersion({ antes: page, htmlNovo: b.description_html, autorId: user.id });
  await prisma.page.update({
    where: { id: page.id },
    data: {
      descriptionHtml: html,
      descriptionStripped: String(html).replace(HTML_TAGS, ""),
      descriptionJson: b.description_json ?? undefined,
      descriptionBinary: decodeBinario(b.description_binary),
      updatedById: user.id,
    },
  });
  set.status = 204;
  return null;
}

/** Uma tag `<mention-component …>` do editor, com seus atributos. */
const TAG_MENCAO = /<mention-component\b[^>]*>/gi;

/** Lê um atributo da tag aceitando aspas simples ou duplas. */
function atributo(tag: string, nome: string): string | undefined {
  return tag.match(new RegExp(`\\b${nome}=["']([^"']*)["']`, "i"))?.[1];
}

/**
 * Ids citados no HTML, na ordem em que aparecem e sem repetição. A menção vive
 * dentro do próprio conteúdo (`entity_identifier`/`entity_name`): não há tabela
 * de menções de página no schema.
 */
function idsMencionados(html: string, tipo: string): string[] {
  const ids: string[] = [];
  for (const tag of html.match(TAG_MENCAO) ?? []) {
    if (atributo(tag, "entity_name") !== tipo) continue;
    const id = atributo(tag, "entity_identifier");
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Usuários mencionados na página, no formato `TUserMention` que o `live` usa
 * para trocar a menção pelo nome ao exportar o PDF. Sem esta rota o export caía
 * no `recoverWithDefault([])` e o PDF saía com o UUID cru no lugar do nome.
 */
async function listPageMentions({ params, query, user }: PageContext) {
  const { filtro } = await resolveScope(params, user.id, "read");
  const page = await loadPageOrFail(filtro, params.page_id);

  const ids = idsMencionados(page.descriptionHtml ?? "", query.mention_type ?? "user_mention");
  if (!ids.length) return [];

  const usuarios = await prisma.user.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, displayName: true, avatarUrl: true, avatar: true },
  });
  const porId = new Map(usuarios.map((u) => [u.id, u]));
  // `flatMap` preserva a ordem do texto e descarta id que não é de usuário
  // (`mention_type` diferente de `user_mention` simplesmente não casa aqui).
  return ids.flatMap((id) => {
    const u = porId.get(id);
    return u ? [{ id: u.id, display_name: u.displayName, avatar_url: u.avatarUrl ?? u.avatar ?? undefined }] : [];
  });
}

/**
 * Move a página para um sistema (`ProjectPageService.move`). Vale também para
 * tirar uma página da wiki e levá-la a um sistema. Regras:
 * - a página passa a valer só no destino: `project_ids[0]` monta toda URL da
 *   UI, e um vínculo remanescente no projeto antigo levaria de volta para lá;
 * - a subárvore vai junto, preservando a hierarquia interna;
 * - o vínculo com um pai que ficou para trás é desfeito, como o Django faz ao
 *   desarquivar uma página cujo pai continua arquivado.
 */
async function movePage({ params, body, user, set }: PageContext) {
  const { ws, filtro, isAdmin } = await resolveScope(params, user.id, "write");
  const page = await loadPageOrFail(filtro, params.page_id);
  if (!canManage(page, user.id, isAdmin)) {
    set.status = 403;
    return { detail: "Apenas o dono da página pode movê-la." };
  }

  const destino = (body as any)?.new_project_id;
  if (!destino) {
    set.status = 400;
    return { detail: "O projeto de destino é obrigatório." };
  }
  await getProjectOrFail(ws.id, destino, user.id, { allowInstanceAdmin: true });

  const movidas = await findSubarvore(page.id);
  const soltarDoPai = page.parentId ? { parentId: null } : {};

  await prisma.$transaction([
    prisma.projectPage.deleteMany({ where: { pageId: { in: movidas } } }),
    prisma.projectPage.createMany({
      data: movidas.map((id) => ({ projectId: destino, pageId: id, workspaceId: ws.id })),
      skipDuplicates: true,
    }),
    prisma.page.update({ where: { id: page.id }, data: { ...soltarDoPai, updatedById: user.id } }),
  ]);

  const noDestino = ESCOPO_DO_SISTEMA.filtro(ws.id, { project_id: destino }, user.id);
  return serializePageForUser(await loadPageOrFail(noDestino, page.id), user.id);
}

async function duplicatePage({ params, user, set }: PageContext) {
  const { ws, filtro } = await resolveScope(params, user.id, "write");
  const original = await loadPageOrFail(filtro, params.page_id);
  // `descriptionBinary` NÃO é copiado de propósito (mesma decisão do Django): o
  // documento Yjs carrega o histórico de edição do original, e o `live` remonta
  // um estado limpo a partir do HTML na primeira abertura da cópia.
  const copy = await prisma.page.create({
    data: {
      workspaceId: ws.id,
      ownedById: user.id,
      createdById: user.id,
      name: `${original.name} (cópia)`,
      descriptionHtml: original.descriptionHtml,
      descriptionStripped: original.descriptionStripped,
      descriptionJson: original.descriptionJson ?? undefined,
      access: original.access,
      color: original.color,
      isGlobal: original.isGlobal,
      parentId: original.parentId,
      sortOrder: original.sortOrder + 1,
    },
  });

  // A cópia herda os vínculos de projeto do original, senão nasce fora de
  // qualquer listagem de projeto e o usuário não a encontra.
  const links = await prisma.projectPage.findMany({
    where: { pageId: original.id },
    select: { projectId: true },
  });
  if (links.length) {
    await prisma.projectPage.createMany({
      data: links.map((l) => ({ projectId: l.projectId, pageId: copy.id, workspaceId: ws.id })),
      skipDuplicates: true,
    });
  }

  set.status = 201;
  return serializePageForUser(await loadPageOrFail(filtro, copy.id), user.id);
}

export const pageModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  // ── Wiki do espaço (páginas sem sistema) ──────────────────────────────────
  // A árvore `/pages/` sem projeto É a wiki: o servidor `live` e o editor falam
  // por ela. As rotas `/wiki/` são as que só a wiki tem (árvore e busca).

  .get("/wiki/pages/", listWikiTree)
  .get("/wiki/search/", searchWiki)
  .get("/pages/", listWorkspacePages)
  .post("/pages/", createPage)
  .get("/archived-pages/", listArchivedPages)
  .get("/favorite-pages/", listFavoritePages)
  .post("/favorite-pages/:page_id/", favoriteHandler(true))
  .delete("/favorite-pages/:page_id/", favoriteHandler(false))
  .get("/pages/:page_id/", getPage)
  .patch("/pages/:page_id/", updatePage)
  .delete("/pages/:page_id/", deletePage)
  .post("/pages/:page_id/access/", updatePageAccess)
  .post("/pages/:page_id/lock/", lockHandler(true))
  .delete("/pages/:page_id/lock/", lockHandler(false))
  .post("/pages/:page_id/archive/", archiveHandler(true))
  .delete("/pages/:page_id/archive/", archiveHandler(false))
  .get("/pages/:page_id/versions/", listPageVersions)
  .get("/pages/:page_id/versions/:version_id/", getPageVersion)
  .get("/pages/:page_id/description/", getPageDescription)
  .patch("/pages/:page_id/description/", updatePageDescription)
  .post("/pages/:page_id/description/", updatePageDescription)
  .get("/pages/:page_id/mentions/", listPageMentions)
  .post("/pages/:page_id/move/", movePage)
  .post("/pages/:page_id/duplicate/", duplicatePage)

  // ── Project-scoped pages ───────────────────────────────────────────────────
  // O frontend (ProjectPageService / ProjectPageVersionService) e o servidor
  // `live` falam sempre por esta árvore. São os MESMOS handlers das rotas da
  // wiki: o `project_id` extra em `params` escolhe a estratégia de escopo em
  // `resolveScope`, e a listagem é a única que precisa de consulta própria.

  .get("/projects/:project_id/pages/", listProjectPages)
  .post("/projects/:project_id/pages/", createPage)
  .get("/projects/:project_id/archived-pages/", listArchivedPages)
  .get("/projects/:project_id/favorite-pages/", listFavoritePages)
  .post("/projects/:project_id/favorite-pages/:page_id/", favoriteHandler(true))
  .delete("/projects/:project_id/favorite-pages/:page_id/", favoriteHandler(false))
  .get("/projects/:project_id/pages/:page_id/", getPage)
  .patch("/projects/:project_id/pages/:page_id/", updatePage)
  .delete("/projects/:project_id/pages/:page_id/", deletePage)
  .post("/projects/:project_id/pages/:page_id/access/", updatePageAccess)
  .post("/projects/:project_id/pages/:page_id/lock/", lockHandler(true))
  .delete("/projects/:project_id/pages/:page_id/lock/", lockHandler(false))
  .post("/projects/:project_id/pages/:page_id/archive/", archiveHandler(true))
  .delete("/projects/:project_id/pages/:page_id/archive/", archiveHandler(false))
  .get("/projects/:project_id/pages/:page_id/versions/", listPageVersions)
  .get("/projects/:project_id/pages/:page_id/versions/:version_id/", getPageVersion)
  .get("/projects/:project_id/pages/:page_id/description/", getPageDescription)
  .patch("/projects/:project_id/pages/:page_id/description/", updatePageDescription)
  .post("/projects/:project_id/pages/:page_id/description/", updatePageDescription)
  .get("/projects/:project_id/pages/:page_id/mentions/", listPageMentions)
  .post("/projects/:project_id/pages/:page_id/move/", movePage)
  .post("/projects/:project_id/pages/:page_id/duplicate/", duplicatePage);
