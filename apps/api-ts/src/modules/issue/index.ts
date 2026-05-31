import prisma from "@db";
import {authPlugin} from "@middleware/auth";
import {Prisma} from "@prisma/client/extension";
import {paginate} from "@utils/pagination";
import {ISSUE_INCLUDE, serializeIssue} from "@utils/serialize";
import {getProjectOrFail, getWorkspaceOrFail} from "@utils/workspace";
import Elysia from "elysia";

// Role values — mirrors EUserProjectRoles in packages/types
// MEMBER was 15 in original Plane but we use 10 to match our custom roles
const ROLES = {ADMIN: 20, GESTOR_PROJETO: 18, MEMBER: 10, TI: 12, QUALIDADE: 8, ATENDIMENTO: 6, GUEST: 5};

/**
 * Mirrors the frontend canTransitionState() from packages/constants/src/project-permissions.ts.
 * Keep both in sync when updating workflow rules.
 */
function stateTransitionAllowed(role: number, fromGroup: string, toGroup: string): boolean {
  // ADMIN and GESTOR_PROJETO: unrestricted moves
  if (role === ROLES.ADMIN || role === ROLES.GESTOR_PROJETO) return true;

  // MEMBER: full workflow access
  if (role === ROLES.MEMBER) {
    if (toGroup === "cancelled") return true;
    if (fromGroup === "triage") return toGroup === "triage" || toGroup === "unstarted";
    return true; // members can move anywhere else
  }

  // ATENDIMENTO: can only keep item in triage (no state moves)
  if (role === ROLES.ATENDIMENTO) return toGroup === "triage";

  // GUEST: no moves
  if (role === ROLES.GUEST) return false;

  // TI: cannot pick up from triage; handles todo→started→completed
  if (role === ROLES.TI) {
    if (fromGroup === "triage") return false;
    if (toGroup === "cancelled") return true;
    if (fromGroup === "unstarted" && toGroup === "started") return true;  // A Fazer → Em Andamento
    if (fromGroup === "started" && toGroup === "started") return true;    // Em Andamento → Em Teste
    if (fromGroup === "started" && toGroup === "completed") return true;  // Em Teste → Concluído
    if (["backlog","unstarted"].includes(fromGroup) && ["backlog","unstarted"].includes(toGroup)) return true;
    return false;
  }

  // QUALIDADE: intake review + return with error
  if (role === ROLES.QUALIDADE) {
    if (toGroup === "cancelled") return true;
    if (fromGroup === "triage") return toGroup === "unstarted" || toGroup === "triage";
    if (fromGroup === "unstarted" && toGroup === "unstarted") return true; // Avaliando → A Fazer
    if (fromGroup === "started" && toGroup === "started") return true;     // devolução
    return false;
  }

  return false;
}

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
    if (!issue) { set.status = 404; return {detail: "Issue not found."}; }
    return {project_identifier: issue.project?.identifier ?? "", sequence_id: String(issue.sequenceId)};
  })

  .get("/", async ({params: {slug, project_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    // Build base where clause
    const where: any = {projectId: project_id, deletedAt: null, isDraft: false};

    // Standard filters
    if (query.state_id) where.stateId = {in: (query.state_id as string).split(",")};
    if (query.priority) where.priority = {in: (query.priority as string).split(",")};
    if (query.entity_id) where.entityId = query.entity_id;
    if (query.legacy_ticket_number) where.legacyTicketNumber = query.legacy_ticket_number;
    if (query.assignees__id) where.assignees = {some: {assigneeId: {in: (query.assignees__id as string).split(",")}, deletedAt: null}};
    if (query.assignees) where.assignees = {some: {assigneeId: {in: (query.assignees as string).split(",")}, deletedAt: null}};
    if (query.labels__id) where.labels = {some: {labelId: {in: (query.labels__id as string).split(",")}, deletedAt: null}};
    if (query.created_by) where.createdById = {in: (query.created_by as string).split(",")};
    if (query.mention__id) where.mentions = {some: {mentionedId: {in: (query.mention__id as string).split(",")}}};

    // Group-by filters: when the kanban/grouped view passes a specific value to scope to a group
    if (query.state_id)
      where.stateId = (query.state_id as string).includes(",") ? {in: (query.state_id as string).split(",")} : query.state_id;

    // State group filter
    if (query.state__group) {
      const stateGroups = (query.state__group as string).split(",");
      const matchingStates = await prisma.state.findMany({
        where: {projectId: project_id, group: {in: stateGroups}, deletedAt: null},
        select: {id: true},
      });
      where.stateId = {in: matchingStates.map((s: any) => s.id)};
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

    set.status = 201;
    return serializeIssue(issue);
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
    const data: any = {updatedBy: {connect: {id: user.id}}};
    if (b.name !== undefined) data.name = b.name;
    if (b.description_html !== undefined) {
      data.descriptionHtml = b.description_html;
      data.descriptionStripped = b.description_html.replace(/<[^>]+>/g, "");
    }
    // Accept both `state` (Django legacy) and `state_id` (frontend ISSUE_FILTER_DEFAULT_DATA)
    const newStateId = b.state ?? b.state_id;
    if (newStateId !== undefined) {
      // Validate state transition based on role
      const currentIssue = await prisma.issue.findFirst({where: {id: issue_id}, include: {state: {select: {group: true}}}});
      const targetState = await prisma.state.findFirst({where: {id: newStateId}, select: {group: true}});
      if (currentIssue && targetState) {
        const fromGroup = currentIssue.state?.group ?? "backlog";
        const toGroup = targetState.group;
        const allowed = stateTransitionAllowed(member.role, fromGroup, toGroup);
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
    if (b.entity_id !== undefined) data.entityId = b.entity_id;
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
          include: {actor: {select: {id: true, displayName: true, email: true}}},
          orderBy: {createdAt: "asc"},
        }),
      count: () => prisma.issueComment.count({where}),
      cursor: query.cursor as string | undefined,
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
    });
    set.status = 201;
    return comment;
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
    return prisma.issueComment.update({where: {id: comment_id}, data});
  })

  // Comment version history
  .get("/:issue_id/comments/:comment_id/versions/", async ({params: {comment_id}, user}) => {
    const versions = await prisma.issueCommentVersion.findMany({
      where: {commentId: comment_id},
      orderBy: {createdAt: "desc"},
      take: 20,
    });
    return versions.map((v: any) => ({
      id: v.id, comment_id: v.commentId, comment_html: v.commentHtml,
      edited_by: v.editedById, created_at: v.createdAt?.toISOString(),
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
      id: r.id, issue: issue_id, related_issue: r.relatedIssueId,
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
    if (!b.related_issue || !b.relation_type) { set.status = 400; return {detail: "related_issue and relation_type are required."}; }
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
