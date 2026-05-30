import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";

// Entity types enum: 0=workspace, 1=project, 2=issue, 3=page, 4=comment
const ENTITY_TYPE = { WORKSPACE: 0, PROJECT: 1, ISSUE: 2, PAGE: 3, COMMENT: 4 };

export const assetModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  // ── Workspace-level file assets ───────────────────────────────────────────

  .post("/assets/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const b = body as any;
    if (!b.asset) { set.status = 400; return { detail: "asset (file path/key) is required." }; }

    const asset = await prisma.fileAsset.create({
      data: {
        workspaceId: ws.id,
        entityType: b.entity_type ?? ENTITY_TYPE.WORKSPACE,
        entityId: b.entity_id ?? null,
        asset: b.asset,
        size: b.size ?? 0,
        mimeType: b.mime_type ?? null,
        attributes: b.attributes ?? {},
        isUploaded: b.is_uploaded ?? false,
      },
    });
    set.status = 201;
    return asset;
  })

  .get("/assets/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    const where: any = { workspaceId: ws.id, isDeleted: false };
    if (query.entity_type !== undefined) where.entityType = Number(query.entity_type);
    if (query.entity_id) where.entityId = query.entity_id;
    return paginate({
      query: (skip, take) => prisma.fileAsset.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.fileAsset.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .get("/assets/:asset_id/", async ({ params: { slug, asset_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    return prisma.fileAsset.findFirstOrThrow({ where: { id: asset_id, workspaceId: ws.id, isDeleted: false } });
  })

  .patch("/assets/:asset_id/", async ({ params: { slug, asset_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    const b = body as any;
    const data: any = {};
    if (b.is_uploaded !== undefined) data.isUploaded = b.is_uploaded;
    if (b.attributes !== undefined) data.attributes = b.attributes;
    return prisma.fileAsset.update({ where: { id: asset_id }, data });
  })

  .delete("/assets/:asset_id/", async ({ params: { slug, asset_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await prisma.fileAsset.update({ where: { id: asset_id }, data: { isDeleted: true, deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Issue attachments (IssueAttachment model) ────────────────────────────

  .get(
    "/projects/:project_id/issues/:issue_id/attachments/",
    async ({ params: { slug, project_id, issue_id }, user, query }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      const where = { issueId: issue_id, deletedAt: null };
      return paginate({
        query: (skip, take) => prisma.issueAttachment.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
        count: () => prisma.issueAttachment.count({ where }),
        cursor: query.cursor as string | undefined,
      });
    }
  )

  .post(
    "/projects/:project_id/issues/:issue_id/attachments/",
    async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      const b = body as any;
      if (!b.asset) { set.status = 400; return { detail: "asset is required." }; }

      const attachment = await prisma.issueAttachment.create({
        data: {
          issueId: issue_id,
          workspaceId: ws.id,
          projectId: project_id,
          asset: b.asset,
          attributes: b.attributes ?? {},
          externalSource: b.external_source ?? null,
          externalId: b.external_id ?? null,
        },
      });
      set.status = 201;
      return attachment;
    }
  )

  .delete(
    "/projects/:project_id/issues/:issue_id/attachments/:attachment_id/",
    async ({ params: { slug, project_id, issue_id, attachment_id }, user, set }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      await prisma.issueAttachment.update({ where: { id: attachment_id }, data: { deletedAt: new Date() } });
      set.status = 204;
      return null;
    }
  );
