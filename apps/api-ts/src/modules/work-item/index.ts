/**
 * work-items = alias for issues
 * The frontend uses EIssueServiceType.WORK_ITEMS = "work-items" as the service type
 * for description-versions and other endpoints. This module re-exports the issue handlers
 * under the /work-items/ prefix.
 */
import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";
import { serializeIssue, ISSUE_INCLUDE } from "@utils/serialize";
import { paginate } from "@utils/pagination";

function isoDate(d: any) { if (!d) return null; return d instanceof Date ? d.toISOString() : String(d); }

export const workItemModule = new Elysia({ prefix: "/workspaces/:slug/projects/:project_id/work-items" })
  .use(authPlugin)

  // ── Alias: proxy GET to issues ─────────────────────────────────────────────
  .get("/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where: any = { projectId: project_id, deletedAt: null, isDraft: false };
    const orderBy: any = { updatedAt: "desc" };
    return paginate({
      query: (skip, take) => prisma.issue.findMany({ where, skip, take, include: ISSUE_INCLUDE, orderBy }),
      count: () => prisma.issue.count({ where }),
      cursor: (query as any).cursor as string | undefined,
      transform: (items) => items.map(serializeIssue),
    });
  })

  // ── Description versions ──────────────────────────────────────────────────
  .get("/:issue_id/description-versions/", async ({ params: { slug, project_id, issue_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const versions = await prisma.issueVersion.findMany({
      where: { issueId: issue_id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return versions.map((v: any) => ({
      id: v.id, issue: issue_id, workspace: ws.id, project: project_id,
      description: v.descriptionJson ?? null,
      description_html: v.descriptionHtml ?? "<p></p>",
      description_stripped: v.descriptionStripped ?? "",
      created_at: isoDate(v.createdAt),
      updated_at: isoDate(v.updatedAt),
      owned_by: v.ownedById ?? null,
      last_saved_at: isoDate(v.createdAt),
    }));
  })

  .get("/:issue_id/description-versions/:version_id/", async ({ params: { slug, project_id, issue_id, version_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const v = await prisma.issueVersion.findFirst({ where: { id: version_id, issueId: issue_id } });
    if (!v) { set.status = 404; return { detail: "Not found." }; }
    return {
      id: v.id, issue: issue_id, workspace: ws.id, project: project_id,
      description: (v as any).descriptionJson ?? null,
      description_html: (v as any).descriptionHtml ?? "<p></p>",
      description_stripped: (v as any).descriptionStripped ?? "",
      created_at: isoDate(v.createdAt),
      owned_by: (v as any).ownedById ?? null,
    };
  });
