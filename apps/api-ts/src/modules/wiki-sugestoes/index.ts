/**
 * Sugestões da wiki ao abrir solicitação pelo atendimento.
 *
 * `GET  /workspaces/:slug/wiki/sugestoes/?q=<texto>&project_id=<opcional>`
 *   Até 5 páginas parecidas com o problema: `{ id, name, project_id, trecho, url }`.
 * `POST /workspaces/:slug/wiki/sugestoes/resolver/` `{ texto, paginas: [ids] }`
 *   `{ sugestao }` escrita pela IA a partir das páginas, ou `{ sugestao: null, motivo }`.
 *
 * Quem pode: qualquer membro do espaço com `intake.create` (o mesmo que abre a
 * solicitação). As páginas devolvidas são só as que a pessoa enxerga.
 */
import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import { findSugestoesDaWiki, resolveSugestaoDaWiki } from "@modules/wiki-sugestoes/wiki-sugestoes.service";
import { readPedidoDeResolucao } from "@modules/wiki-sugestoes/wiki-sugestoes.rules";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { getWorkspaceOrFail } from "@utils/workspace";

const readParametro = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");

export const wikiSugestoesModule = new Elysia({ prefix: "/workspaces/:slug/wiki/sugestoes" })
  .use(authPlugin)
  .get(
    "/",
    async ({ params: { slug }, query, user }) => {
      const ws = await getWorkspaceOrFail(slug);
      await requireWorkspaceAction(ws.id, user.id, EProjectAction.INTAKE_CREATE);
      return findSugestoesDaWiki({
        espaco: ws,
        userId: user.id,
        texto: readParametro(query.q),
        projectId: readParametro(query.project_id) || null,
      });
    },
    { detail: { tags: ["Wiki"], summary: "Páginas da wiki parecidas com o problema descrito" } }
  )
  .post(
    "/resolver/",
    async ({ params: { slug }, body, user, headers }) => {
      const ws = await getWorkspaceOrFail(slug);
      await requireWorkspaceAction(ws.id, user.id, EProjectAction.INTAKE_CREATE);
      return resolveSugestaoDaWiki({ espaco: ws, user, headers, pedido: readPedidoDeResolucao(body) });
    },
    { detail: { tags: ["Wiki"], summary: "O que fazer com o problema, sugerido pela IA a partir das páginas" } }
  );
