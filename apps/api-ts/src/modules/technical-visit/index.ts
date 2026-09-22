import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";
import * as visitas from "@modules/technical-visit/visit.service";
import { Elysia } from "elysia";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";

// Rotas da visita técnica: leem a requisição, exigem a ação da matriz e chamam o
// service. Quem pode mexer em quê DENTRO da visita (técnico dono, quem gerencia)
// é decidido em `visit-access.ts`; ver `.claude/visitas-tecnicas.md`.

/** Escrita na visita: exige `visit.manage` e devolve o contexto para o service. */
async function requireEscrita(slug: string, userId: string) {
  const ws = await getWorkspaceOrFail(slug);
  const role = await requireWorkspaceAction(ws.id, userId, EProjectAction.VISIT_MANAGE);
  return { workspaceId: ws.id, userId, role };
}

async function requireLeitura(slug: string, userId: string) {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceMember(ws.id, userId);
  return ws;
}

/** `filename*` aceita acento; `filename` fica para navegador antigo. */
const buildContentDisposition = (nome: string) =>
  `attachment; filename="${nome.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(nome)}`;

export const technicalVisitModule = new Elysia({ prefix: "/workspaces/:slug/technical-visits" })
  .use(authPlugin)

  .get("/", async ({ params: { slug }, user, query }) => {
    const ws = await requireLeitura(slug, user.id);
    return visitas.listVisitas(ws.id, query as any);
  })

  .post("/", async ({ params: { slug }, body, user, set }) => {
    const ctx = await requireEscrita(slug, user.id);
    const visita = await visitas.createVisita(ctx, (body ?? {}) as Record<string, unknown>);
    set.status = 201;
    return visita;
  })

  // Registered before /:visit_id/ so "report" is never captured as a visit id.
  .get("/report/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const q = query as any;
    const where: any = { workspaceId: ws.id, deletedAt: null };
    if (q.status !== undefined) where.status = Number(q.status);
    if (q.entity_id) where.entityId = q.entity_id;
    if (q.date_from) where.scheduledDate = { gte: new Date(q.date_from) };
    if (q.date_to) where.scheduledDate = { ...where.scheduledDate, lte: new Date(q.date_to) };

    const [total, scheduled, completed] = await Promise.all([
      prisma.technicalVisit.count({ where }),
      prisma.technicalVisit.count({ where: { ...where, status: VISIT_STATUS.AGENDADA } }),
      prisma.technicalVisit.count({ where: { ...where, status: VISIT_STATUS.CONCLUIDA } }),
    ]);

    const [motUpdate, motBugFix, motTraining, motImprovement, motCommercial, motOther] = await Promise.all([
      prisma.technicalVisit.count({ where: { ...where, motUpdate: true } }),
      prisma.technicalVisit.count({ where: { ...where, motBugFix: true } }),
      prisma.technicalVisit.count({ where: { ...where, motTraining: true } }),
      prisma.technicalVisit.count({ where: { ...where, motImprovement: true } }),
      prisma.technicalVisit.count({ where: { ...where, motCommercial: true } }),
      prisma.technicalVisit.count({ where: { ...where, motOther: true } }),
    ]);

    const byEntity = await prisma.technicalVisit.groupBy({
      by: ["entityId"],
      where: { ...where, entityId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    });

    const byTechnician = await prisma.technicalVisit.groupBy({
      by: ["technicianId"],
      where: { ...where, technicianId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    });

    const completedVisits = await prisma.technicalVisit.findMany({
      where: { ...where, status: VISIT_STATUS.CONCLUIDA, startedAt: { not: null }, finishedAt: { not: null } },
      select: { startedAt: true, finishedAt: true },
    });

    let avgDurationHours: number | null = null;
    if (completedVisits.length > 0) {
      const totalMs = completedVisits.reduce(
        (acc: number, v: { startedAt: Date | null; finishedAt: Date | null }) =>
          acc + (v.finishedAt!.getTime() - v.startedAt!.getTime()),
        0
      );
      avgDurationHours = Math.round((totalMs / completedVisits.length / 3_600_000) * 100) / 100;
    }

    return {
      summary: { total, scheduled, completed, avg_duration_hours: avgDurationHours },
      motivations: {
        update: motUpdate,
        bug_fix: motBugFix,
        training: motTraining,
        improvement: motImprovement,
        commercial: motCommercial,
        other: motOther,
      },
      by_entity: byEntity.map((r: any) => ({ entity_id: r.entityId, count: r._count.id })),
      by_technician: byTechnician.map((r: any) => ({ technician_id: r.technicianId, count: r._count.id })),
    };
  })

  .get("/:visit_id/", async ({ params: { slug, visit_id }, user }) => {
    const ws = await requireLeitura(slug, user.id);
    return visitas.getVisita(ws.id, visit_id);
  })

  .patch("/:visit_id/", async ({ params: { slug, visit_id }, body, user }) => {
    const ctx = await requireEscrita(slug, user.id);
    return visitas.updateVisita(ctx, visit_id, (body ?? {}) as Record<string, unknown>);
  })

  .delete("/:visit_id/", async ({ params: { slug, visit_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAction(ws.id, user.id, EProjectAction.VISIT_MANAGE_ALL);
    await visitas.deleteVisita(ws.id, visit_id);
    set.status = 204;
    return null;
  })

  // ── Chamados vinculados ───────────────────────────────────────────────────────
  .post("/:visit_id/issues/", async ({ params: { slug, visit_id }, body, user, set }) => {
    const ctx = await requireEscrita(slug, user.id);
    const visita = await visitas.linkChamado(ctx, visit_id, (body as any)?.issue_id);
    set.status = 201;
    return visita;
  })

  .delete("/:visit_id/issues/:issue_id/", async ({ params: { slug, visit_id, issue_id }, user, set }) => {
    const ctx = await requireEscrita(slug, user.id);
    await visitas.unlinkChamado(ctx, visit_id, issue_id);
    set.status = 204;
    return null;
  })

  // ── Anexo do relatório ────────────────────────────────────────────────────────
  .post("/:visit_id/attachments/", async ({ params: { slug, visit_id }, body, user, set }) => {
    const ctx = await requireEscrita(slug, user.id);
    const visita = await visitas.addAnexo(ctx, visit_id, (body as any)?.file);
    set.status = 201;
    return visita;
  })

  .get(
    "/:visit_id/attachments/:attachment_id/",
    async ({ params: { slug, visit_id, attachment_id }, user, request }) => {
      const ws = await requireLeitura(slug, user.id);
      const { resposta, nome } = await visitas.readAnexo(ws.id, visit_id, attachment_id);
      // LGPD: o relatório assinado traz nome e assinatura de quem recebeu o técnico.
      void recordAudit({
        workspaceId: ws.id,
        entity: AUDIT_ENTITIES.TECHNICAL_VISIT,
        entityId: visit_id,
        action: AUDIT_ACTIONS.DOWNLOAD,
        actor: user,
        metadata: { anexo: attachment_id },
        headers: request.headers,
      });
      const headers = new Headers(resposta.headers);
      headers.set("Content-Disposition", buildContentDisposition(nome));
      headers.set("Cache-Control", "private, no-store");
      return new Response(resposta.body, { status: 200, headers });
    }
  )

  .delete(
    "/:visit_id/attachments/:attachment_id/",
    async ({ params: { slug, visit_id, attachment_id }, user, set }) => {
      const ctx = await requireEscrita(slug, user.id);
      await visitas.removeAnexo(ctx, visit_id, attachment_id);
      set.status = 204;
      return null;
    }
  );
