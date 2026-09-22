/**
 * Rotas do pós-atendimento. Finas: resolvem o espaço, exigem a ação da matriz e
 * delegam ao service. Ver `.claude/pos-atendimento.md`.
 *
 * - fila: `posatendimento.record` OU `posatendimento.verify`;
 * - registrar: `posatendimento.record`; verificar: `posatendimento.verify`;
 * - painel do detalhe: qualquer membro que enxergue o chamado ou a visita;
 * - relatório de satisfação: `report.view`.
 *
 * Os chamados são sempre recortados pelos sistemas de que a pessoa participa.
 */
import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import { POS_ORIGEM, type PosOrigem } from "@modules/pos-atendimento/pos-atendimento.codes";
import { posAtendimentoDao } from "@modules/pos-atendimento/pos-atendimento.dao";
import { createPosAtendimentoService, type PosContext } from "@modules/pos-atendimento/pos-atendimento.service";
import {
  EProjectAction,
  requireWorkspaceAction,
  requireWorkspaceAnyAction,
  roleCan,
  type EffectiveRole,
} from "@utils/permission-checks";
import { findMemberProjectIds, getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";

const service = createPosAtendimentoService({ dao: posAtendimentoDao, now: () => new Date() });

type Body = Record<string, unknown>;

const QUEM_USA_A_FILA = [EProjectAction.POSATENDIMENTO_RECORD, EProjectAction.POSATENDIMENTO_VERIFY];

/** Monta o contexto depois que a guarda passou: `guard` devolve a função efetiva (ou null, só membro). */
async function buildContext(
  slug: string,
  userId: string,
  guard: (workspaceId: string) => Promise<EffectiveRole | null>
): Promise<PosContext> {
  const ws = await getWorkspaceOrFail(slug);
  const role = await guard(ws.id);
  return {
    workspaceId: ws.id,
    userId,
    canVerify: !!role && roleCan(role, EProjectAction.POSATENDIMENTO_VERIFY),
    projectIds: await findMemberProjectIds(ws.id, userId),
  };
}

const filaContext = (slug: string, userId: string) =>
  buildContext(slug, userId, (wsId) => requireWorkspaceAnyAction(wsId, userId, QUEM_USA_A_FILA));

const recordContext = (slug: string, userId: string) =>
  buildContext(slug, userId, (wsId) => requireWorkspaceAction(wsId, userId, EProjectAction.POSATENDIMENTO_RECORD));

const verifyContext = (slug: string, userId: string) =>
  buildContext(slug, userId, (wsId) => requireWorkspaceAction(wsId, userId, EProjectAction.POSATENDIMENTO_VERIFY));

const reportContext = (slug: string, userId: string) =>
  buildContext(slug, userId, (wsId) => requireWorkspaceAction(wsId, userId, EProjectAction.REPORT_VIEW));

const memberContext = (slug: string, userId: string) =>
  buildContext(slug, userId, async (wsId) => {
    await requireWorkspaceMember(wsId, userId);
    return null;
  });

/** Registrar devolve 201 com o pós gravado. */
async function recordPos(
  set: { status?: number | string },
  slug: string,
  userId: string,
  origem: PosOrigem,
  alvoId: string,
  body: unknown
) {
  const pos = await service.record(await recordContext(slug, userId), origem, alvoId, (body ?? {}) as Body);
  set.status = 201;
  return pos;
}

export const posAtendimentoModule = new Elysia({ prefix: "/workspaces/:slug/pos-atendimento" })
  .use(authPlugin)

  .get("/", async ({ params: { slug }, user, query }) => service.list(await filaContext(slug, user.id), query as Body))

  .get("/issues/:issue_id/", async ({ params: { slug, issue_id }, user }) =>
    service.getByAlvo(await memberContext(slug, user.id), POS_ORIGEM.CHAMADO, issue_id)
  )

  .post("/issues/:issue_id/", ({ params: { slug, issue_id }, user, body, set }) =>
    recordPos(set, slug, user.id, POS_ORIGEM.CHAMADO, issue_id, body)
  )

  .get("/visits/:visit_id/", async ({ params: { slug, visit_id }, user }) =>
    service.getByAlvo(await memberContext(slug, user.id), POS_ORIGEM.VISITA, visit_id)
  )

  .post("/visits/:visit_id/", ({ params: { slug, visit_id }, user, body, set }) =>
    recordPos(set, slug, user.id, POS_ORIGEM.VISITA, visit_id, body)
  )

  .post("/:pos_id/verify/", async ({ params: { slug, pos_id }, user, body }) =>
    service.verify(await verifyContext(slug, user.id), pos_id, (body ?? {}) as Body)
  )

  .get("/report/", async ({ params: { slug }, user, query }) =>
    service.report(await reportContext(slug, user.id), query as Body)
  )

  .get("/report/items/", async ({ params: { slug }, user, query }) =>
    service.reportItems(await reportContext(slug, user.id), query as Body)
  );
