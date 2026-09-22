/**
 * Página "Links úteis": os endereços que a equipe passa para cliente, candidato
 * e TV, reunidos num lugar só. Leitura para todo membro do espaço; o que muda
 * por pessoa é quanto ela vê (integrações e god mode).
 */
import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import { readLinksUteis } from "@modules/links-uteis/links-uteis.service";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";

export const linksUteisModule = new Elysia({ prefix: "/workspaces/:slug/links-uteis" })
  .use(authPlugin)
  .get("/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return { grupos: await readLinksUteis(ws, user) };
  });
