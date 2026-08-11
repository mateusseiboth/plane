import prisma from "@db";
import {Prisma} from "@prisma/client/extension";
import {authPlugin} from "@middleware/auth";
import {entityContactDto} from "@modules/entity-contact";
import {paginate} from "@utils/pagination";
import {getWorkspaceOrFail, requireWorkspaceMember} from "@utils/workspace";
import Elysia from "elysia";

function isoDate(d: any) {
  return d ? (d instanceof Date ? d.toISOString() : String(d)) : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Substitui os responsáveis vinculados à visita pela lista recebida. O texto
 * livre `contacts` não é tocado: os dois convivem.
 */
async function sincronizarResponsaveis(
  tx: Prisma.TransactionClient,
  visitId: string,
  workspaceId: string,
  contactIds: unknown,
) {
  const ids = Array.isArray(contactIds)
    ? [...new Set(contactIds.map(normalizeUuid).filter((id): id is string => !!id))]
    : [];
  // Sem esta conferência, um id malformado vira erro de sintaxe de uuid no
  // Postgres — 500 no lugar de "pedido inválido".
  if (ids.some((id) => !UUID_RE.test(id))) throw {status: 400, message: "Responsável inválido."};

  if (!ids.length) {
    await tx.technicalVisitContact.deleteMany({where: {visitId}});
    return;
  }

  const validos = await tx.entityContact.count({where: {id: {in: ids}, workspaceId, deletedAt: null}});
  if (validos !== ids.length) throw {status: 400, message: "Responsável inválido."};

  await tx.technicalVisitContact.deleteMany({where: {visitId, contactId: {notIn: ids}}});
  await tx.technicalVisitContact.createMany({
    data: ids.map((contactId) => ({visitId, contactId, workspaceId})),
    skipDuplicates: true,
  });
}

const VISIT_STATUS = {AGENDADA: 0, EM_ANDAMENTO: 1, RELATORIO: 2, AGUARDANDO_ASSINATURA: 3, CONCLUIDA: 4, CANCELADA: 5};
const STATUS_LABELS: Record<number, string> = {
  0: "Agendada",
  1: "Em Andamento",
  2: "Relatório em Elaboração",
  3: "Aguardando Assinatura",
  4: "Concluída",
  5: "Cancelada",
};

// Include usado em toda leitura de visita: `contact_records` faz parte do
// contrato e some da resposta se a consulta não trouxer o vínculo.
const INCLUDE_VISITA = {
  entity: {select: {id: true, name: true}},
  contactRecords: {
    include: {
      contact: {
        include: {
          entity: {select: {id: true, name: true}},
          type: {select: {id: true, name: true, isSystemUser: true}},
        },
      },
    },
  },
} as const;

function serializeVisit(v: any) {
  return {
    id: v.id,
    workspace: v.workspaceId,
    technician_id: v.technicianId ?? null,
    technician2_id: v.technician2Id ?? null,
    entity_id: v.entityId ?? null,
    entity: v.entity ? {id: v.entity.id, name: v.entity.name} : null,
    // Texto livre herdado do SAC: continua valendo ao lado dos responsáveis
    // cadastrados, porque não dá para reconstituí-lo em pessoas.
    contacts: v.contacts ?? null,
    contact_records: (v.contactRecords ?? [])
      .filter((r: any) => r.contact && !r.contact.deletedAt)
      .map((r: any) => entityContactDto(r.contact)),
    city: v.city ?? null,
    scheduled_date: isoDate(v.scheduledDate),
    started_at: isoDate(v.startedAt),
    finished_at: isoDate(v.finishedAt),
    status: v.status,
    status_label: STATUS_LABELS[v.status] ?? "Desconhecido",
    period: v.period ?? null,
    mot_update: v.motUpdate,
    mot_bug_fix: v.motBugFix,
    mot_training: v.motTraining,
    mot_improvement: v.motImprovement,
    mot_commercial: v.motCommercial,
    mot_other: v.motOther,
    mot_other_description: v.motOtherDescription ?? null,
    summary: v.summary ?? null,
    conclusion: v.conclusion ?? null,
    project_ids: Array.isArray(v.projectIds) ? v.projectIds : (v.projectIds ? v.projectIds : []),
    visit_number: v.visitNumber ?? null,
    created_by: v.createdById ?? null,
    created_at: isoDate(v.createdAt),
    updated_at: isoDate(v.updatedAt),
  };
}

export const technicalVisitModule = new Elysia({prefix: "/workspaces/:slug/technical-visits"})
  .use(authPlugin)

  .get("/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const q = query as any;
    const where: any = {workspaceId: ws.id, deletedAt: null};
    if (q.status !== undefined) where.status = Number(q.status);
    if (q.technician_id) where.technicianId = q.technician_id;
    if (q.entity_id) where.entityId = q.entity_id;
    if (q.date_from) where.scheduledDate = {gte: new Date(q.date_from)};
    if (q.date_to) where.scheduledDate = {...where.scheduledDate, lte: new Date(q.date_to)};

    return paginate({
      query: (skip, take) =>
        prisma.technicalVisit.findMany({
          where, skip, take,
          include: INCLUDE_VISITA,
          orderBy: [{scheduledDate: "desc"}, {createdAt: "desc"}],
        }),
      count: () => prisma.technicalVisit.count({where}),
      cursor: q.cursor as string | undefined,
      transform: (visits) => visits.map(serializeVisit),
    });
  })

  .post("/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    // Accept both the current snake_case names and the Django-legacy aliases
    // (`technician`, `technician_2`, `entity`) still sent by older clients.
    const {issue_ids = [], contact_ids, ...b} = body as any;
    const visit = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const v = await tx.technicalVisit.create({
        data: {
          workspaceId: ws.id,
          createdById: user.id,
          technicianId: normalizeUuid(b.technician_id ?? b.technician) ?? user.id,
          technician2Id: normalizeUuid(b.technician2_id ?? b.technician_2),
          entityId: normalizeUuid(b.entity_id ?? b.entity),
          contacts: b.contacts ?? null,
          city: b.city ?? null,
          scheduledDate: b.scheduled_date ? new Date(b.scheduled_date) : null,
          startedAt: b.started_at ? new Date(b.started_at) : null,
          finishedAt: b.finished_at ? new Date(b.finished_at) : null,
          status: b.status ?? 0,
          period: b.period ?? null,
          motUpdate: b.mot_update ?? false,
          motBugFix: b.mot_bug_fix ?? false,
          motTraining: b.mot_training ?? false,
          motImprovement: b.mot_improvement ?? false,
          motCommercial: b.mot_commercial ?? false,
          motOther: b.mot_other ?? false,
          motOtherDescription: b.mot_other_description ?? null,
          summary: b.summary ?? null,
          conclusion: b.conclusion ?? null,
          visitNumber: b.visit_number ?? null,
          legacyId: b.legacy_id ?? null,
        },
        include: INCLUDE_VISITA,
      });
      if (issue_ids.length) {
        await tx.technicalVisitIssue.createMany({
          data: issue_ids.map((id: string) => ({visitId: v.id, issueId: id})),
        });
      }
      if (contact_ids === undefined) return v;
      await sincronizarResponsaveis(tx, v.id, ws.id, contact_ids);
      return tx.technicalVisit.findUniqueOrThrow({where: {id: v.id}, include: INCLUDE_VISITA});
    });
    set.status = 201;
    return serializeVisit(visit);
  })

  // Registered before /:visit_id/ so "report" is never captured as a visit id.
  .get("/report/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const q = query as any;
    const where: any = {workspaceId: ws.id, deletedAt: null};
    if (q.status !== undefined) where.status = Number(q.status);
    if (q.entity_id) where.entityId = q.entity_id;
    if (q.date_from) where.scheduledDate = {gte: new Date(q.date_from)};
    if (q.date_to) where.scheduledDate = {...where.scheduledDate, lte: new Date(q.date_to)};

    const [total, scheduled, completed] = await Promise.all([
      prisma.technicalVisit.count({where}),
      prisma.technicalVisit.count({where: {...where, status: 0}}),
      prisma.technicalVisit.count({where: {...where, status: 1}}),
    ]);

    const [motUpdate, motBugFix, motTraining, motImprovement, motCommercial, motOther] = await Promise.all([
      prisma.technicalVisit.count({where: {...where, motUpdate: true}}),
      prisma.technicalVisit.count({where: {...where, motBugFix: true}}),
      prisma.technicalVisit.count({where: {...where, motTraining: true}}),
      prisma.technicalVisit.count({where: {...where, motImprovement: true}}),
      prisma.technicalVisit.count({where: {...where, motCommercial: true}}),
      prisma.technicalVisit.count({where: {...where, motOther: true}}),
    ]);

    const byEntity = await prisma.technicalVisit.groupBy({
      by: ["entityId"],
      where: {...where, entityId: {not: null}},
      _count: {id: true},
      orderBy: {_count: {id: "desc"}},
      take: 20,
    });

    const byTechnician = await prisma.technicalVisit.groupBy({
      by: ["technicianId"],
      where: {...where, technicianId: {not: null}},
      _count: {id: true},
      orderBy: {_count: {id: "desc"}},
      take: 20,
    });

    const completedVisits = await prisma.technicalVisit.findMany({
      where: {...where, status: 1, startedAt: {not: null}, finishedAt: {not: null}},
      select: {startedAt: true, finishedAt: true},
    });

    let avgDurationHours: number | null = null;
    if (completedVisits.length > 0) {
      const totalMs = completedVisits.reduce(
        (acc: number, v: {startedAt: Date | null; finishedAt: Date | null}) =>
          acc + (v.finishedAt!.getTime() - v.startedAt!.getTime()),
        0,
      );
      avgDurationHours = Math.round(totalMs / completedVisits.length / 3_600_000 * 100) / 100;
    }

    return {
      summary: {total, scheduled, completed, avg_duration_hours: avgDurationHours},
      motivations: {update: motUpdate, bug_fix: motBugFix, training: motTraining, improvement: motImprovement, commercial: motCommercial, other: motOther},
      by_entity: byEntity.map((r: any) => ({entity_id: r.entityId, count: r._count.id})),
      by_technician: byTechnician.map((r: any) => ({technician_id: r.technicianId, count: r._count.id})),
    };
  })

  .get("/:visit_id/", async ({params: {slug, visit_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const visit = await prisma.technicalVisit.findFirst({
      where: {id: visit_id, workspaceId: ws.id, deletedAt: null},
      include: INCLUDE_VISITA,
    });
    if (!visit) {
      set.status = 404;
      return {detail: "Não encontrado."};
    }
    return serializeVisit(visit);
  })

  .patch("/:visit_id/", async ({params: {slug, visit_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.status !== undefined) {
      data.status = b.status;
      if (b.status === VISIT_STATUS.EM_ANDAMENTO && !b.started_at) data.startedAt = new Date();
      if (b.status === VISIT_STATUS.CONCLUIDA && !b.finished_at) data.finishedAt = new Date();
    }
    if (b.technician_id !== undefined) data.technicianId = normalizeUuid(b.technician_id);
    if (b.technician2_id !== undefined) data.technician2Id = normalizeUuid(b.technician2_id);
    if (b.entity_id !== undefined) data.entityId = normalizeUuid(b.entity_id);
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
    if (b.project_ids !== undefined) data.projectIds = b.project_ids;

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.technicalVisit.update({where: {id: visit_id}, data});
      if (b.contact_ids !== undefined) await sincronizarResponsaveis(tx, visit_id, ws.id, b.contact_ids);
      return tx.technicalVisit.findUniqueOrThrow({where: {id: visit_id}, include: INCLUDE_VISITA});
    });
    return serializeVisit(updated);
  })

  .delete("/:visit_id/", async ({params: {slug, visit_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.technicalVisit.update({where: {id: visit_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // ── Link a work item to a visit ───────────────────────────────────────────────
  .post("/:visit_id/issues/", async ({params: {slug, visit_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    try {
      const link = await prisma.technicalVisitIssue.create({
        data: {visitId: visit_id, issueId: b.issue_id},
      });
      set.status = 201;
      return {id: link.id, visit_id: link.visitId, issue_id: link.issueId};
    } catch {
      set.status = 409;
      return {detail: "Work item já vinculado a esta visita."};
    }
  })

  .delete("/:visit_id/issues/:issue_id/", async ({params: {slug, visit_id, issue_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const link = await prisma.technicalVisitIssue.findFirst({
      where: {visitId: visit_id, issueId: issue_id, deletedAt: null},
    });
    if (!link) {
      set.status = 404;
      return {detail: "Não encontrado."};
    }
    await prisma.technicalVisitIssue.update({where: {id: link.id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  });
