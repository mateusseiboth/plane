import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";
import { serializeIssue, ISSUE_INCLUDE, isoDate, dateOnly } from "@utils/serialize";

// serializeIssue, ISSUE_INCLUDE, isoDate, dateOnly imported from @utils/serialize

export const issueModule = new Elysia({ prefix: "/workspaces/:slug/projects/:project_id/issues" })
  .use(authPlugin)

  .get("/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const where: any = { projectId: project_id, deletedAt: null, isDraft: false };
    if (query.state_id) where.stateId = query.state_id;
    if (query.priority) where.priority = query.priority;
    if (query.entity_id) where.entityId = query.entity_id;
    if (query.legacy_ticket_number) where.legacyTicketNumber = query.legacy_ticket_number;

    return paginate({
      query: (skip, take) =>
        prisma.issue.findMany({ where, skip, take, include: ISSUE_INCLUDE, orderBy: { createdAt: "desc" } }),
      count: () => prisma.issue.count({ where }),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map(serializeIssue),
    });
  })

  .post("/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "Name is required." }; }

    const defaultState = await prisma.state.findFirst({
      where: { projectId: project_id, default: true, deletedAt: null },
    });

    const issue = await prisma.$transaction(async (tx) => {
      const created = await tx.issue.create({
        data: {
          projectId: project_id,
          workspaceId: ws.id,
          name: b.name,
          descriptionHtml: b.description_html ?? "<p></p>",
          descriptionStripped: (b.description_html ?? "").replace(/<[^>]+>/g, ""),
          descriptionJson: b.description ?? null,
          stateId: b.state ?? defaultState?.id ?? null,
          priority: b.priority ?? "none",
          startDate: b.start_date ? new Date(b.start_date) : null,
          targetDate: b.target_date ? new Date(b.target_date) : null,
          isDraft: b.is_draft ?? false,
          entityId: b.entity_id ?? null,
          legacyTicketNumber: b.legacy_ticket_number ?? null,
          externalSource: b.external_source ?? null,
          externalId: b.external_id ?? null,
          createdById: user.id,
        },
        include: ISSUE_INCLUDE,
      });

      // Auto-assign creator (premium feature recreation)
      // Merge creator into assignees list automatically
      const assigneeSet = new Set<string>([user.id, ...(b.assignees ?? [])]);
      await tx.issueAssignee.createMany({
        data: Array.from(assigneeSet).map((uid: string) => ({
          issueId: created.id, assigneeId: uid, workspaceId: ws.id, projectId: project_id,
        })),
        skipDuplicates: true,
      });
      if (b.labels?.length) {
        await tx.issueLabel.createMany({
          data: b.labels.map((lid: string) => ({
            issueId: created.id, labelId: lid, workspaceId: ws.id, projectId: project_id,
          })),
          skipDuplicates: true,
        });
      }
      return created;
    });

    set.status = 201;
    return serializeIssue(issue);
  })

  .get("/:issue_id", async ({ params: { slug, project_id, issue_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const issue = await prisma.issue.findFirstOrThrow({
      where: { id: issue_id, projectId: project_id, deletedAt: null },
      include: ISSUE_INCLUDE,
    });
    return serializeIssue(issue);
  })

  .patch("/:issue_id", async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 5) { set.status = 403; return { detail: "Permission denied." }; }

    const b = body as any;
    const data: any = { updatedById: user.id };
    if (b.name !== undefined) data.name = b.name;
    if (b.description_html !== undefined) {
      data.descriptionHtml = b.description_html;
      data.descriptionStripped = b.description_html.replace(/<[^>]+>/g, "");
    }
    if (b.state !== undefined) data.stateId = b.state;
    if (b.priority !== undefined) data.priority = b.priority;
    if (b.start_date !== undefined) data.startDate = b.start_date ? new Date(b.start_date) : null;
    if (b.target_date !== undefined) data.targetDate = b.target_date ? new Date(b.target_date) : null;
    if (b.entity_id !== undefined) data.entityId = b.entity_id;
    if (b.legacy_ticket_number !== undefined) data.legacyTicketNumber = b.legacy_ticket_number;

    await prisma.issue.update({ where: { id: issue_id }, data });

    if (b.assignees !== undefined) {
      await prisma.issueAssignee.updateMany({ where: { issueId: issue_id }, data: { deletedAt: new Date() } });
      if (b.assignees.length) {
        await prisma.issueAssignee.createMany({
          data: b.assignees.map((uid: string) => ({ issueId: issue_id, assigneeId: uid, workspaceId: ws.id, projectId: project_id })),
          skipDuplicates: true,
        });
      }
    }
    if (b.labels !== undefined) {
      await prisma.issueLabel.updateMany({ where: { issueId: issue_id }, data: { deletedAt: new Date() } });
      if (b.labels.length) {
        await prisma.issueLabel.createMany({
          data: b.labels.map((lid: string) => ({ issueId: issue_id, labelId: lid, workspaceId: ws.id, projectId: project_id })),
          skipDuplicates: true,
        });
      }
    }

    return serializeIssue(
      await prisma.issue.findFirstOrThrow({ where: { id: issue_id }, include: ISSUE_INCLUDE })
    );
  })

  .delete("/:issue_id", async ({ params: { slug, project_id, issue_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    await prisma.issue.update({ where: { id: issue_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // Comments ─────────────────────────────────────────────────────────────────

  .get("/:issue_id/comments/", async ({ params: { slug, project_id, issue_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { issueId: issue_id, deletedAt: null };
    return paginate({
      query: (skip, take) =>
        prisma.issueComment.findMany({
          where, skip, take,
          include: { actor: { select: { id: true, displayName: true, email: true } } },
          orderBy: { createdAt: "asc" },
        }),
      count: () => prisma.issueComment.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/:issue_id/comments/", async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const b = body as any;
    if (!b.comment_html && !b.comment) { set.status = 400; return { detail: "Comment content is required." }; }

    const comment = await prisma.issueComment.create({
      data: {
        issueId: issue_id,
        actorId: user.id,
        workspaceId: ws.id,
        projectId: project_id,
        commentHtml: b.comment_html ?? "<p></p>",
        commentStripped: (b.comment_html ?? "").replace(/<[^>]+>/g, ""),
        commentJson: b.comment ?? null,
        access: b.access ?? "INTERNAL",
        parentId: b.parent ?? null,
        createdById: user.id,
      },
    });
    set.status = 201;
    return comment;
  })

  .patch("/:issue_id/comments/:comment_id/", async ({ params: { issue_id, comment_id }, body, user }) => {
    const b = body as any;
    const data: any = { updatedById: user.id, editedAt: new Date() };
    if (b.comment_html !== undefined) {
      data.commentHtml = b.comment_html;
      data.commentStripped = b.comment_html.replace(/<[^>]+>/g, "");
    }
    if (b.access !== undefined) data.access = b.access;
    return prisma.issueComment.update({ where: { id: comment_id }, data });
  })

  .delete("/:issue_id/comments/:comment_id/", async ({ params: { comment_id }, set }) => {
    await prisma.issueComment.update({ where: { id: comment_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // Activities ───────────────────────────────────────────────────────────────

  .get("/:issue_id/activities/", async ({ params: { slug, project_id, issue_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { issueId: issue_id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.issueActivity.findMany({ where, skip, take, orderBy: { createdAt: "asc" } }),
      count: () => prisma.issueActivity.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  // Attachments ──────────────────────────────────────────────────────────────

  .get("/:issue_id/attachments/", async ({ params: { slug, project_id, issue_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { issueId: issue_id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.issueAttachment.findMany({ where, skip, take }),
      count: () => prisma.issueAttachment.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  // Links ────────────────────────────────────────────────────────────────────

  .get("/:issue_id/links/", async ({ params: { slug, project_id, issue_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { issueId: issue_id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.issueLink.findMany({ where, skip, take }),
      count: () => prisma.issueLink.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/:issue_id/links/", async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    if (!b.url) { set.status = 400; return { detail: "URL is required." }; }
    const link = await prisma.issueLink.create({
      data: { issueId: issue_id, workspaceId: ws.id, projectId: project_id, url: b.url, title: b.title ?? "", metadata: b.metadata ?? {} },
    });
    set.status = 201;
    return link;
  })

  .delete("/:issue_id/links/:link_id/", async ({ params: { link_id }, set }) => {
    await prisma.issueLink.update({ where: { id: link_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // Relations ────────────────────────────────────────────────────────────────

  .get("/:issue_id/relations/", async ({ params: { slug, project_id, issue_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { issueId: issue_id, deletedAt: null };
    return paginate({
      query: (skip, take) =>
        prisma.issueRelation.findMany({
          where, skip, take,
          include: { relatedIssue: { select: { id: true, name: true, priority: true } } },
        }),
      count: () => prisma.issueRelation.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/:issue_id/relations/", async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    if (!b.related_issue) { set.status = 400; return { detail: "related_issue is required." }; }
    if (!b.relation_type) { set.status = 400; return { detail: "relation_type is required." }; }
    const relation = await prisma.issueRelation.create({
      data: { issueId: issue_id, relatedIssueId: b.related_issue, workspaceId: ws.id, projectId: project_id, relationType: b.relation_type },
    });
    set.status = 201;
    return relation;
  })

  .delete("/:issue_id/relations/:relation_id/", async ({ params: { relation_id }, set }) => {
    await prisma.issueRelation.update({ where: { id: relation_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  });
