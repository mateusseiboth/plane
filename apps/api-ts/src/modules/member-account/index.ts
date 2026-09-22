// Contas de pessoas criadas pelo admin do espaço (ação `workspace.members`).

import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import { createMemberAccount, readNewMemberInput } from "@modules/member-account/service";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { getWorkspaceOrFail } from "@utils/workspace";

export const memberAccountModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  .post("/members/create/", async ({ params: { slug }, body, user, set, headers }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAction(ws.id, user.id, EProjectAction.WORKSPACE_MEMBERS);
    const created = await createMemberAccount(ws.id, readNewMemberInput(body));
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.MEMBER,
      entityId: created.id,
      action: AUDIT_ACTIONS.CREATE,
      actor: user,
      headers,
      metadata: { role: created.role, sistemas: created.project_ids.length, criado_pelo_admin: true },
    });
    set.status = 201;
    return created;
  });
