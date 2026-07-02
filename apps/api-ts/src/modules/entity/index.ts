import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceMember, requireWorkspaceWriter } from "@utils/workspace";

export const entityModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  // Entity CRUD ───────────────────────────────────────────────────────────────

  .get("/entities/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where: any = { workspaceId: ws.id, deletedAt: null };
    if (query.is_active !== undefined) where.isActive = query.is_active === "true";
    return paginate({
      query: (skip, take) => prisma.entity.findMany({ where, skip, take, orderBy: { name: "asc" } }),
      count: () => prisma.entity.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/entities/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "Name is required." }; }
    try {
      const entity = await prisma.entity.create({
        data: {
          workspaceId: ws.id,
          name: b.name,
          entityType: b.entity_type ?? null,
          cnpj: b.cnpj ?? null,
          city: b.city ?? null,
          state: b.state ?? null,
          email: b.email ?? null,
          phone: b.phone ?? null,
          isActive: b.is_active ?? true,
          legacyId: b.legacy_id ?? null,
          externalSource: b.external_source ?? null,
          externalId: b.external_id ?? null,
          createdById: user.id,
        },
      });
      set.status = 201;
      return entity;
    } catch (e: any) {
      if (e?.code === "P2002") {
        const existing = await prisma.entity.findFirst({
          where: { workspaceId: ws.id, name: b.name, deletedAt: null },
        });
        set.status = 409;
        return { detail: "Entity with this name already exists.", id: existing?.id };
      }
      throw e;
    }
  })

  .get("/entities/:entity_id/", async ({ params: { slug, entity_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return prisma.entity.findFirstOrThrow({ where: { id: entity_id, workspaceId: ws.id, deletedAt: null } });
  })

  .patch("/entities/:entity_id/", async ({ params: { slug, entity_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.entity_type !== undefined) data.entityType = b.entity_type;
    if (b.cnpj !== undefined) data.cnpj = b.cnpj;
    if (b.city !== undefined) data.city = b.city;
    if (b.state !== undefined) data.state = b.state;
    if (b.email !== undefined) data.email = b.email;
    if (b.phone !== undefined) data.phone = b.phone;
    if (b.is_active !== undefined) data.isActive = b.is_active;
    return prisma.entity.update({ where: { id: entity_id }, data });
  })

  .delete("/entities/:entity_id/", async ({ params: { slug, entity_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    await prisma.entity.update({ where: { id: entity_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  });
