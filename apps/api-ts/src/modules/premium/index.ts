/**
 * Premium feature endpoints:
 * - Time tracking
 * - Estimates
 * - Intake/Inbox
 * - Import/Export
 * - Audit logs
 * - Issue types & custom properties
 * - Deploy boards
 * - Issue reactions/votes/subscribers
 */
import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { nextSequenceId } from "@utils/sequence";
import { getWorkspaceOrFail, requireWorkspaceMember, requireWorkspaceWriter, getProjectOrFail } from "@utils/workspace";

export const premiumModule = new Elysia()
  .use(authPlugin)

  // ─────────────────────────────────────────────────────────────────────────
  // TIME TRACKING
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/projects/:project_id/issues/:issue_id/time-logs/", async ({ params: { slug, project_id, issue_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { issueId: issue_id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.issueTimeLog.findMany({ where, skip, take, include: { member: { select: { id: true, displayName: true } } }, orderBy: { loggedDate: "desc" } }),
      count: () => prisma.issueTimeLog.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/workspaces/:slug/projects/:project_id/issues/:issue_id/time-logs/", async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    if (!b.duration_minutes || !b.logged_date) { set.status = 400; return { detail: "duration_minutes and logged_date are required." }; }

    const log = await prisma.issueTimeLog.create({
      data: {
        issueId: issue_id, workspaceId: ws.id, projectId: project_id,
        memberId: b.member_id ?? user.id,
        loggedDate: new Date(b.logged_date),
        durationMinutes: b.duration_minutes,
        description: b.description ?? null,
        createdById: user.id,
      },
    });
    set.status = 201;
    return log;
  })

  .patch("/workspaces/:slug/projects/:project_id/issues/:issue_id/time-logs/:log_id/", async ({ params: { slug, project_id, issue_id, log_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.duration_minutes !== undefined) data.durationMinutes = b.duration_minutes;
    if (b.logged_date !== undefined) data.loggedDate = new Date(b.logged_date);
    if (b.description !== undefined) data.description = b.description;
    if (b.is_approved !== undefined) data.isApproved = b.is_approved;
    return prisma.issueTimeLog.update({ where: { id: log_id }, data });
  })

  .delete("/workspaces/:slug/projects/:project_id/issues/:issue_id/time-logs/:log_id/", async ({ params: { slug, project_id, log_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.issueTimeLog.update({ where: { id: log_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ─────────────────────────────────────────────────────────────────────────
  // INTAKE / INBOX
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/projects/:project_id/intakes/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    return prisma.intake.findMany({ where: { projectId: project_id, deletedAt: null } });
  })

  .post("/workspaces/:slug/projects/:project_id/intakes/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    const b = body as any;
    const intake = await prisma.intake.create({
      data: { projectId: project_id, workspaceId: ws.id, name: b.name ?? "Intake", description: b.description ?? "", createdById: user.id },
    });
    set.status = 201;
    return intake;
  })

  .get("/workspaces/:slug/projects/:project_id/intakes/:intake_id/issues/", async ({ params: { slug, project_id, intake_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where: any = { intakeId: intake_id, deletedAt: null };
    if (query.status !== undefined) where.status = Number(query.status);
    return paginate({
      query: (skip, take) =>
        prisma.intakeIssue.findMany({
          where, skip, take,
          include: { issue: { select: { id: true, name: true, priority: true, state: { select: { id: true, name: true, group: true } } } } },
          orderBy: { createdAt: "desc" },
        }),
      count: () => prisma.intakeIssue.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/workspaces/:slug/projects/:project_id/intakes/:intake_id/issues/", async ({ params: { slug, project_id, intake_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;

    // Create issue + intake issue atomically
    const defaultState = await prisma.state.findFirst({ where: { projectId: project_id, isTriage: true, deletedAt: null } });

    const intakeIssue = await prisma.$transaction(async (tx) => {
      const sequenceId = await nextSequenceId(tx, project_id);
      const issue = await tx.issue.create({
        data: {
          projectId: project_id, workspaceId: ws.id, sequenceId, name: b.name ?? "Untitled",
          descriptionHtml: b.description_html ?? "<p></p>",
          descriptionStripped: (b.description_html ?? "").replace(/<[^>]+>/g, ""),
          stateId: defaultState?.id ?? null, priority: b.priority ?? "none",
          isDraft: false, createdById: user.id,
        },
      });
      return tx.intakeIssue.create({
        data: {
          intakeId: intake_id, issueId: issue.id, workspaceId: ws.id, projectId: project_id,
          status: -2, source: b.source ?? "in-app", createdById: user.id,
        },
        include: { issue: true },
      });
    });
    set.status = 201;
    return intakeIssue;
  })

  .patch("/workspaces/:slug/projects/:project_id/intakes/:intake_id/issues/:issue_id/", async ({ params: { slug, project_id, intake_id, issue_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.status !== undefined) data.status = b.status;
    if (b.snooze_till !== undefined) data.snoozeTill = b.snooze_till ? new Date(b.snooze_till) : null;
    if (b.duplicate_of !== undefined) data.duplicateOf = b.duplicate_of;

    return prisma.intakeIssue.update({ where: { id: issue_id }, data, include: { issue: true } });
  })

  // ─────────────────────────────────────────────────────────────────────────
  // IMPORT / EXPORT
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/import-jobs/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const where = { workspaceId: ws.id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.importJob.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.importJob.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/workspaces/:slug/import-jobs/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.source) { set.status = 400; return { detail: "source is required (jira|linear|asana|clickup|github|notion|confluence|csv)." }; }
    const job = await prisma.importJob.create({
      data: {
        workspaceId: ws.id, projectId: b.project_id ?? null, source: b.source,
        config: b.config ?? {}, metadata: b.metadata ?? {}, token: b.token ?? null,
        status: "queued", createdById: user.id,
      },
    });
    set.status = 201;
    return job;
  })

  .get("/workspaces/:slug/import-jobs/:job_id/", async ({ params: { slug, job_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    return prisma.importJob.findFirstOrThrow({ where: { id: job_id, workspaceId: ws.id } });
  })

  .post("/workspaces/:slug/export-issues/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const job = await prisma.exportJob.create({
      data: {
        workspaceId: ws.id, projectId: b.project_id ?? null,
        format: b.format ?? "csv", filters: b.filters ?? {},
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: "queued", createdById: user.id,
      },
    });
    set.status = 201;
    return job;
  })

  .get("/workspaces/:slug/export-jobs/:job_id/", async ({ params: { slug, job_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return prisma.exportJob.findFirstOrThrow({ where: { id: job_id, workspaceId: ws.id } });
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT LOGS
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/audit-logs/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    const m = await requireWorkspaceWriter(ws.id, user.id);
    if (m.role < 20) return { detail: "Only admins can view audit logs." };

    const where: any = { workspaceId: ws.id };
    if (query.entity) where.entity = query.entity;
    if (query.entity_id) where.entityId = query.entity_id;
    if (query.actor_id) where.actorId = query.actor_id;
    if (query.action) where.action = query.action;
    if (query.date_from) where.createdAt = { gte: new Date(query.date_from as string) };
    if (query.date_to) where.createdAt = { ...where.createdAt, lte: new Date(query.date_to as string) };

    return paginate({
      query: (skip, take) => prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.auditLog.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  // ─────────────────────────────────────────────────────────────────────────
  // ISSUE TYPES & CUSTOM PROPERTIES
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/issue-types/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return prisma.issueType.findMany({
      where: { workspaceId: ws.id, deletedAt: null, isActive: true },
      include: { properties: { where: { deletedAt: null, isActive: true }, include: { options: { where: { isActive: true } } } } },
      orderBy: { level: "asc" },
    });
  })

  .post("/workspaces/:slug/issue-types/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "Name is required." }; }
    const type = await prisma.issueType.create({
      data: { workspaceId: ws.id, projectId: b.project_id ?? null, name: b.name, description: b.description ?? "", isEpic: b.is_epic ?? false, level: b.level ?? 0, isDefault: b.is_default ?? false },
    });
    set.status = 201;
    return type;
  })

  .get("/workspaces/:slug/issue-properties/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where: any = { workspaceId: ws.id, deletedAt: null };
    if (query.issue_type_id) where.issueTypeId = query.issue_type_id;
    return prisma.issueProperty.findMany({ where, include: { options: { where: { isActive: true } } }, orderBy: { sortOrder: "asc" } });
  })

  .post("/workspaces/:slug/issue-properties/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.name || !b.property_type) { set.status = 400; return { detail: "name and property_type are required." }; }
    const prop = await prisma.issueProperty.create({
      data: { workspaceId: ws.id, issueTypeId: b.issue_type_id ?? null, name: b.name, displayName: b.display_name ?? b.name, propertyType: b.property_type, isRequired: b.is_required ?? false, isMulti: b.is_multi ?? false, defaultValue: b.default_value ?? null, extraSettings: b.extra_settings ?? null, sortOrder: b.sort_order ?? 65535 },
    });
    set.status = 201;
    return prop;
  })

  // ─────────────────────────────────────────────────────────────────────────
  // ISSUE REACTIONS, VOTES, SUBSCRIBERS
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/projects/:project_id/issues/:issue_id/reactions/", async ({ params: { slug, project_id, issue_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    return prisma.issueReaction.findMany({ where: { issueId: issue_id, deletedAt: null }, include: { actor: { select: { id: true, displayName: true } } } });
  })

  .post("/workspaces/:slug/projects/:project_id/issues/:issue_id/reactions/", async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    try {
      const r = await prisma.issueReaction.create({
        data: { issueId: issue_id, actorId: user.id, workspaceId: ws.id, projectId: project_id, reaction: b.reaction },
      });
      set.status = 201;
      return r;
    } catch (e: any) {
      if (e?.code === "P2002") { set.status = 409; return { detail: "Already reacted." }; }
      throw e;
    }
  })

  .delete("/workspaces/:slug/projects/:project_id/issues/:issue_id/reactions/:reaction/", async ({ params: { slug, project_id, issue_id, reaction }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.issueReaction.updateMany({ where: { issueId: issue_id, actorId: user.id, reaction }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  .post("/workspaces/:slug/projects/:project_id/issues/:issue_id/votes/", async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    try {
      const v = await prisma.issueVote.create({
        data: { issueId: issue_id, actorId: user.id, workspaceId: ws.id, projectId: project_id, vote: (body as any).vote ?? 1 },
      });
      set.status = 201;
      return v;
    } catch (e: any) {
      if (e?.code === "P2002") { set.status = 409; return { detail: "Already voted." }; }
      throw e;
    }
  })

  .delete("/workspaces/:slug/projects/:project_id/issues/:issue_id/votes/", async ({ params: { slug, project_id, issue_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.issueVote.updateMany({ where: { issueId: issue_id, actorId: user.id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  .get("/workspaces/:slug/projects/:project_id/issues/:issue_id/subscribers/", async ({ params: { slug, project_id, issue_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    return prisma.issueSubscriber.findMany({ where: { issueId: issue_id, deletedAt: null }, include: { subscriber: { select: { id: true, displayName: true } } } });
  })

  .post("/workspaces/:slug/projects/:project_id/issues/:issue_id/subscribe/", async ({ params: { slug, project_id, issue_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    try {
      const sub = await prisma.issueSubscriber.create({
        data: { issueId: issue_id, subscriberId: user.id, workspaceId: ws.id, projectId: project_id },
      });
      set.status = 201;
      return sub;
    } catch (e: any) {
      if (e?.code === "P2002") { set.status = 409; return { detail: "Already subscribed." }; }
      throw e;
    }
  })

  .delete("/workspaces/:slug/projects/:project_id/issues/:issue_id/unsubscribe/", async ({ params: { slug, project_id, issue_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.issueSubscriber.updateMany({ where: { issueId: issue_id, subscriberId: user.id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ─────────────────────────────────────────────────────────────────────────
  // BULK OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────

  .post("/workspaces/:slug/projects/:project_id/issues/bulk-update/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 5) { set.status = 403; return { detail: "Permission denied." }; }

    const b = body as any;
    const issueIds: string[] = b.issue_ids ?? [];
    if (!issueIds.length) { set.status = 400; return { detail: "issue_ids is required." }; }

    const data: any = { updatedById: user.id };
    if (b.state !== undefined) data.stateId = b.state;
    if (b.priority !== undefined) data.priority = b.priority;
    if (b.target_date !== undefined) data.targetDate = b.target_date ? new Date(b.target_date) : null;

    const result = await prisma.issue.updateMany({
      where: { id: { in: issueIds }, projectId: project_id },
      data,
    });

    if (b.assignees !== undefined) {
      await prisma.issueAssignee.updateMany({ where: { issueId: { in: issueIds } }, data: { deletedAt: new Date() } });
      if (b.assignees.length) {
        await prisma.issueAssignee.createMany({
          data: issueIds.flatMap(id => b.assignees.map((uid: string) => ({ issueId: id, assigneeId: uid, workspaceId: ws.id, projectId: project_id }))),
          skipDuplicates: true,
        });
      }
    }

    if (b.labels !== undefined) {
      await prisma.issueLabel.updateMany({ where: { issueId: { in: issueIds } }, data: { deletedAt: new Date() } });
      if (b.labels.length) {
        await prisma.issueLabel.createMany({
          data: issueIds.flatMap(id => b.labels.map((lid: string) => ({ issueId: id, labelId: lid, workspaceId: ws.id, projectId: project_id }))),
          skipDuplicates: true,
        });
      }
    }

    return { updated: result.count };
  })

  .post("/workspaces/:slug/projects/:project_id/issues/bulk-delete/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }

    const issueIds: string[] = (body as any).issue_ids ?? [];
    const result = await prisma.issue.updateMany({
      where: { id: { in: issueIds }, projectId: project_id },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count };
  })

  .post("/workspaces/:slug/projects/:project_id/issues/bulk-archive/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }

    const issueIds: string[] = (body as any).issue_ids ?? [];
    const result = await prisma.issue.updateMany({
      where: { id: { in: issueIds }, projectId: project_id },
      data: { archivedAt: new Date() },
    });
    return { archived: result.count };
  })

  // ─────────────────────────────────────────────────────────────────────────
  // ISSUE VIEWS
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/views/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = { workspaceId: ws.id, isGlobal: true, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.issueView.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.issueView.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/workspaces/:slug/views/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "Name is required." }; }
    const view = await prisma.issueView.create({
      data: { workspaceId: ws.id, name: b.name, description: b.description ?? "", filters: b.filters ?? {}, queryData: b.query_data ?? {}, isGlobal: true, access: b.access ?? "PUBLIC", createdById: user.id },
    });
    set.status = 201;
    return view;
  })

  .get("/workspaces/:slug/projects/:project_id/views/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { workspaceId: ws.id, projectId: project_id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.issueView.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.issueView.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/workspaces/:slug/projects/:project_id/views/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "Name is required." }; }
    const view = await prisma.issueView.create({
      data: { workspaceId: ws.id, projectId: project_id, name: b.name, description: b.description ?? "", filters: b.filters ?? {}, queryData: b.query_data ?? {}, isGlobal: false, access: b.access ?? "PUBLIC", createdById: user.id },
    });
    set.status = 201;
    return view;
  })

  .patch("/workspaces/:slug/views/:view_id/", async ({ params: { slug, view_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.description !== undefined) data.description = b.description;
    if (b.filters !== undefined) data.filters = b.filters;
    if (b.query_data !== undefined) data.queryData = b.query_data;
    return prisma.issueView.update({ where: { id: view_id }, data });
  })

  .delete("/workspaces/:slug/views/:view_id/", async ({ params: { slug, view_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.issueView.update({ where: { id: view_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ─────────────────────────────────────────────────────────────────────────
  // DEPLOY BOARDS
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/projects/:project_id/deploy-boards/", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    return prisma.deployBoard.findMany({ where: { projectId: project_id, deletedAt: null } });
  })

  .post("/workspaces/:slug/projects/:project_id/deploy-boards/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    const b = body as any;
    const board = await prisma.deployBoard.create({
      data: {
        projectId: project_id, workspaceId: ws.id,
        anchor: b.anchor ?? Math.random().toString(36).substring(2, 15),
        commentsAccess: b.comments_access ?? false,
        reactionsAccess: b.reactions_access ?? false,
        votesAccess: b.votes_access ?? false,
        isPublic: b.is_public ?? false,
        viewProps: b.view_props ?? {},
      },
    });
    set.status = 201;
    return board;
  });
