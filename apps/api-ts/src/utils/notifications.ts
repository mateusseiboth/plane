// Notification helpers (D3).
import prisma from "@db";

/**
 * Notify all Quality-team members of a project that a new intake was opened.
 * Quality membership = legacy role level 8 OR a workflowRole keyed "qualidade".
 * The actor (creator) is never notified about their own intake.
 */
export async function notifyQualityOfIntake(opts: {
  workspaceId: string;
  projectId: string;
  issueId: string;
  actorId: string;
  issueName: string;
}): Promise<void> {
  const members = await prisma.projectMember.findMany({
    where: {projectId: opts.projectId, isActive: true, deletedAt: null},
    include: {workflowRole: {select: {key: true, level: true}}},
  });

  const receivers = members
    .filter((m) => m.memberId !== opts.actorId)
    .filter((m) => m.workflowRole?.key === "qualidade" || m.workflowRole?.level === 8 || m.role === 8)
    .map((m) => m.memberId);

  if (!receivers.length) return;

  await prisma.notification.createMany({
    data: receivers.map((receiverId) => ({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      issueId: opts.issueId,
      receiverId,
      actorId: opts.actorId,
      title: "Novo intake aberto",
      message: opts.issueName,
      entity: "intake",
      entityId: opts.issueId,
      data: {type: "intake_opened"},
      triggered: "intake",
    })),
  });
}
