/**
 * Rotas da denúncia interna. Qualquer membro do espaço denuncia; a lista exige
 * `denuncia.read`.
 *
 * O POST não grava auditoria, não publica evento e não avisa ninguém: numa
 * denúncia anônima qualquer registro com instante preciso ao lado do usuário
 * logado desfaria o anonimato. O teste de contrato confere que a trilha e o
 * log de API continuam vazios depois de uma denúncia.
 */
import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import { denunciaDao } from "@modules/denuncia/denuncia.dao";
import { createDenunciaService } from "@modules/denuncia/denuncia.service";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";

const service = createDenunciaService({
  dao: denunciaDao,
  now: () => new Date(),
  timeZone: process.env.TZ_PADRAO ?? "America/Campo_Grande",
});

export const denunciaModule = new Elysia({ prefix: "/workspaces/:slug/denuncias" })
  .use(authPlugin)

  .post("/", async ({ params: { slug }, user, body, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const criada = await service.create(
      { workspaceId: ws.id, userId: user.id },
      (body ?? {}) as Record<string, unknown>
    );
    set.status = 201;
    return criada;
  })

  .get("/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAction(ws.id, user.id, EProjectAction.DENUNCIA_READ);
    return service.list(ws.id, query as Record<string, unknown>);
  });
