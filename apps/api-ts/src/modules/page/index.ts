import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getProjectOrFail, getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";


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

/**
 * Autoriza a requisição no escopo em que ela chegou. Quando a URL traz
 * `project_id` o acesso ao projeto também precisa valer — senão qualquer membro
 * do workspace editaria páginas de projetos dos quais não participa.
 * Devolve `isAdmin` porque a UI libera travar/arquivar/apagar para o dono OU
 * para administradores; sem isso o admin veria o botão e levaria 403.
 */
async function resolveScope(params: Record<string, string>, userId: string) {
  const ws = await getWorkspaceOrFail(params.slug);
  const membership = await requireWorkspaceMember(ws.id, userId);
  if (params.project_id) await getProjectOrFail(ws.id, params.project_id, userId, { allowInstanceAdmin: true });
  return { ws, isAdmin: membership.role >= 20 };
}

/** Carrega a página com as relações da serialização, presa ao workspace da URL. */
function loadPageOrFail(workspaceId: string, pageId: string) {
  return prisma.page.findFirstOrThrow({
    where: { id: pageId, workspaceId, deletedAt: null },
    include: PAGE_RELATIONS,
  });
}

/**
 * Filtro base das páginas vivas do workspace. Quando a URL traz `project_id` a
 * consulta só enxerga páginas vinculadas àquele projeto.
 */
function escopoDePaginas(workspaceId: string, projectId?: string) {
  return {
    workspaceId,
    deletedAt: null,
    ...(projectId ? { projects: { some: { projectId } } } : {}),
  };
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
async function serializarPagina(page: any, userId: string) {
  return serializePage(page, await favoritasDoUsuario(userId, [page.id]));
}

/** Serializa uma lista com uma única consulta de favoritos para todas. */
async function serializarPaginas(pages: any[], userId: string) {
  const favoritas = await favoritasDoUsuario(userId, pages.map((p) => p.id));
  return pages.map((p) => serializePage(p, favoritas));
}

/** Aplica um patch e já devolve a página no formato do frontend. */
async function savePage(pageId: string, data: any, userId: string) {
  const page = await prisma.page.update({ where: { id: pageId }, data, include: PAGE_RELATIONS });
  return serializarPagina(page, userId);
}

/**
 * Guarda o conteúdo anterior antes de sobrescrever. O histórico é acessório:
 * uma falha aqui não pode derrubar a edição do usuário.
 */
function snapshotVersion(page: any, userId: string) {
  if (!page.descriptionHtml) return Promise.resolve();
  return prisma.pageVersion
    .create({
      data: {
        pageId: page.id,
        workspaceId: page.workspaceId,
        ownedById: userId,
        lastSavedAt: new Date(),
        descriptionJson: page.descriptionJson ?? undefined,
        descriptionHtml: page.descriptionHtml,
        descriptionStripped: page.descriptionStripped,
      },
    })
    .then(() => undefined)
    .catch(() => undefined);
}

const HTML_TAGS = /<[^>]+>/g;

/** Só o dono ou um administrador do workspace mexe no ciclo de vida da página. */
function canManage(page: { ownedById: string }, userId: string, isAdmin: boolean) {
  return page.ownedById === userId || isAdmin;
}

// ── Handlers ────────────────────────────────────────────────────────────────
// Cada handler é registrado nas DUAS árvores de rota (workspace e projeto).

async function listWorkspacePages({ params, query, user }: PageContext) {
  const { ws } = await resolveScope(params, user.id);
  const where: any = { ...escopoDePaginas(ws.id), archivedAt: query.archived === "true" ? { not: null } : null };
  return paginate({
    query: (skip, take) =>
      prisma.page.findMany({ where, skip, take, include: PAGE_RELATIONS, orderBy: { updatedAt: "desc" } }),
    count: () => prisma.page.count({ where }),
    cursor: query.cursor,
    transform: (items) => serializarPaginas(items, user.id),
  });
}

/**
 * `ProjectPageService.fetchAll` itera o retorno com `for..of` e tipa como
 * `TPage[]`: aqui a resposta é uma lista simples de páginas serializadas, não o
 * envelope paginado (que a UI não consegue percorrer).
 */
async function listProjectPages({ params, query, user }: PageContext) {
  const { ws } = await resolveScope(params, user.id);
  const pages = await prisma.page.findMany({
    where: {
      ...escopoDePaginas(ws.id, params.project_id),
      archivedAt: query.archived === "true" ? { not: null } : null,
    },
    include: PAGE_RELATIONS,
    orderBy: { updatedAt: "desc" },
  });
  return serializarPaginas(pages, user.id);
}

/**
 * `ProjectPageService.fetchArchived` alimenta a aba "Arquivadas" do wiki e tipa
 * o retorno como `TPage[]` — a chamada não passa `?archived=true`, o filtro é a
 * própria rota. Envelope paginado aqui deixaria a aba vazia.
 */
async function listArchivedPages({ params, user }: PageContext) {
  const { ws } = await resolveScope(params, user.id);
  const pages = await prisma.page.findMany({
    where: { ...escopoDePaginas(ws.id, params.project_id), archivedAt: { not: null } },
    include: PAGE_RELATIONS,
    orderBy: { archivedAt: "desc" },
  });
  return serializarPaginas(pages, user.id);
}

/**
 * `ProjectPageService.fetchFavorites`, também tipado como `TPage[]`. Só páginas
 * ativas: arquivar remove o favorito, como no Django.
 */
async function listFavoritePages({ params, user }: PageContext) {
  const { ws } = await resolveScope(params, user.id);
  const favoritos = await prisma.userFavorite.findMany({
    where: { workspaceId: ws.id, userId: user.id, entityType: TIPO_FAVORITO_PAGINA, deletedAt: null },
    select: { entityId: true },
    orderBy: { sequence: "asc" },
  });
  const ids = favoritos.map((f) => f.entityId);
  if (!ids.length) return [];

  const pages = await prisma.page.findMany({
    where: { ...escopoDePaginas(ws.id, params.project_id), id: { in: ids }, archivedAt: null },
    include: PAGE_RELATIONS,
    orderBy: { updatedAt: "desc" },
  });
  const favoritas = new Set(ids);
  return pages.map((p) => serializePage(p, favoritas));
}

/**
 * Marca/desmarca a página como favorita. Fábrica porque as duas pontas só
 * diferem pelo estado final — o frontend chama POST e DELETE na mesma URL e
 * ignora o corpo da resposta.
 */
const favoriteHandler = (favoritar: boolean) => async ({ params, user, set }: PageContext) => {
  const { ws } = await resolveScope(params, user.id);
  const page = await loadPageOrFail(ws.id, params.page_id);
  await (favoritar ? marcarFavorita(ws.id, page, user.id) : desmarcarFavorita(ws.id, page.id, user.id));
  set.status = 204;
  return null;
};

/**
 * Idempotente e sem lixo: favoritar duas vezes não duplica a linha, e ligar a
 * estrela de novo reaproveita o registro que o DELETE apenas marcou como
 * excluído (senão cada clique deixaria uma linha morta em `user_favorites`).
 */
async function marcarFavorita(workspaceId: string, page: { id: string; name: string }, userId: string) {
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
function desmarcarFavorita(workspaceId: string, pageId: string, userId: string) {
  return prisma.userFavorite.updateMany({
    where: { ...chaveFavorita(workspaceId, pageId, userId), deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

async function createPage({ params, body, user, set }: PageContext) {
  const { ws } = await resolveScope(params, user.id);
  const b = (body ?? {}) as any;
  // A página nasce SEM nome e ganha um ao ser digitado no título do editor — é
  // assim que o botão "Nova página" funciona: ele manda só o `access`. Exigir
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
      parentId: b.parent ?? null,
      createdById: user.id,
    },
  });

  // Na árvore de projeto o vínculo vem da URL: o frontend cria a página sem
  // mandar `project_ids` no corpo, e sem o vínculo ela some da listagem.
  const projectIds: string[] = b.project_ids?.length ? b.project_ids : params.project_id ? [params.project_id] : [];
  if (projectIds.length) {
    await prisma.projectPage.createMany({
      data: projectIds.map((pid) => ({ projectId: pid, pageId: page.id, workspaceId: ws.id })),
      skipDuplicates: true,
    });
  }

  set.status = 201;
  return serializarPagina(await loadPageOrFail(ws.id, page.id), user.id);
}

async function getPage({ params, user }: PageContext) {
  const { ws } = await resolveScope(params, user.id);
  return serializarPagina(await loadPageOrFail(ws.id, params.page_id), user.id);
}

async function updatePage({ params, body, user, set }: PageContext) {
  const { ws, isAdmin } = await resolveScope(params, user.id);
  const page = await loadPageOrFail(ws.id, params.page_id);
  if (page.isLocked && !canManage(page, user.id, isAdmin)) {
    set.status = 403;
    return { detail: "A página está bloqueada." };
  }

  const b = (body ?? {}) as any;
  const data: any = { updatedById: user.id };
  if (b.name !== undefined) data.name = b.name;
  if (b.description_html !== undefined) {
    data.descriptionHtml = b.description_html;
    data.descriptionStripped = String(b.description_html).replace(HTML_TAGS, "");
  }
  if (b.description !== undefined) data.descriptionJson = b.description;
  if (b.access !== undefined) data.access = b.access;
  if (b.color !== undefined) data.color = b.color;
  if (b.sort_order !== undefined) data.sortOrder = b.sort_order;
  if (b.parent_id !== undefined) data.parentId = b.parent_id;

  await snapshotVersion(page, user.id);
  return savePage(page.id, data, user.id);
}

async function deletePage({ params, user, set }: PageContext) {
  const { ws, isAdmin } = await resolveScope(params, user.id);
  const page = await loadPageOrFail(ws.id, params.page_id);
  if (!canManage(page, user.id, isAdmin)) {
    set.status = 403;
    return { detail: "Apenas o dono da página pode excluí-la." };
  }
  await prisma.page.update({ where: { id: page.id }, data: { deletedAt: new Date() } });
  set.status = 204;
  return null;
}

/** Fábrica dos handlers de trava: muda só o valor gravado e a mensagem de erro. */
const lockHandler = (locked: boolean) => async ({ params, user, set }: PageContext) => {
  const { ws, isAdmin } = await resolveScope(params, user.id);
  const page = await loadPageOrFail(ws.id, params.page_id);
  if (!canManage(page, user.id, isAdmin)) {
    set.status = 403;
    return { detail: locked ? "Apenas o dono da página pode bloqueá-la." : "Apenas o dono da página pode desbloqueá-la." };
  }
  return savePage(page.id, { isLocked: locked }, user.id);
};

/** Mesma ideia da trava: arquivar e desarquivar diferem só pelo `archivedAt`. */
const archiveHandler = (archived: boolean) => async ({ params, user, set }: PageContext) => {
  const { ws, isAdmin } = await resolveScope(params, user.id);
  const page = await loadPageOrFail(ws.id, params.page_id);
  if (!canManage(page, user.id, isAdmin)) {
    set.status = 403;
    return { detail: archived ? "Apenas o dono da página pode arquivá-la." : "Apenas o dono da página pode restaurá-la." };
  }
  // Página arquivada sai dos favoritos (mesma regra do Django): senão ela
  // continuaria listada na barra lateral apontando para um item invisível.
  if (archived) await desmarcarFavorita(ws.id, page.id, user.id);
  return savePage(page.id, { archivedAt: archived ? new Date() : null }, user.id);
};

async function updatePageAccess({ params, body, user, set }: PageContext) {
  const { ws, isAdmin } = await resolveScope(params, user.id);
  const page = await loadPageOrFail(ws.id, params.page_id);
  if (!canManage(page, user.id, isAdmin)) {
    set.status = 403;
    return { detail: "Apenas o dono da página pode alterar o acesso." };
  }
  const access = Number((body as any)?.access ?? page.access);
  return savePage(page.id, { access, updatedById: user.id }, user.id);
}

async function listPageVersions({ params, user }: PageContext) {
  const { ws } = await resolveScope(params, user.id);
  await loadPageOrFail(ws.id, params.page_id);
  const versions = await prisma.pageVersion.findMany({
    where: { pageId: params.page_id, workspaceId: ws.id },
    orderBy: { createdAt: "desc" },
  });
  // `fetchAllVersions` tipa o retorno como `TPageVersion[]`; o envelope paginado
  // quebraria o `.map` da linha do tempo do histórico.
  return versions.map(serializePageVersion);
}

async function getPageVersion({ params, user }: PageContext) {
  const { ws } = await resolveScope(params, user.id);
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
  const { ws } = await resolveScope(params, user.id);
  const page = await loadPageOrFail(ws.id, params.page_id);
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
function decodificarBinario(valor: unknown): Uint8Array<ArrayBuffer> | undefined {
  if (typeof valor !== "string") return undefined;
  return Uint8Array.from(Buffer.from(valor, "base64"));
}

async function updatePageDescription({ params, body, user, set }: PageContext) {
  const { ws, isAdmin } = await resolveScope(params, user.id);
  const page = await loadPageOrFail(ws.id, params.page_id);
  if (page.isLocked && !canManage(page, user.id, isAdmin)) {
    set.status = 403;
    return { detail: "A página está bloqueada." };
  }

  const b = (body ?? {}) as any;
  const html: string = b.description_html ?? page.descriptionHtml;
  await prisma.page.update({
    where: { id: page.id },
    data: {
      descriptionHtml: html,
      descriptionStripped: String(html).replace(HTML_TAGS, ""),
      descriptionJson: b.description_json ?? undefined,
      descriptionBinary: decodificarBinario(b.description_binary),
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
  const { ws } = await resolveScope(params, user.id);
  const page = await loadPageOrFail(ws.id, params.page_id);

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
 * Ids da página e de toda a sua descendência. A subárvore precisa acompanhar o
 * move: uma sub-página deixada para trás apontaria para um pai de outro projeto
 * e sumiria das duas listagens.
 */
async function subarvoreDePaginas(pageId: string): Promise<string[]> {
  const linhas = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE descendentes AS (
      SELECT id FROM pages WHERE id = ${pageId}::uuid
      UNION ALL
      SELECT p.id FROM pages p JOIN descendentes d ON p.parent_id = d.id WHERE p.deleted_at IS NULL
    )
    SELECT id FROM descendentes
  `;
  return linhas.map((l) => l.id);
}

/**
 * Move a página para outro projeto (`ProjectPageService.move`). Regras:
 * - a página passa a valer só no destino — `project_ids[0]` monta toda URL da
 *   UI, e um vínculo remanescente no projeto antigo levaria de volta para lá;
 * - a subárvore vai junto, preservando a hierarquia interna;
 * - o vínculo com um pai que ficou para trás é desfeito, como o Django faz ao
 *   desarquivar uma página cujo pai continua arquivado.
 */
async function movePage({ params, body, user, set }: PageContext) {
  const { ws, isAdmin } = await resolveScope(params, user.id);
  const page = await loadPageOrFail(ws.id, params.page_id);
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

  const movidas = await subarvoreDePaginas(page.id);
  const soltarDoPai = page.parentId ? { parentId: null } : {};

  await prisma.$transaction([
    prisma.projectPage.deleteMany({ where: { pageId: { in: movidas } } }),
    prisma.projectPage.createMany({
      data: movidas.map((id) => ({ projectId: destino, pageId: id, workspaceId: ws.id })),
      skipDuplicates: true,
    }),
    prisma.page.update({ where: { id: page.id }, data: { ...soltarDoPai, updatedById: user.id } }),
  ]);

  return serializarPagina(await loadPageOrFail(ws.id, page.id), user.id);
}

async function duplicatePage({ params, user, set }: PageContext) {
  const { ws } = await resolveScope(params, user.id);
  const original = await loadPageOrFail(ws.id, params.page_id);
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
  return serializarPagina(await loadPageOrFail(ws.id, copy.id), user.id);
}

export const pageModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  // ── Global pages (wiki) ───────────────────────────────────────────────────

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
  // `live` falam sempre por esta árvore. São os MESMOS handlers das rotas de
  // workspace: o `project_id` extra em `params` já é validado em `resolveScope`
  // e a listagem é a única que precisa de consulta própria.

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
