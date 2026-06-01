// Issue activity logging — populates the `issue_activities` table that the
// frontend history/activity feed reads from.
import prisma from "@db";

export type ActivityChange = {
  verb?: string; // created | updated | deleted (default: updated)
  field: string; // state | priority | target_date | start_date | name | assignees | labels | parent | ...
  oldValue?: string | null;
  newValue?: string | null;
  comment?: string;
};

type ActivityContext = {
  issueId: string;
  workspaceId: string;
  projectId: string;
  actorId: string;
};

/**
 * Persist a batch of activity records. No-op when there are no changes.
 * Safe to call with a fire-and-forget pattern — failures here must never
 * break the underlying mutation, so the caller may choose to await or not.
 */
export async function recordActivities(ctx: ActivityContext, changes: ActivityChange[]): Promise<void> {
  if (!changes.length) return;
  const now = Date.now();
  await prisma.issueActivity.createMany({
    data: changes.map((c) => ({
      issueId: ctx.issueId,
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
      actorId: ctx.actorId,
      verb: c.verb ?? "updated",
      field: c.field,
      oldValue: c.oldValue ?? null,
      newValue: c.newValue ?? null,
      comment: c.comment ?? "",
      epoch: now,
    })),
  });
}

/** Build a single change entry if old/new differ. Returns null when unchanged. */
export function diffChange(field: string, oldValue: any, newValue: any, comment?: string): ActivityChange | null {
  const o = oldValue === undefined || oldValue === null ? null : String(oldValue);
  const n = newValue === undefined || newValue === null ? null : String(newValue);
  if (o === n) return null;
  return {field, oldValue: o, newValue: n, comment: comment ?? `updated the ${field}`};
}
