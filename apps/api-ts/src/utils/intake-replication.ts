// H4 — intake replication.
//
// When a work item is marked completed (Concluído) or cancelled (Cancelado),
// its comments and activities are replicated onto any intake item that was
// linked to it as a duplicate (IntakeIssue.duplicateOf === issue). This lets the
// original requester see the resolution on their intake. Cancelled behaves like
// Done. Copies are idempotent via externalSource/externalId markers.
import prisma from "@db";

const REPLICA_SOURCE = "intake_replica";

export async function replicateToLinkedIntakes(sourceIssueId: string, group: "completed" | "cancelled"): Promise<void> {
  const links = await prisma.intakeIssue.findMany({
    where: {duplicateOf: sourceIssueId, deletedAt: null},
    select: {id: true, issueId: true},
  });
  if (!links.length) return;

  const [srcComments, srcActivities] = await Promise.all([
    prisma.issueComment.findMany({where: {issueId: sourceIssueId, deletedAt: null}}),
    prisma.issueActivity.findMany({where: {issueId: sourceIssueId, deletedAt: null, issueCommentId: null}}),
  ]);

  for (const link of links) {
    const targetIssueId = link.issueId;
    if (!targetIssueId || targetIssueId === sourceIssueId) continue;

    for (const c of srcComments) {
      const exists = await prisma.issueComment.findFirst({
        where: {issueId: targetIssueId, externalSource: REPLICA_SOURCE, externalId: c.id},
        select: {id: true},
      });
      if (exists) continue;
      await prisma.issueComment.create({
        data: {
          issueId: targetIssueId,
          actorId: c.actorId,
          workspaceId: c.workspaceId,
          projectId: c.projectId,
          commentHtml: c.commentHtml,
          commentStripped: c.commentStripped,
          commentJson: c.commentJson ?? undefined,
          access: c.access,
          externalSource: REPLICA_SOURCE,
          externalId: c.id,
          createdById: c.createdById,
        },
      });
    }

    for (const a of srcActivities) {
      const exists = await prisma.issueActivity.findFirst({
        where: {issueId: targetIssueId, field: "intake_replica", oldValue: a.id},
        select: {id: true},
      });
      if (exists) continue;
      await prisma.issueActivity.create({
        data: {
          issueId: targetIssueId,
          workspaceId: a.workspaceId,
          projectId: a.projectId,
          actorId: a.actorId,
          verb: a.verb,
          field: "intake_replica",
          oldValue: a.id, // marker referencing the source activity (idempotency)
          newValue: a.field,
          comment: a.comment,
          epoch: Date.now(),
        },
      });
    }

    // Reflect resolution on the intake record: 1 = accepted (completed), -1 = declined (cancelled)
    await prisma.intakeIssue.update({where: {id: link.id}, data: {status: group === "completed" ? 1 : -1}});
  }
}
