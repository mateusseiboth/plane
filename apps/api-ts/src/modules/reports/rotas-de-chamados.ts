/**
 * Rotas dos relatórios de chamados sobre os marcos por etapa.
 * Finas: checam `report.view`, leem os filtros e chamam o service de cada
 * relatório. Os relatórios antigos continuam em `index.ts`.
 *
 * GET /workspaces/:slug/reports/
 *   milestones-by-user/          analítico por usuário com os marcos (totais + amostra)
 *   milestones-by-user/:userId/  os chamados de uma pessoa, paginados
 *   returned/                    chamados devolvidos (Em Teste de volta para Em Desenvolvimento)
 *   weekly-summary/              sintético semanal responsável × sistema × tipo
 *   balance/                     balanço mensal ou anual com saldo acumulado
 *   ticket-log/                  log consolidado (atividades e comentários)
 */
import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { getWorkspaceOrFail } from "@utils/workspace";
import {
  findAnaliticoPorUsuario,
  findChamadosDoUsuario,
  readPagina,
  readPerfil,
  readPorPagina,
  readPorUsuario,
  readSituacao,
} from "@modules/reports/analitico-por-usuario/analitico-por-usuario.service";
import { findBalanco, readGranularidade } from "@modules/reports/balanco/balanco.service";
import { parseFilters, readTexto } from "@modules/reports/comum/filtros";
import { findDevolvidos } from "@modules/reports/devolvidos/devolvidos.service";
import { findLogDeChamados, readLimite } from "@modules/reports/log-chamados/log-chamados.service";
import { findSinteticoSemanal } from "@modules/reports/sintetico-semanal/sintetico-semanal.service";

/** Os filtros do analítico por usuário, iguais na listagem e na lista paginada de uma pessoa. */
const readParamsDoAnalitico = (workspaceId: string, query: Record<string, unknown>) => ({
  workspaceId,
  filtros: parseFilters(query),
  usuarioId: readTexto(query.user_id),
  perfil: readPerfil(query.perfil),
  situacao: readSituacao(query.situacao),
});

/** Espaço de trabalho + `report.view`: a porta de todo relatório. */
async function requireRelatorio(slug: string, userId: string) {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceAction(ws.id, userId, EProjectAction.REPORT_VIEW);
  return ws;
}

export const reportsDeChamadosModule = new Elysia({ prefix: "/workspaces/:slug/reports" })
  .use(authPlugin)

  .get("/milestones-by-user/", async ({ params: { slug }, user, query }) => {
    const ws = await requireRelatorio(slug, user.id);
    return findAnaliticoPorUsuario(readParamsDoAnalitico(ws.id, query), readPorUsuario(query.por_usuario));
  })

  .get("/milestones-by-user/:userId/", async ({ params: { slug, userId }, user, query }) => {
    const ws = await requireRelatorio(slug, user.id);
    return findChamadosDoUsuario(
      readParamsDoAnalitico(ws.id, query),
      userId,
      readPagina(query.page),
      readPorPagina(query.per_page)
    );
  })

  .get("/returned/", async ({ params: { slug }, user, query }) => {
    const ws = await requireRelatorio(slug, user.id);
    return findDevolvidos(ws.id, parseFilters(query));
  })

  .get("/weekly-summary/", async ({ params: { slug }, user, query }) => {
    const ws = await requireRelatorio(slug, user.id);
    return findSinteticoSemanal(ws.id, parseFilters(query));
  })

  .get("/balance/", async ({ params: { slug }, user, query }) => {
    const ws = await requireRelatorio(slug, user.id);
    return findBalanco(ws.id, parseFilters(query), readGranularidade(query.granularidade));
  })

  .get("/ticket-log/", async ({ params: { slug }, user, query }) => {
    const ws = await requireRelatorio(slug, user.id);
    return findLogDeChamados(ws.id, {
      filtros: parseFilters(query),
      etapa: readTexto(query.etapa),
      funcao: readTexto(query.funcao),
      usuarioId: readTexto(query.user_id),
      limite: readLimite(query.limit),
    });
  });
