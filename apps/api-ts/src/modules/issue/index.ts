import prisma from "@db";
import {authPlugin} from "@middleware/auth";
import {Prisma} from "@prisma/client/extension";
import {paginate} from "@utils/pagination";
import {COMMENT_INCLUDE, ISSUE_INCLUDE, serializeComment, serializeIssue} from "@utils/serialize";
import {diffChange, recordActivities, type ActivityChange} from "@utils/activity";
import {applyIssueFilters, normalizeFilters} from "@utils/filters";
import {canTransition, resolveRole, visibleStateIds} from "@utils/permission-checks";
import {replicateToLinkedIntakes} from "@utils/intake-replication";
import {computeTargetDate} from "@utils/sla";
import {getProjectOrFail, getWorkspaceOrFail} from "@utils/workspace";
import Elysia from "elysia";

// State-transition rules are now data-driven (utils/permission-checks.ts), seeded
// per workspace and editable through the roles API. See utils/permissions.ts for
// the default matrix.

// serializeIssue, ISSUE_INCLUDE, isoDate, dateOnly imported from @utils/serialize

export const issueModule = new Elysia({prefix: "/workspaces/:slug/projects/:project_id/issues"})
  .use(authPlugin)

  // GET /:issue_id/meta/ — minimal payload for redirect (project_identifier + sequence_id)
  .get("/:issue_id/meta/", async ({params: {slug, project_id, issue_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const issue = await prisma.issue.findFirst({
      where: {id: issue_id, projectId: project_id, workspaceId: ws.id, deletedAt: null},
      include: {project: {select: {identifier: true}}},
    });
    if (!issue) {
      set.status = 404;
      return {detail: "Issue not found."};
    }
    return {project_identifier: issue.project?.identifier ?? "", sequence_id: String(issue.sequenceId)};
  })

  .get("/", async ({params: {slug, project_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    const {member} = await getProjectOrFail(ws.id, project_id, user.id);

    // Build base where clause
    const where: any = {projectId: project_id, deletedAt: null, isDraft: false};

    // Non-filter scalar params that are not part of the filter map
    if (query.entity_id) where.entityId = query.entity_id;
    if (query.legacy_ticket_number) where.legacyTicketNumber = query.legacy_ticket_number;

    // Parse the frontend `filters` JSON param (+ loose params) and apply it
    const filters = normalizeFilters(query as Record<string, unknown>);
    await applyIssueFilters(where, filters, {projectId: project_id});

    // Board visibility per role (H3): restrict to states this role may see.
    const role = await resolveRole(ws.id, member.role, (member as any).workflowRoleId);
    const allowedStates = await visibleStateIds(role, project_id);
    if (allowedStates) {
      const existing = where.stateId?.in as string[] | undefined;
      const intersect = existing ? existing.filter((id) => allowedStates.includes(id)) : allowedStates;
      where.stateId = {in: intersect};
    }

    // Order by
    const orderMap: Record<string, any> = {
      "-created_at": {createdAt: "desc"},
      created_at: {createdAt: "asc"},
      "-updated_at": {updatedAt: "desc"},
      updated_at: {updatedAt: "asc"},
      "-priority": {priority: "desc"},
      priority: {priority: "asc"},
      "-target_date": {targetDate: "desc"},
      target_date: {targetDate: "asc"},
      "-start_date": {startDate: "desc"},
      start_date: {startDate: "asc"},
      sort_order: {sortOrder: "asc"},
      "-sort_order": {sortOrder: "desc"},
      sequence_id: {sequenceId: "asc"},
      "-sequence_id": {sequenceId: "desc"},
    };
    const orderBy = orderMap[(query.order_by as string) ?? "-created_at"] ?? {createdAt: "desc"};

    const perPage = Number(query.per_page ?? 30);
    const groupBy = query.group_by as string | undefined;

    // ── Grouped response (for kanban/groupBy views) ───────────────────────────
    if (groupBy) {
      const groupByMap: Record<string, string> = {
        state_id: "stateId",
        priority: "priority",
        state__group: "stateGroup", // handled specially
        created_by: "createdById",
        project_id: "projectId",
      };

      const prismaField = groupByMap[groupBy];

      // Get all distinct group values
      let groupValues: (string | null)[] = [];

      if (groupBy === "state_id") {
        const states = await prisma.state.findMany({
          where: {projectId: project_id, deletedAt: null},
          select: {id: true},
          orderBy: {sequence: "asc"},
        });
        groupValues = states.map((s: any) => s.id);
      } else if (groupBy === "priority") {
        groupValues = ["urgent", "high", "medium", "low", "none"];
      } else if (groupBy === "state__group") {
        groupValues = ["backlog", "unstarted", "started", "completed", "cancelled", "triage"];
      } else {
        const distinct = await prisma.issue.findMany({
          where,
          select: {[prismaField ?? "stateId"]: true},
          distinct: [prismaField ?? "stateId"] as any,
        });
        groupValues = distinct.map((d: any) => d[prismaField ?? "stateId"]).filter(Boolean);
      }

      const total_count = await prisma.issue.count({where});
      const results: Record<string, any> = {};

      for (const gv of groupValues) {
        const groupWhere: any = {...where};

        if (groupBy === "state_id") groupWhere.stateId = gv;
        else if (groupBy === "priority") groupWhere.priority = gv;
        else if (groupBy === "state__group") {
          const stateIds = await prisma.state.findMany({
            where: {projectId: project_id, group: gv as string, deletedAt: null},
            select: {id: true},
          });
          groupWhere.stateId = {in: stateIds.map((s: any) => s.id)};
        }

        const [groupIssues, groupCount] = await Promise.all([
          prisma.issue.findMany({where: groupWhere, include: ISSUE_INCLUDE, orderBy, take: perPage}),
          prisma.issue.count({where: groupWhere}),
        ]);

        results[gv ?? "none"] = {
          results: groupIssues.map(serializeIssue),
          total_results: groupCount,
          next_cursor: `${perPage}:1:0`,
          prev_cursor: `${perPage}:0:1`,
          next_page_results: groupCount > perPage,
          prev_page_results: false,
        };
      }

      return {total_count, results, next_cursor: null, prev_cursor: null, next_page_results: false, prev_page_results: false};
    }

    // ── Flat (non-grouped) paginated response ──────────────────────────────────
    return paginate({
      query: (skip, take) => prisma.issue.findMany({where, skip, take, include: ISSUE_INCLUDE, orderBy}),
      count: () => prisma.issue.count({where}),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map(serializeIssue),
    });
  })

  .post("/", async ({params: {slug, project_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const b = body as any;
    if (!b.name) {
      set.status = 400;
      return {detail: "Name is required."};
    }

    const defaultState = await prisma.state.findFirst({
      where: {projectId: project_id, default: true, deletedAt: null},
    });

    const issue = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.issue.create({
        data: {
          projectId: project_id,
          workspaceId: ws.id,
          name: b.name,
          descriptionHtml: b.description_html ?? "<p></p>",
          descriptionStripped: (b.description_html ?? "").replace(/<[^>]+>/g, ""),
          descriptionJson: b.description ?? null,
          // Frontend sends `state_id`; `state` is the Django-legacy alias. Honor either.
          stateId: b.state ?? b.state_id ?? defaultState?.id ?? null,
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
          issueId: created.id,
          assigneeId: uid,
          workspaceId: ws.id,
          projectId: project_id,
        })),
        skipDuplicates: true,
      });
      if (b.labels?.length) {
        await tx.issueLabel.createMany({
          data: b.labels.map((lid: string) => ({
            issueId: created.id,
            labelId: lid,
            workspaceId: ws.id,
            projectId: project_id,
          })),
          skipDuplicates: true,
        });
      }
      return created;
    });

    // SLA (C): auto due date from label deadlines + priority when none was given.
    let createdIssue = issue;
    if (!b.target_date && b.labels?.length) {
      const auto = await computeTargetDate(b.labels, b.priority ?? "none", issue.createdAt ?? new Date());
      if (auto) createdIssue = await prisma.issue.update({where: {id: issue.id}, data: {targetDate: auto}, include: ISSUE_INCLUDE});
    }

    await recordActivities(
      {issueId: issue.id, workspaceId: ws.id, projectId: project_id, actorId: user.id},
      [{verb: "created", field: "issue", comment: "created the work item"}],
    );

    set.status = 201;
    return serializeIssue(createdIssue);
  })

  .get("/:issue_id", async ({params: {slug, project_id, issue_id}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const issue = await prisma.issue.findFirstOrThrow({
      where: {id: issue_id, projectId: project_id, deletedAt: null},
      include: ISSUE_INCLUDE,
    });
    return serializeIssue(issue);
  })

  .patch("/:issue_id", async ({params: {slug, project_id, issue_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const {member} = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 5) {
      set.status = 403;
      return {detail: "Permission denied."};
    }

    const b = body as any;

    // Snapshot the issue before mutation so we can log activity diffs afterwards.
    const before = await prisma.issue.findFirst({
      where: {id: issue_id},
      include: {state: {select: {id: true, name: true, group: true}}},
    });

    const data: any = {updatedBy: {connect: {id: user.id}}};
    if (b.name !== undefined) data.name = b.name;
    if (b.description_html !== undefined) {
      data.descriptionHtml = b.description_html;
      data.descriptionStripped = b.description_html.replace(/<[^>]+>/g, "");
    }
    // Accept both `state` (Django legacy) and `state_id` (frontend ISSUE_FILTER_DEFAULT_DATA)
    const newStateId = b.state ?? b.state_id;
    let targetState: {id: string; name: string; group: string} | null = null;
    if (newStateId !== undefined) {
      // Validate state transition against the role's configurable workflow (H3)
      targetState = await prisma.state.findFirst({where: {id: newStateId}, select: {id: true, name: true, group: true}});
      if (before && targetState) {
        const role = await resolveRole(ws.id, member.role, (member as any).workflowRoleId);
        const allowed = await canTransition(
          role,
          {group: before.state?.group ?? "backlog", name: before.state?.name ?? ""},
          {group: targetState.group, name: targetState.name},
        );
        if (!allowed) {
          set.status = 403;
          return {detail: "Sua função não permite esta transição de estado."};
        }
      }
      data.stateId = newStateId;
    }
    if (b.priority !== undefined) data.priority = b.priority;
    if (b.start_date !== undefined) data.startDate = b.start_date ? new Date(b.start_date) : null;
    if (b.target_date !== undefined) data.targetDate = b.target_date ? new Date(b.target_date) : null;
    const entityIdValue = b.entity_id ?? b.entityId;
    if (entityIdValue !== undefined) {
      data.entity = entityIdValue ? {connect: {id: entityIdValue}} : {disconnect: true};
    }
    if (b.legacy_ticket_number !== undefined) data.legacyTicketNumber = b.legacy_ticket_number;
    if (b.sort_order !== undefined) data.sortOrder = b.sort_order;
    // b.type_id intentionally skipped — typeId not in current Prisma client
    if (b.is_draft !== undefined) data.isDraft = b.is_draft;
    if (b.parent_id !== undefined) data.parentId = b.parent_id;
    if (b.completed_at !== undefined) data.completedAt = b.completed_at ? new Date(b.completed_at) : null;

    await prisma.issue.update({where: {id: issue_id}, data});

    if (b.assignees !== undefined) {
      await prisma.issueAssignee.updateMany({where: {issueId: issue_id}, data: {deletedAt: new Date()}});
      if (b.assignees.length) {
        await prisma.issueAssignee.createMany({
          data: b.assignees.map((uid: string) => ({issueId: issue_id, assigneeId: uid, workspaceId: ws.id, projectId: project_id})),
          skipDuplicates: true,
        });
      }
    }
    if (b.labels !== undefined) {
      await prisma.issueLabel.updateMany({where: {issueId: issue_id}, data: {deletedAt: new Date()}});
      if (b.labels.length) {
        await prisma.issueLabel.createMany({
          data: b.labels.map((lid: string) => ({issueId: issue_id, labelId: lid, workspaceId: ws.id, projectId: project_id})),
          skipDuplicates: true,
        });
      }
    }

    // SLA (C): recompute the auto due date when labels/priority change and the
    // caller did not explicitly set target_date.
    if (b.target_date === undefined && (b.labels !== undefined || b.priority !== undefined) && before) {
      const labelIds: string[] =
        b.labels !== undefined
          ? b.labels
          : (await prisma.issueLabel.findMany({where: {issueId: issue_id, deletedAt: null}, select: {labelId: true}})).map((l) => l.labelId);
      const auto = await computeTargetDate(labelIds, b.priority ?? before.priority, before.createdAt ?? new Date());
      if (auto) await prisma.issue.update({where: {id: issue_id}, data: {targetDate: auto}});
    }

    // ── Activity log ──────────────────────────────────────────────────────────
    if (before) {
      const changes: ActivityChange[] = [];
      if (newStateId !== undefined && before.stateId !== newStateId) {
        changes.push({
          field: "state",
          oldValue: before.state?.name ?? null,
          newValue: targetState?.name ?? null,
          comment: "updated the state",
        });
      }
      if (b.name !== undefined) {
        const c = diffChange("name", before.name, b.name, "updated the name");
        if (c) changes.push(c);
      }
      if (b.priority !== undefined) {
        const c = diffChange("priority", before.priority, b.priority, "updated the priority");
        if (c) changes.push(c);
      }
      if (b.target_date !== undefined) {
        const oldTd = before.targetDate ? before.targetDate.toISOString().split("T")[0] : null;
        const newTd = b.target_date ? new Date(b.target_date).toISOString().split("T")[0] : null;
        const c = diffChange("target_date", oldTd, newTd, "updated the due date");
        if (c) changes.push(c);
      }
      if (b.start_date !== undefined) {
        const oldSd = before.startDate ? before.startDate.toISOString().split("T")[0] : null;
        const newSd = b.start_date ? new Date(b.start_date).toISOString().split("T")[0] : null;
        const c = diffChange("start_date", oldSd, newSd, "updated the start date");
        if (c) changes.push(c);
      }
      if (b.parent_id !== undefined) {
        const c = diffChange("parent", before.parentId, b.parent_id, "updated the parent");
        if (c) changes.push(c);
      }
      if (b.assignees !== undefined) changes.push({field: "assignees", comment: "updated the assignees"});
      if (b.labels !== undefined) changes.push({field: "labels", comment: "updated the labels"});
      await recordActivities({issueId: issue_id, workspaceId: ws.id, projectId: project_id, actorId: user.id}, changes);

      // H4: when completed/cancelled, replicate comments+activities to linked intakes
      if (targetState && (targetState.group === "completed" || targetState.group === "cancelled")) {
        await replicateToLinkedIntakes(issue_id, targetState.group as "completed" | "cancelled");
      }
    }

    return serializeIssue(await prisma.issue.findFirstOrThrow({where: {id: issue_id}, include: ISSUE_INCLUDE}));
  })

  .delete("/:issue_id", async ({params: {slug, project_id, issue_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const {member} = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) {
      set.status = 403;
      return {detail: "Permission denied."};
    }
    await prisma.issue.update({where: {id: issue_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // Comments ─────────────────────────────────────────────────────────────────

  .get("/:issue_id/comments/", async ({params: {slug, project_id, issue_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = {issueId: issue_id, deletedAt: null};
    return paginate({
      query: (skip, take) =>
        prisma.issueComment.findMany({
          where,
          skip,
          take,
          include: COMMENT_INCLUDE,
          orderBy: {createdAt: "asc"},
        }),
      count: () => prisma.issueComment.count({where}),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map(serializeComment),
    });
  })

  .post("/:issue_id/comments/", async ({params: {slug, project_id, issue_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const b = body as any;
    if (!b.comment_html && !b.comment) {
      set.status = 400;
      return {detail: "Comment content is required."};
    }

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
      include: COMMENT_INCLUDE,
    });
    // Mirror into the activity feed so the "comments" history tab shows it
    await prisma.issueActivity.create({
      data: {
        issueId: issue_id,
        workspaceId: ws.id,
        projectId: project_id,
        actorId: user.id,
        verb: "created",
        field: "comment",
        comment: "created a comment",
        issueCommentId: comment.id,
        epoch: Date.now(),
      },
    });
    set.status = 201;
    return serializeComment(comment);
  })

  .patch("/:issue_id/comments/:comment_id/", async ({params: {issue_id, comment_id}, body, user}) => {
    const b = body as any;
    const data: any = {updatedById: user.id, editedAt: new Date()};

    if (b.comment_html !== undefined) {
      // Snapshot current content as a version before overwriting
      const existing = await prisma.issueComment.findFirst({where: {id: comment_id}});
      if (existing?.commentHtml && existing.commentHtml !== b.comment_html) {
        await prisma.issueCommentVersion.create({
          data: {commentId: comment_id, commentHtml: existing.commentHtml, editedById: user.id},
        });
      }
      data.commentHtml = b.comment_html;
      data.commentStripped = b.comment_html.replace(/<[^>]+>/g, "");
    }
    if (b.access !== undefined) data.access = b.access;
    const updated = await prisma.issueComment.update({where: {id: comment_id}, data, include: COMMENT_INCLUDE});
    return serializeComment(updated);
  })

  // Comment version history
  .get("/:issue_id/comments/:comment_id/versions/", async ({params: {comment_id}, user}) => {
    const versions = await prisma.issueCommentVersion.findMany({
      where: {commentId: comment_id},
      orderBy: {createdAt: "desc"},
      take: 20,
    });
    return versions.map((v: any) => ({
      id: v.id,
      comment_id: v.commentId,
      comment_html: v.commentHtml,
      edited_by: v.editedById,
      created_at: v.createdAt?.toISOString(),
    }));
  })

  .delete("/:issue_id/comments/:comment_id/", async ({params: {comment_id}, set}) => {
    await prisma.issueComment.update({where: {id: comment_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // Activities ───────────────────────────────────────────────────────────────

  .get("/:issue_id/activities/", async ({params: {slug, project_id, issue_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = {issueId: issue_id, deletedAt: null};
    return paginate({
      query: (skip, take) => prisma.issueActivity.findMany({where, skip, take, orderBy: {createdAt: "asc"}}),
      count: () => prisma.issueActivity.count({where}),
      cursor: query.cursor as string | undefined,
    });
  })

  // Attachments ──────────────────────────────────────────────────────────────

  .get("/:issue_id/attachments/", async ({params: {slug, project_id, issue_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = {issueId: issue_id, deletedAt: null};
    return paginate({
      query: (skip, take) => prisma.issueAttachment.findMany({where, skip, take}),
      count: () => prisma.issueAttachment.count({where}),
      cursor: query.cursor as string | undefined,
    });
  })

  // Links ────────────────────────────────────────────────────────────────────

  .get("/:issue_id/links/", async ({params: {slug, project_id, issue_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = {issueId: issue_id, deletedAt: null};
    return paginate({
      query: (skip, take) => prisma.issueLink.findMany({where, skip, take}),
      count: () => prisma.issueLink.count({where}),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/:issue_id/links/", async ({params: {slug, project_id, issue_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    if (!b.url) {
      set.status = 400;
      return {detail: "URL is required."};
    }
    const link = await prisma.issueLink.create({
      data: {issueId: issue_id, workspaceId: ws.id, projectId: project_id, url: b.url, title: b.title ?? "", metadata: b.metadata ?? {}},
    });
    set.status = 201;
    return link;
  })

  .delete("/:issue_id/links/:link_id/", async ({params: {link_id}, set}) => {
    await prisma.issueLink.update({where: {id: link_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // Relations ────────────────────────────────────────────────────────────────

  .get("/:issue_id/relations/", async ({params: {slug, project_id, issue_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = {issueId: issue_id, deletedAt: null};
    return paginate({
      query: (skip, take) =>
        prisma.issueRelation.findMany({
          where,
          skip,
          take,
          include: {relatedIssue: {select: {id: true, name: true, priority: true}}},
        }),
      count: () => prisma.issueRelation.count({where}),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/:issue_id/relations/", async ({params: {slug, project_id, issue_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    if (!b.related_issue) {
      set.status = 400;
      return {detail: "related_issue is required."};
    }
    if (!b.relation_type) {
      set.status = 400;
      return {detail: "relation_type is required."};
    }
    const relation = await prisma.issueRelation.create({
      data: {issueId: issue_id, relatedIssueId: b.related_issue, workspaceId: ws.id, projectId: project_id, relationType: b.relation_type},
    });
    set.status = 201;
    return relation;
  })

  .delete("/:issue_id/relations/:relation_id/", async ({params: {relation_id}, set}) => {
    await prisma.issueRelation.update({where: {id: relation_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // ── Description versions (IssueVersion — history of description edits) ───────
  .get("/:issue_id/description-versions/", async ({params: {slug, project_id, issue_id}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const versions = await prisma.issueVersion.findMany({
      where: {issueId: issue_id},
      orderBy: {createdAt: "desc"},
      take: 50,
    });
    return versions.map((v: any) => ({
      id: v.id,
      issue: issue_id,
      workspace: ws.id,
      project: project_id,
      description: v.descriptionJson ?? null,
      description_html: v.descriptionHtml ?? "<p></p>",
      description_stripped: "",
      created_at: v.createdAt?.toISOString(),
      updated_at: v.createdAt?.toISOString(),
      owned_by: v.ownedById ?? null,
      last_saved_at: v.lastSavedAt?.toISOString() ?? v.createdAt?.toISOString(),
    }));
  })

  .get("/:issue_id/description-versions/:version_id/", async ({params: {slug, project_id, issue_id, version_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const v = await prisma.issueVersion.findFirst({where: {id: version_id, issueId: issue_id}});
    if (!v) {
      set.status = 404;
      return {detail: "Not found."};
    }
    return {
      id: v.id,
      issue: issue_id,
      workspace: ws.id,
      project: project_id,
      description: (v as any).descriptionJson ?? null,
      description_html: (v as any).descriptionHtml ?? "<p></p>",
      description_stripped: "",
      created_at: v.createdAt?.toISOString(),
      owned_by: (v as any).ownedById ?? null,
      last_saved_at: (v as any).lastSavedAt?.toISOString() ?? v.createdAt?.toISOString(),
    };
  })

  // ── History / Activity ────────────────────────────────────────────────────────
  // Handles both `activity_type=issue-property` and `activity_type=issue-comment`
  .get("/:issue_id/history/", async ({params: {slug, project_id, issue_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const activityType = (query.activity_type as string) ?? "issue-property";
    const isComment = activityType.includes("comment");

    const where: any = {issueId: issue_id, deletedAt: null};
    if (isComment) {
      // issue-comment: return comments as activity
      where.issueCommentId = {not: null};
    } else {
      // issue-property: return property-change activities
      where.issueCommentId = null;
    }

    const activities = await prisma.issueActivity.findMany({
      where,
      orderBy: {createdAt: isComment ? "desc" : "asc"},
      take: 100,
      include: {
        issue: {select: {sequenceId: true, projectId: true}},
      },
    });

    return activities.map((a: any) => ({
      id: a.id,
      issue: issue_id,
      project: a.projectId,
      workspace: a.workspaceId,
      actor: a.actorId ?? null,
      verb: a.verb,
      field: a.field ?? null,
      old_value: a.oldValue ?? null,
      new_value: a.newValue ?? null,
      comment: a.comment ?? "",
      epoch: a.epoch ?? null,
      issue_comment: a.issueCommentId ?? null,
      created_at: a.createdAt?.toISOString(),
      updated_at: a.updatedAt?.toISOString(),
      old_identifier: null,
      new_identifier: null,
      issue_detail: {id: issue_id, sequence_id: a.issue?.sequenceId ?? 0, name: ""},
    }));
  })

  // ── Sub-issues ────────────────────────────────────────────────────────────────
  .get("/:issue_id/sub-issues/", async ({params: {slug, project_id, issue_id}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const subIssues = await prisma.issue.findMany({
      where: {parentId: issue_id, deletedAt: null},
      include: ISSUE_INCLUDE,
      orderBy: {createdAt: "asc"},
    });
    return {
      count: subIssues.length,
      sub_issues: subIssues.map(serializeIssue),
      state_distribution: {},
    };
  })

  .post("/:issue_id/sub-issues/", async ({params: {slug, project_id, issue_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    const subIssueIds: string[] = b.sub_issue_ids ?? [];
    if (subIssueIds.length) {
      await prisma.issue.updateMany({
        where: {id: {in: subIssueIds}, projectId: project_id, deletedAt: null},
        data: {parentId: issue_id},
      });
    }
    set.status = 201;
    return {sub_issue_ids: subIssueIds};
  })

  // ── Issue relations (alias for /relations/ — frontend uses /issue-relation/) ──
  .get("/:issue_id/issue-relation/", async ({params: {slug, project_id, issue_id}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const relations = await prisma.issueRelation.findMany({
      where: {issueId: issue_id, deletedAt: null},
      include: {relatedIssue: {select: {id: true, name: true, priority: true, sequenceId: true}}},
    });
    return relations.map((r: any) => ({
      id: r.id,
      issue: issue_id,
      related_issue: r.relatedIssueId,
      relation_type: r.relationType,
      related_issue_detail: r.relatedIssue
        ? {id: r.relatedIssue.id, name: r.relatedIssue.name, priority: r.relatedIssue.priority, sequence_id: r.relatedIssue.sequenceId}
        : undefined,
    }));
  })

  .post("/:issue_id/issue-relation/", async ({params: {slug, project_id, issue_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    if (!b.related_issue || !b.relation_type) {
      set.status = 400;
      return {detail: "related_issue and relation_type are required."};
    }
    const relation = await prisma.issueRelation.create({
      data: {issueId: issue_id, relatedIssueId: b.related_issue, workspaceId: ws.id, projectId: project_id, relationType: b.relation_type},
    });
    set.status = 201;
    return {id: relation.id, issue: issue_id, related_issue: relation.relatedIssueId, relation_type: relation.relationType};
  })

  .delete("/:issue_id/issue-relation/:relation_id/", async ({params: {relation_id}, set}) => {
    await prisma.issueRelation.update({where: {id: relation_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  });
