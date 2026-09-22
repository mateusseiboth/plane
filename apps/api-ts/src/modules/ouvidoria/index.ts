/**
 * Rotas da ouvidoria (tela interna). Finas: resolvem o espaço, exigem
 * `ouvidoria.read` e delegam ao service. O registro nasce pelo robô, na rota
 * interna de `@modules/interno-chat`. Ver .claude/ouvidoria-denuncia-curriculos.md.
 */
import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import { ouvidoriaDao } from "@modules/ouvidoria/ouvidoria.dao";
import { createOuvidoriaService } from "@modules/ouvidoria/ouvidoria.service";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { publishRealtime } from "@utils/realtime";
import { getWorkspaceOrFail } from "@utils/workspace";

export const ouvidoriaService = createOuvidoriaService({
  dao: ouvidoriaDao,
  publish: publishRealtime,
  now: () => new Date(),
});

async function readerWorkspace(slug: string, userId: string) {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceAction(ws.id, userId, EProjectAction.OUVIDORIA_READ);
  return ws;
}

export const ouvidoriaModule = new Elysia({ prefix: "/workspaces/:slug/ouvidoria" })
  .use(authPlugin)

  .get("/", async ({ params: { slug }, user, query }) => {
    const ws = await readerWorkspace(slug, user.id);
    return ouvidoriaService.list(ws.id, query as Record<string, unknown>);
  })

  .get("/unread-count/", async ({ params: { slug }, user }) => {
    const ws = await readerWorkspace(slug, user.id);
    return ouvidoriaService.countUnread(ws.id);
  })

  .post("/:ouvidoria_id/read/", async ({ params: { slug, ouvidoria_id }, user, headers }) => {
    const ws = await readerWorkspace(slug, user.id);
    const dto = await ouvidoriaService.markRead({ workspaceId: ws.id, userId: user.id }, ouvidoria_id);
    void recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.OUVIDORIA,
      entityId: ouvidoria_id,
      action: AUDIT_ACTIONS.UPDATE,
      actor: user,
      changes: { read_at: { de: null, para: dto.read_at } },
      headers,
    });
    return dto;
  });
