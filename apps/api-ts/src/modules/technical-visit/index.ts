import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";

function isoDate(d: any) { return d ? (d instanceof Date ? d.toISOString() : String(d)) : null; }

const VISIT_STATUS = { AGENDADA: 0, EM_ANDAMENTO: 1, RELATORIO: 2, AGUARDANDO_ASSINATURA: 3, CONCLUIDA: 4, CANCELADA: 5 };
const STATUS_LABELS: Record<number, string> = {
  0: "Agendada", 1: "Em Andamento", 2: "Relatório em Elaboração",
  3: "Aguardando Assinatura", 4: "Concluída", 5: "Cancelada",
};

function serializeVisit(v: any) {
  return {
    id: v.id,
    workspace: v.workspaceId,
    technician_id: v.technicianId ?? null,
    technician2_id: v.technician2Id ?? null,
    entity_id: v.entityId ?? null,
    entity: v.entity ? { id: v.entity.id, name: v.entity.name } : null,
    contacts: v.contacts ?? null,
    city: v.city ?? null,
    scheduled_date: isoDate(v.scheduledDate),
    started_at: isoDate(v.startedAt),
    finished_at: isoDate(v.finishedAt),
    status: v.status,
    status_label: STATUS_LABELS[v.status] ?? "Desconhecido",
    period: v.period ?? null,
    mot_update: v.motUpdate, mot_bug_fix: v.motBugFix, mot_training: v.motTraining,
    mot_improvement: v.motImprovement, mot_commercial: v.motCommercial,
    mot_other: v.motOther, mot_other_description: v.motOtherDescription ?? null,
    summary: v.summary ?? null,
    conclusion: v.conclusion ?? null,
    visit_number: v.visitNumber ?? null,
    created_by: v.createdById ?? null,
    created_at: isoDate(v.createdAt),
    updated_at: isoDate(v.updatedAt),
  };
}

export const technicalVisitModule = new Elysia({ prefix: "/workspaces/:slug/technical-visits" })
  .use(authPlugin)

  .get("/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where: any = { workspaceId: ws.id, deletedAt: null };
    if ((query as any).status !== undefined) where.status = Number((query as any).status);
    if ((query as any).technician_id) where.technicianId = (query as any).technician_id;
    if ((query as any).entity_id) where.entityId = (query as any).entity_id;

    const visits = await prisma.technicalVisit.findMany({
      where,
      include: { entity: { select: { id: true, name: true } } },
      orderBy: { scheduledDate: "desc" },
      take: 100,
    });
    return { results: visits.map(serializeVisit), total_count: visits.length };
  })

  .post("/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const visit = await prisma.technicalVisit.create({
      data: {
        workspaceId: ws.id, createdById: user.id,
        technicianId: b.technician_id ?? user.id,
        technician2Id: b.technician2_id ?? null,
        entityId: b.entity_id ?? null,
        contacts: b.contacts ?? null,
        city: b.city ?? null,
        scheduledDate: b.scheduled_date ? new Date(b.scheduled_date) : null,
        status: b.status ?? 0,
        period: b.period ?? null,
        motUpdate: b.mot_update ?? false, motBugFix: b.mot_bug_fix ?? false,
        motTraining: b.mot_training ?? false, motImprovement: b.mot_improvement ?? false,
        motCommercial: b.mot_commercial ?? false, motOther: b.mot_other ?? false,
        motOtherDescription: b.mot_other_description ?? null,
        summary: b.summary ?? null,
        conclusion: b.conclusion ?? null,
      },
      include: { entity: { select: { id: true, name: true } } },
    });
    set.status = 201;
    return serializeVisit(visit);
  })

  .get("/:visit_id/", async ({ params: { slug, visit_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const visit = await prisma.technicalVisit.findFirst({
      where: { id: visit_id, workspaceId: ws.id, deletedAt: null },
      include: { entity: { select: { id: true, name: true } } },
    });
    if (!visit) { set.status = 404; return { detail: "Not found." }; }
    return serializeVisit(visit);
  })

  .patch("/:visit_id/", async ({ params: { slug, visit_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.status !== undefined) {
      data.status = b.status;
      if (b.status === VISIT_STATUS.EM_ANDAMENTO && !b.started_at) data.startedAt = new Date();
      if (b.status === VISIT_STATUS.CONCLUIDA && !b.finished_at) data.finishedAt = new Date();
    }
    if (b.technician_id !== undefined) data.technicianId = b.technician_id;
    if (b.technician2_id !== undefined) data.technician2Id = b.technician2_id;
    if (b.entity_id !== undefined) data.entityId = b.entity_id;
    if (b.contacts !== undefined) data.contacts = b.contacts;
    if (b.city !== undefined) data.city = b.city;
    if (b.scheduled_date !== undefined) data.scheduledDate = b.scheduled_date ? new Date(b.scheduled_date) : null;
    if (b.started_at !== undefined) data.startedAt = b.started_at ? new Date(b.started_at) : null;
    if (b.finished_at !== undefined) data.finishedAt = b.finished_at ? new Date(b.finished_at) : null;
    if (b.period !== undefined) data.period = b.period;
    if (b.summary !== undefined) data.summary = b.summary;
    if (b.conclusion !== undefined) data.conclusion = b.conclusion;
    if (b.mot_update !== undefined) data.motUpdate = b.mot_update;
    if (b.mot_bug_fix !== undefined) data.motBugFix = b.mot_bug_fix;
    if (b.mot_training !== undefined) data.motTraining = b.mot_training;
    if (b.mot_improvement !== undefined) data.motImprovement = b.mot_improvement;
    if (b.mot_commercial !== undefined) data.motCommercial = b.mot_commercial;
    if (b.mot_other !== undefined) data.motOther = b.mot_other;
    if (b.mot_other_description !== undefined) data.motOtherDescription = b.mot_other_description;

    const updated = await prisma.technicalVisit.update({
      where: { id: visit_id },
      data,
      include: { entity: { select: { id: true, name: true } } },
    });
    return serializeVisit(updated);
  })

  .delete("/:visit_id/", async ({ params: { slug, visit_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.technicalVisit.update({ where: { id: visit_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Link a work item to a visit ───────────────────────────────────────────────
  .post("/:visit_id/issues/", async ({ params: { slug, visit_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    try {
      const link = await prisma.technicalVisitIssue.create({
        data: { visitId: visit_id, issueId: b.issue_id },
      });
      set.status = 201;
      return { id: link.id, visit_id: link.visitId, issue_id: link.issueId };
    } catch {
      set.status = 409;
      return { detail: "Work item já vinculado a esta visita." };
    }
  })

  .delete("/:visit_id/issues/:issue_id/", async ({ params: { visit_id, issue_id }, set }) => {
    const link = await prisma.technicalVisitIssue.findFirst({
      where: { visitId: visit_id, issueId: issue_id, deletedAt: null },
    });
    if (!link) { set.status = 404; return { detail: "Not found." }; }
    await prisma.technicalVisitIssue.update({ where: { id: link.id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  });
