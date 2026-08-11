import prisma from "@db";
import {prismaReal} from "@tests/helpers/prisma-real";
import {mkdirSync} from "fs";
import {tmpdir} from "os";
import path from "path";

// Raízes de storage isoladas por execução. Precisam ser definidas ANTES de
// qualquer import de @utils/storage — os módulos resolvem a raiz no topo, e um
// arquivo de teste que importasse storage primeiro fixaria a pasta media/ do
// repositório (e o resultado passaria a depender da ordem dos arquivos).
export const TEST_MEDIA_ROOT = path.join(tmpdir(), `plane-test-media-${process.pid}`);
process.env.MEDIA_ROOT ??= TEST_MEDIA_ROOT;
process.env.PLUGIN_STORAGE_ROOT ??= path.join(TEST_MEDIA_ROOT, "plugins");
process.env.WIDGET_STORAGE_ROOT ??= path.join(TEST_MEDIA_ROOT, "widgets");
mkdirSync(process.env.MEDIA_ROOT, {recursive: true});

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
    // Marketplace de widgets / plugins (globais: sem escopo de workspace, então
    // sobrevivem entre execuções e fazem o upload seguinte responder 409)
    "pluginPermissionGrant", "pluginConfig", "pluginVersion", "plugin",
    "widgetVersion", "widget",
    "customWebhookAuditLog", "customWebhook",
    // User / global tables
    "fileAsset", "apiActivityLog", "apiToken", "user",
  ];

  for (const accessor of accessors) {
    await (prismaReal() as any)[accessor].deleteMany().catch(() => {});
  }
}
