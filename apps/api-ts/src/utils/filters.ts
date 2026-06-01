// Issue filter parsing — the frontend packs work-item filters into a single
// URL-encoded JSON query param named `filters` (e.g. {"state_group__in":"backlog"}),
// and sometimes also sends loose params. Neither the project nor the workspace
// issue endpoints parsed `filters`, so filtering was silently ignored.
//
// normalizeFilters() merges both sources into a canonical map; applyIssueFilters()
// translates that map into a Prisma `where` (it needs prisma to resolve
// state groups → state ids).
import prisma from "@db";

type FilterMap = Record<string, string[]>;

// Coerce a filter value (CSV string | array | single) into a clean string[].
function toArray(v: unknown): string[] {
  if (v === undefined || v === null || v === "") return [];
  if (Array.isArray(v)) return v.flatMap((x) => toArray(x));
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Map a raw filter key (possibly Django-style with __in/__id suffix) to a canonical key.
function canonicalKey(raw: string): string | null {
  const k = raw.replace(/__(in|id)$/i, "");
  switch (k) {
    case "priority":
      return "priority";
    case "state":
    case "state_id":
      return "state";
    case "state_group":
    case "state__group":
      return "state_group";
    case "assignees":
    case "assignee":
    case "assignee_id":
      return "assignees";
    case "labels":
    case "label":
    case "label_id":
      return "labels";
    case "created_by":
    case "created_by_id":
      return "created_by";
    case "mentions":
    case "mention":
    case "mention_id":
      return "mentions";
    case "project":
    case "project_id":
      return "project";
    case "subscriber":
    case "subscriber_id":
      return "subscriber";
    case "start_date":
      return "start_date";
    case "target_date":
      return "target_date";
    default:
      return null;
  }
}

/** Merge the JSON `filters` param and loose query params into a canonical FilterMap. */
export function normalizeFilters(query: Record<string, unknown>): FilterMap {
  const out: FilterMap = {};
  const add = (rawKey: string, value: unknown) => {
    const key = canonicalKey(rawKey);
    if (!key) return;
    const vals = toArray(value);
    if (!vals.length) return;
    out[key] = [...(out[key] ?? []), ...vals];
  };

  // 1. JSON `filters` param
  if (typeof query.filters === "string" && query.filters) {
    try {
      const parsed = JSON.parse(query.filters as string);
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) add(k, v);
      }
    } catch {
      // ignore malformed filters json
    }
  }

  // 2. Loose query params (fallback / direct API callers)
  for (const [k, v] of Object.entries(query)) {
    if (k === "filters") continue;
    add(k, v);
  }

  return out;
}

/**
 * Apply a normalized FilterMap onto a Prisma `where`. Mutates and returns `where`.
 * `scope` bounds the state-group lookup to a project or workspace.
 */
export async function applyIssueFilters(
  where: any,
  filters: FilterMap,
  scope: {projectId?: string; workspaceId?: string},
): Promise<any> {
  if (filters.priority?.length) where.priority = {in: filters.priority};
  if (filters.created_by?.length) where.createdById = {in: filters.created_by};
  if (filters.project?.length) where.projectId = where.projectId ? where.projectId : {in: filters.project};
  if (filters.assignees?.length) where.assignees = {some: {assigneeId: {in: filters.assignees}, deletedAt: null}};
  if (filters.labels?.length) where.labels = {some: {labelId: {in: filters.labels}, deletedAt: null}};
  if (filters.mentions?.length) where.mentions = {some: {mentionedId: {in: filters.mentions}}};

  // state ids — combine explicit state ids and state-group resolution
  const stateIdSet = new Set<string>(filters.state ?? []);
  if (filters.state_group?.length) {
    const states = await prisma.state.findMany({
      where: {
        group: {in: filters.state_group},
        deletedAt: null,
        ...(scope.projectId ? {projectId: scope.projectId} : {}),
        ...(scope.workspaceId ? {workspaceId: scope.workspaceId} : {}),
      },
      select: {id: true},
    });
    for (const s of states) stateIdSet.add(s.id);
  }
  if (stateIdSet.size) where.stateId = {in: [...stateIdSet]};

  // date ranges: "after;before" or single date
  const applyDate = (field: string, raw: string[]) => {
    if (!raw.length) return;
    const parts = raw[0].split(";");
    if (parts.length === 2) where[field] = {gte: new Date(parts[0]), lte: new Date(parts[1])};
    else where[field] = new Date(parts[0]);
  };
  if (filters.target_date?.length) applyDate("targetDate", filters.target_date);
  if (filters.start_date?.length) applyDate("startDate", filters.start_date);

  return where;
}
