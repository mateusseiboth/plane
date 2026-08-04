import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";


/**
 * Página no formato que o frontend consome (`TPage`, snake_case). O objeto cru do
 * Prisma chega com `isLocked`/`descriptionHtml`/`ownedById`, que a UI lê como
 * `undefined` — bloqueio, conteúdo e dono somem da tela.
 */
function serializePage(p: any) {
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
    is_favorite: false,
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

export const pageModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  // ── Global pages (wiki) ───────────────────────────────────────────────────

  .get("/pages/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where: any = { workspaceId: ws.id, deletedAt: null };
    if (query.archived === "true") where.archivedAt = { not: null };
    else where.archivedAt = null;
    return paginate({
      query: (skip, take) =>
        prisma.page.findMany({ where, skip, take, include: { labels: { include: { label: true } }, children: { where: { deletedAt: null }, select: { id: true, name: true } } }, orderBy: { updatedAt: "desc" } }),
      count: () => prisma.page.count({ where }),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map(serializePage),
    });
  })

  .post("/pages/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "O nome é obrigatório." }; }
    const page = await prisma.page.create({
      data: {
        workspaceId: ws.id,
        ownedById: user.id,
        name: b.name,
        descriptionHtml: b.description_html ?? "<p></p>",
        descriptionStripped: (b.description_html ?? "").replace(/<[^>]+>/g, ""),
        descriptionJson: b.description ?? null,
        access: b.access ?? 0,
        color: b.color ?? "",
        isGlobal: b.is_global ?? false,
        parentId: b.parent ?? null,
        createdById: user.id,
      },
    });

    // Link to project if project_id provided
    if (b.project_ids?.length) {
      await prisma.projectPage.createMany({
        data: b.project_ids.map((pid: string) => ({ projectId: pid, pageId: page.id, workspaceId: ws.id })),
        skipDuplicates: true,
      });
    }

    set.status = 201;
    return page;
  })

  .get("/pages/:page_id/", async ({ params: { slug, page_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return serializePage(await prisma.page.findFirstOrThrow({
      where: { id: page_id, workspaceId: ws.id, deletedAt: null },
      include: { labels: { include: { label: true } }, children: { where: { deletedAt: null } }, versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    }));
  })

  .patch("/pages/:page_id/", async ({ params: { slug, page_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const page = await prisma.page.findFirstOrThrow({ where: { id: page_id, workspaceId: ws.id } });
    if (page.isLocked && page.ownedById !== user.id) { set.status = 403; return { detail: "A página está bloqueada." }; }

    const b = body as any;
    const data: any = { updatedById: user.id };
    if (b.name !== undefined) data.name = b.name;
    if (b.description_html !== undefined) {
      data.descriptionHtml = b.description_html;
      data.descriptionStripped = b.description_html.replace(/<[^>]+>/g, "");
    }
    if (b.description !== undefined) data.descriptionJson = b.description;
    if (b.access !== undefined) data.access = b.access;
    if (b.color !== undefined) data.color = b.color;
    if (b.sort_order !== undefined) data.sortOrder = b.sort_order;

    // Save version snapshot before update
    const old = await prisma.page.findUnique({ where: { id: page_id } });
    if (old?.descriptionHtml) {
      await prisma.pageVersion.create({
        data: {
          pageId: page_id,
          workspaceId: ws.id,
          ownedById: user.id,
          lastSavedAt: new Date(),
          descriptionJson: old.descriptionJson ?? undefined,
          descriptionHtml: old.descriptionHtml,
          descriptionStripped: old.descriptionStripped,
        },
      }).catch(() => {});
    }

    return serializePage(await prisma.page.update({ where: { id: page_id }, data }));
  })

  .delete("/pages/:page_id/", async ({ params: { slug, page_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.page.update({ where: { id: page_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Lock / Unlock ──────────────────────────────────────────────────────────

  .post("/pages/:page_id/lock/", async ({ params: { slug, page_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const page = await prisma.page.findFirstOrThrow({ where: { id: page_id, workspaceId: ws.id } });
    if (page.ownedById !== user.id) { set.status = 403; return { detail: "Apenas o dono da página pode bloqueá-la." }; }
    return serializePage(await prisma.page.update({ where: { id: page_id }, data: { isLocked: true } }));
  })

  .delete("/pages/:page_id/lock/", async ({ params: { slug, page_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const page = await prisma.page.findFirstOrThrow({ where: { id: page_id, workspaceId: ws.id } });
    if (page.ownedById !== user.id) { set.status = 403; return { detail: "Apenas o dono da página pode desbloqueá-la." }; }
    return serializePage(await prisma.page.update({ where: { id: page_id }, data: { isLocked: false } }));
  })

  // ── Archive / Unarchive ────────────────────────────────────────────────────

  .post("/pages/:page_id/archive/", async ({ params: { slug, page_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return serializePage(await prisma.page.update({ where: { id: page_id }, data: { archivedAt: new Date() } }));
  })

  .delete("/pages/:page_id/archive/", async ({ params: { slug, page_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return serializePage(await prisma.page.update({ where: { id: page_id }, data: { archivedAt: null } }));
  })

  // ── Versions ───────────────────────────────────────────────────────────────

  .get("/pages/:page_id/versions/", async ({ params: { slug, page_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = { pageId: page_id, workspaceId: ws.id };
    return paginate({
      query: (skip, take) => prisma.pageVersion.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.pageVersion.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .get("/pages/:page_id/versions/:version_id/", async ({ params: { slug, page_id, version_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return prisma.pageVersion.findFirstOrThrow({ where: { id: version_id, pageId: page_id } });
  })

  // ── Project-scoped pages ───────────────────────────────────────────────────

  .get("/projects/:project_id/pages/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where: any = {
      page: { workspaceId: ws.id, deletedAt: null, archivedAt: null },
      projectId: project_id,
    };
    return paginate({
      query: (skip, take) =>
        prisma.projectPage.findMany({ where, skip, take, include: { page: { include: { labels: { include: { label: true } } } } }, orderBy: { page: { updatedAt: "desc" } } }),
      count: () => prisma.projectPage.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  });
