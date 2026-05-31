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

// ── assets/v2 — new attachment API (frontend calls /api/assets/v2/workspaces/...) ──────
// This module handles the v2 asset paths that the frontend uses for file uploads.
export const assetV2Module = new Elysia({ prefix: "/assets/v2/workspaces/:slug" })
  .use(authPlugin)

  .get(
    "/projects/:project_id/issues/:issue_id/attachments/",
    async ({ params: { slug, project_id, issue_id }, user, query }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      const where = { issueId: issue_id, deletedAt: null };
      return paginate({
        query: (skip, take) => prisma.issueAttachment.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
        count: () => prisma.issueAttachment.count({ where }),
        cursor: (query as any).cursor as string | undefined,
        transform: (items) => items.map((a: any) => ({
          id: a.id, issue: issue_id, workspace: ws.id, project: project_id,
          asset: a.asset, attributes: a.attributes ?? {},
          created_at: a.createdAt?.toISOString(), updated_at: a.updatedAt?.toISOString(),
        })),
      });
    }
  )

  .post(
    "/projects/:project_id/issues/:issue_id/attachments/",
    async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      const b = body as any;
      const attachment = await prisma.issueAttachment.create({
        data: {
          issueId: issue_id, workspaceId: ws.id, projectId: project_id,
          asset: b.asset ?? b.upload_data?.asset ?? "",
          attributes: b.attributes ?? b.upload_data?.attributes ?? {},
        },
      });
      set.status = 201;
      return {
        id: attachment.id, issue: issue_id, workspace: ws.id, project: project_id,
        asset: attachment.asset, attributes: attachment.attributes ?? {},
        created_at: attachment.createdAt?.toISOString(),
      };
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
  )

  // ── Project-level assets (description images, page images, etc.) ─────────────
  // POST /projects/:project_id/ — request signed URL for a project-level asset
  .post(
    "/projects/:project_id/",
    async ({ params: { slug, project_id }, body, user, set }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      const b = body as any;
      const entityType = b.entity_type ?? "PROJECT_COVER"; // PAGE_DESCRIPTION, PROJECT_COVER, etc.
      const assetKey = `projects/${project_id}/${entityType.toLowerCase()}/${Date.now()}-${b.name ?? "file"}`;
      const asset = await prisma.asset.create({
        data: {
          workspaceId: ws.id, projectId: project_id,
          asset: assetKey,
          attributes: {name: b.name, type: b.type, size: b.size, entity_type: entityType},
          isUploaded: false, entityType,
        },
      }).catch(() => null);
      const assetId = asset?.id ?? `temp-${Date.now()}`;
      set.status = 200;
      return {
        asset_id: assetId,
        asset: assetKey,
        asset_url: `/api/assets/v2/workspaces/${slug}/projects/${project_id}/${assetId}/`,
        upload_data: {
          url: `/api/assets/v2/workspaces/${slug}/projects/${project_id}/${assetId}/upload/`,
          fields: {},
        },
      };
    }
  )

  // PATCH /projects/:project_id/:asset_id/ — mark asset as uploaded
  .patch(
    "/projects/:project_id/:asset_id/",
    async ({ params: { slug, project_id, asset_id }, user }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      await prisma.asset.updateMany({
        where: {id: asset_id, workspaceId: ws.id},
        data: {isUploaded: true},
      }).catch(() => {});
      return {status: "uploaded"};
    }
  )

  // POST /projects/:project_id/:asset_id/upload/ — direct file upload endpoint
  .post(
    "/projects/:project_id/:asset_id/upload/",
    async ({ params: { slug, project_id, asset_id }, body, user }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      // For local storage: just mark as uploaded and return asset URL
      await prisma.asset.updateMany({
        where: {id: asset_id, workspaceId: ws.id},
        data: {isUploaded: true},
      }).catch(() => {});
      return {status: "uploaded", asset_id};
    }
  )

  // GET /projects/:project_id/:asset_id/ — serve or redirect to asset
  .get(
    "/projects/:project_id/:asset_id/",
    async ({ params: { slug, project_id, asset_id }, user, set }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      const asset = await prisma.asset.findFirst({where: {id: asset_id, workspaceId: ws.id}});
      if (!asset) { set.status = 404; return {detail: "Asset not found."}; }
      return {id: asset.id, asset: asset.asset, asset_url: `/media/${asset.asset}`};
    }
  )

  // ── Bulk update project assets upload status ───────────────────────────────
  .post(
    "/projects/:project_id/:entity_id/bulk/",
    async ({ params: { slug, project_id, entity_id }, body, user }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      const b = body as any;
      const assetIds: string[] = b.asset_ids ?? [];
      if (assetIds.length) {
        await prisma.asset.updateMany({
          where: {id: {in: assetIds}, workspaceId: ws.id},
          data: {isUploaded: true},
        }).catch(() => {});
      }
      return {updated: assetIds.length};
    }
  )

  // Generate pre-signed upload URL (for direct S3 upload)
  .post(
    "/projects/:project_id/issues/:issue_id/attachments/generate-upload-url/",
    async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      const b = body as any;
      const assetKey = `issues/${issue_id}/${Date.now()}-${b.name ?? "file"}`;
      // For local storage, return a direct upload URL
      set.status = 200;
      return {
        upload_data: {
          url: `/api/assets/v2/workspaces/${slug}/projects/${project_id}/issues/${issue_id}/attachments/`,
          fields: {},
        },
        asset_id: null,
        asset: assetKey,
        asset_url: `/media/${assetKey}`,
      };
    }
  );
