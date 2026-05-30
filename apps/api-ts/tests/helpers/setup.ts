import prisma from "@db";

export async function cleanDb() {
  // Prisma accessor names (camelCase) in reverse dependency order
  const accessors = [
    // Integration leaf tables
    "gitIssueLink", "gitRepository", "gitIntegrationConfig",
    "slackProjectChannel", "slackIntegrationConfig",
    // SAC-specific
    "technicalVisitIssue", "technicalVisit", "entity",
    // Issue property tables
    "issuePropertyValue", "issuePropertyOption", "issueProperty", "issueType",
    // Issue sub-tables
    "issueTimeLog", "issueBlocker", "issueRelation", "issueLink",
    "issueAttachment", "issueActivity", "commentReaction", "issueComment",
    "issueLabel", "issueAssignee", "issueReaction", "issueVote",
    "issueSubscriber", "issueMention", "issueVersion", "draftIssue", "issue",
    // Project sub-tables
    "cycleIssue", "cycle", "cycleUserProperties",
    "moduleLink", "moduleIssue", "moduleMember", "module",
    "pageLabel", "pageVersion", "projectPage", "page",
    "estimatePoint", "estimate",
    "intakeIssue", "intake",
    "issueView", "deployBoard", "analyticView",
    "label", "state",
    "projectMemberInvite", "projectUserProperty",
    "projectMember", "importJob", "exportJob", "project",
    // Workspace sub-tables
    "auditLog", "aiProvider",
    "notification", "userNotificationPreference",
    "userFavorite", "userRecentVisit", "sticky", "workspaceUserProperties",
    "webhookLog", "webhook",
    "workspaceMemberInvite", "workspaceMember", "workspace",
    // User / global tables
    "fileAsset", "apiActivityLog", "apiToken", "user",
  ];

  for (const accessor of accessors) {
    await (prisma as any)[accessor].deleteMany().catch(() => {});
  }
}
