/**
 * intake-work-items = alias for inbox-issues
 * The frontend uses `/intake-work-items/` as the path in version history calls.
 * This module provides the same endpoints under the new alias.
 */
import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";
import { serializeIssue, ISSUE_INCLUDE, COMMENT_INCLUDE, serializeComment } from "@utils/serialize";
import { paginate } from "@utils/pagination";
import { diffChange, recordActivities, type ActivityChange } from "@utils/activity";

function isoDate(d: any) { if (!d) return null; return d instanceof Date ? d.toISOString() : String(d); }

export const intakeWorkItemModule = new Elysia({ prefix: "/workspaces/:slug/projects/:project_id/intake-work-items" })
  .use(authPlugin)

  // ── List intake (triage) work items ─────────────────────────────────────────
  .get("/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const triageState = await prisma.state.findFirst({
      where: { projectId: project_id, isTriage: true, deletedAt: null },
    });
    const where: any = { projectId: project_id, deletedAt: null, isDraft: false };
    if (triageState) where.stateId = triageState.id;
    const perPage = Number((query as any).per_page ?? 20);
    const cursor = (query as any).cursor ?? `${perPage}:0:0`;
    const page = Number(cursor.split(":")[1] ?? 0);
    const skip = page * perPage;
    const [issues, total] = await Promise.all([
      prisma.issue.findMany({ where, skip, take: perPage + 1, include: ISSUE_INCLUDE, orderBy: { createdAt: "desc" } }),
      prisma.issue.count({ where }),
    ]);
    const hasNext = issues.length > perPage;
    return {
      total_count: total, total_results: total, results: issues.slice(0, perPage).map(serializeIssue),
      next_cursor: `${perPage}:${page + 1}:0`, prev_cursor: `${perPage}:${Math.max(0, page - 1)}:1`,
      next_page_results: hasNext, prev_page_results: page > 0,
    };
  })

  // ── Get single intake work item ──────────────────────────────────────────────
  .get("/:issue_id/", async ({ params: { slug, project_id, issue_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const issue = await prisma.issue.findFirst({ where: { id: issue_id, projectId: project_id, deletedAt: null }, include: ISSUE_INCLUDE });
    if (!issue) { set.status = 404; return { detail: "Not found." }; }
    return serializeIssue(issue);
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
      description_stripped: "",
      created_at: isoDate(v.createdAt),
      updated_at: isoDate(v.createdAt),
      owned_by: v.ownedById ?? null,
      last_saved_at: v.lastSavedAt ? isoDate(v.lastSavedAt) : isoDate(v.createdAt),
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
      created_at: isoDate(v.createdAt),
      owned_by: (v as any).ownedById ?? null,
    };
  })

  // ── History ──────────────────────────────────────────────────────────────────
  .get("/:issue_id/history/", async ({ params: { slug, project_id, issue_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const activityType = (query as any).activity_type ?? "issue-property";
    const isComment = activityType.includes("comment");
    // issue-comment feed returns full comment objects (same as the issue module)
    if (isComment) {
      const commentWhere: any = { issueId: issue_id, deletedAt: null };
      if ((query as any).created_at__gt) commentWhere.createdAt = { gt: new Date((query as any).created_at__gt) };
      const comments = await prisma.issueComment.findMany({
        where: commentWhere,
        orderBy: { createdAt: "asc" },
        include: COMMENT_INCLUDE,
        take: 200,
      });
      return comments.map(serializeComment);
    }
    const where: any = { issueId: issue_id, deletedAt: null, issueCommentId: null };
    const activities = await prisma.issueActivity.findMany({ where, orderBy: { createdAt: "asc" }, take: 100 });
    return activities.map((a: any) => ({
      id: a.id, issue: issue_id, project: a.projectId, workspace: a.workspaceId,
      actor: a.actorId ?? null, verb: a.verb, field: a.field ?? null,
      old_value: a.oldValue ?? null, new_value: a.newValue ?? null,
      comment: a.comment ?? "", epoch: a.epoch ?? null, issue_comment: a.issueCommentId ?? null,
      created_at: isoDate(a.createdAt), updated_at: isoDate(a.updatedAt),
    }));
  })

  // ── Update intake work item ──────────────────────────────────────────────────
  .patch("/:issue_id/", async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 5) { set.status = 403; return { detail: "Permission denied." }; }
    const b = body as any;

    const before = await prisma.issue.findFirst({
      where: { id: issue_id },
      include: { state: { select: { id: true, name: true } } },
    });

    const data: any = { updatedById: user.id };
    const newStateId = b.state ?? b.state_id;
    if (newStateId !== undefined) data.stateId = newStateId;
    if (b.priority !== undefined) data.priority = b.priority;
    if (b.entity_id !== undefined) data.entityId = b.entity_id;
    if (b.description_html !== undefined) {
      data.descriptionHtml = b.description_html;
      data.descriptionStripped = b.description_html.replace(/<[^>]+>/g, "");
    }
    const updated = await prisma.issue.update({ where: { id: issue_id }, data, include: ISSUE_INCLUDE });

    if (before) {
      const changes: ActivityChange[] = [];
      if (newStateId !== undefined && before.stateId !== newStateId) {
        const target = await prisma.state.findFirst({ where: { id: newStateId }, select: { name: true } });
        changes.push({ field: "state", oldValue: before.state?.name ?? null, newValue: target?.name ?? null, comment: "updated the state" });
      }
      if (b.priority !== undefined) {
        const c = diffChange("priority", before.priority, b.priority, "updated the priority");
        if (c) changes.push(c);
      }
      await recordActivities({ issueId: issue_id, workspaceId: ws.id, projectId: project_id, actorId: user.id }, changes);
    }

    return serializeIssue(updated);
  });
