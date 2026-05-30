// Shared serialization helpers — converts Prisma camelCase to frontend snake_case

export function isoDate(d: any): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

export function dateOnly(d: any): string | null {
  const s = isoDate(d);
  return s ? s.split("T")[0] : null;
}

export const ISSUE_INCLUDE = {
  state: { select: { id: true, name: true, color: true, group: true } },
  assignees: { where: { deletedAt: null }, select: { assigneeId: true } },
  labels:    { where: { deletedAt: null }, select: { labelId: true } },
  entity:    { select: { id: true, name: true, entityType: true } },
} as const;

export function serializeIssue(issue: any): Record<string, unknown> {
  return {
    id:               issue.id,
    sequence_id:      issue.sequenceId ?? 0,
    name:             issue.name,
    sort_order:       issue.sortOrder ?? 65535,

    state_id:         issue.stateId ?? null,
    priority:         issue.priority ?? "none",
    label_ids:        issue.labels?.map((l: any) => l.labelId) ?? [],
    assignee_ids:     issue.assignees?.map((a: any) => a.assigneeId) ?? [],
    estimate_point:   null,

    sub_issues_count: 0,
    attachment_count: 0,
    link_count:       0,

    project_id:       issue.projectId ?? null,
    workspace_id:     issue.workspaceId ?? null,
    parent_id:        issue.parentId ?? null,
    cycle_id:         null,
    module_ids:       [],
    type_id:          null,

    created_at:       isoDate(issue.createdAt),
    updated_at:       isoDate(issue.updatedAt),
    start_date:       dateOnly(issue.startDate),
    target_date:      dateOnly(issue.targetDate),
    completed_at:     isoDate(issue.completedAt),
    archived_at:      isoDate(issue.archivedAt),

    created_by:       issue.createdById ?? null,
    updated_by:       issue.updatedById ?? null,

    is_draft:         issue.isDraft ?? false,
    is_epic:          false,
    is_intake:        false,

    description_html:     issue.descriptionHtml ?? "<p></p>",
    description_stripped: issue.descriptionStripped ?? "",
    description:          issue.descriptionJson ?? null,

    state__group: issue.state?.group ?? null,
    state__color: issue.state?.color ?? null,
    state__name:  issue.state?.name ?? null,

    entity_id: issue.entityId ?? null,
    entity:    issue.entity
      ? { id: issue.entity.id, name: issue.entity.name, entity_type: issue.entity.entityType }
      : null,

    legacy_ticket_number: issue.legacyTicketNumber ?? null,
  };
}

export function serializeModule(mod: any): Record<string, unknown> {
  const totalIssues = mod._count?.moduleIssues ?? 0;
  return {
    id:           mod.id,
    name:         mod.name,
    description:  mod.description ?? "",
    description_html: null,
    description_text: null,

    workspace_id: mod.workspaceId,
    project_id:   mod.projectId,
    lead_id:      mod.leadId ?? null,
    member_ids:   mod.members?.map((m: any) => m.memberId) ?? [],

    status:      mod.status ?? "backlog",
    archived_at: isoDate(mod.archivedAt),
    start_date:  dateOnly(mod.startDate),
    target_date: dateOnly(mod.targetDate),

    created_at:  isoDate(mod.createdAt),
    updated_at:  isoDate(mod.updatedAt),
    created_by:  mod.createdById ?? null,
    updated_by:  mod.updatedById ?? null,

    is_favorite: false,
    sort_order:  mod.sortOrder ?? 65535,

    view_props: { filters: {} },
    link_module: mod.links?.map((l: any) => ({
      id: l.id, url: l.url, title: l.title,
      created_at: isoDate(l.createdAt),
    })) ?? [],

    total_issues:     totalIssues,
    completed_issues: mod.completedIssues ?? 0,
    backlog_issues:   mod.backlogIssues ?? 0,
    started_issues:   mod.startedIssues ?? 0,
    unstarted_issues: mod.unstartedIssues ?? 0,
    cancelled_issues: mod.cancelledIssues ?? 0,

    backlog_estimate_points:   0,
    started_estimate_points:   0,
    unstarted_estimate_points: 0,
    cancelled_estimate_points: 0,
    total_estimate_points:     0,
    completed_estimate_points: 0,
  };
}
