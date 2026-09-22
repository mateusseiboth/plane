/**
 * Rotas do mural de recados (homepage do usuário). Finas: resolvem o espaço,
 * checam a permissão e delegam ao service.
 *
 * Todo membro do espaço LÊ. Publicar, editar, inativar e ver quem leu exige
 * `mural.publish` (matriz de ações, com exceção por pessoa). Ver .claude/mural.md.
 */
import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import { muralDao } from "@modules/mural/mural.dao";
import { MuralValidationError } from "@modules/mural/mural.errors";
import { createMuralService, type MuralContext } from "@modules/mural/mural.service";
import { notifyMuralPublished } from "@utils/notifications";
import { EProjectAction, hasWorkspaceAction, requireWorkspaceAction } from "@utils/permission-checks";
import { publishRealtime } from "@utils/realtime";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";

const service = createMuralService({
  dao: muralDao,
  notify: notifyMuralPublished,
  publish: publishRealtime,
  now: () => new Date(),
});

type Set = { status?: number | string };

/** Quem lê: basta ser membro. `canPublish` só decide se o inativo aparece. */
async function readerContext(slug: string, userId: string): Promise<MuralContext> {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceMember(ws.id, userId);
  const canPublish = await hasWorkspaceAction(ws.id, userId, EProjectAction.MURAL_PUBLISH);
  return { workspaceId: ws.id, slug, userId, canPublish };
}

/** Quem publica: a ação é exigida no servidor, sempre. */
async function publisherContext(slug: string, userId: string): Promise<MuralContext> {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceAction(ws.id, userId, EProjectAction.MURAL_PUBLISH);
  return { workspaceId: ws.id, slug, userId, canPublish: true };
}

/** Erro de validação volta com `errors: [{path, message}]` para a tela marcar o campo. */
async function withFieldErrors<T>(set: Set, run: () => Promise<T>) {
  try {
    return await run();
  } catch (erro) {
    if (!(erro instanceof MuralValidationError)) throw erro;
    set.status = erro.status;
    return { detail: erro.message, errors: erro.errors };
  }
}

export const muralModule = new Elysia({ prefix: "/workspaces/:slug/mural" })
  .use(authPlugin)

  .get("/", async ({ params: { slug }, user, query }) =>
    service.list(await readerContext(slug, user.id), query as Record<string, unknown>)
  )

  .get("/home/", async ({ params: { slug }, user }) => service.home(await readerContext(slug, user.id)))

  .get("/pending-required/", async ({ params: { slug }, user }) =>
    service.pendingRequired(await readerContext(slug, user.id))
  )

  .post("/", async ({ params: { slug }, user, body, set }) => {
    const ctx = await publisherContext(slug, user.id);
    set.status = 201;
    return withFieldErrors(set, () => service.create(ctx, (body ?? {}) as Record<string, unknown>));
  })

  .get("/:recado_id/", async ({ params: { slug, recado_id }, user }) =>
    service.get(await readerContext(slug, user.id), recado_id)
  )

  .patch("/:recado_id/", async ({ params: { slug, recado_id }, user, body, set }) => {
    const ctx = await publisherContext(slug, user.id);
    return withFieldErrors(set, () => service.update(ctx, recado_id, (body ?? {}) as Record<string, unknown>));
  })

  .post("/:recado_id/read/", async ({ params: { slug, recado_id }, user, set }) => {
    await service.markRead(await readerContext(slug, user.id), recado_id);
    set.status = 204;
    return null;
  })

  .get("/:recado_id/readers/", async ({ params: { slug, recado_id }, user }) =>
    service.readers(await publisherContext(slug, user.id), recado_id)
  );
