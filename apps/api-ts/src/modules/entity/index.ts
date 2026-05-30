import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceMember, requireWorkspaceWriter } from "@utils/workspace";

export const entityModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  // Entity CRUD ───────────────────────────────────────────────────────────────

  .get("/entities/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where: any = { workspaceId: ws.id, deletedAt: null };
    if (query.is_active !== undefined) where.isActive = query.is_active === "true";
    return paginate({
      query: (skip, take) => prisma.entity.findMany({ where, skip, take, orderBy: { name: "asc" } }),
      count: () => prisma.entity.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/entities/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "Name is required." }; }
    try {
      const entity = await prisma.entity.create({
        data: {
          workspaceId: ws.id,
          name: b.name,
          entityType: b.entity_type ?? null,
          cnpj: b.cnpj ?? null,
          city: b.city ?? null,
          state: b.state ?? null,
          email: b.email ?? null,
          phone: b.phone ?? null,
          isActive: b.is_active ?? true,
          legacyId: b.legacy_id ?? null,
          externalSource: b.external_source ?? null,
          externalId: b.external_id ?? null,
          createdById: user.id,
        },
      });
      set.status = 201;
      return entity;
    } catch (e: any) {
      if (e?.code === "P2002") {
        const existing = await prisma.entity.findFirst({
          where: { workspaceId: ws.id, name: b.name, deletedAt: null },
        });
        set.status = 409;
        return { detail: "Entity with this name already exists.", id: existing?.id };
      }
      throw e;
    }
  })

  .get("/entities/:entity_id/", async ({ params: { slug, entity_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return prisma.entity.findFirstOrThrow({ where: { id: entity_id, workspaceId: ws.id, deletedAt: null } });
  })

  .patch("/entities/:entity_id/", async ({ params: { slug, entity_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.entity_type !== undefined) data.entityType = b.entity_type;
    if (b.cnpj !== undefined) data.cnpj = b.cnpj;
    if (b.city !== undefined) data.city = b.city;
    if (b.state !== undefined) data.state = b.state;
    if (b.email !== undefined) data.email = b.email;
    if (b.phone !== undefined) data.phone = b.phone;
    if (b.is_active !== undefined) data.isActive = b.is_active;
    return prisma.entity.update({ where: { id: entity_id }, data });
  })

  .delete("/entities/:entity_id/", async ({ params: { slug, entity_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    await prisma.entity.update({ where: { id: entity_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // TechnicalVisit ────────────────────────────────────────────────────────────

  .get("/technical-visits/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where: any = { workspaceId: ws.id, deletedAt: null };
    if (query.status !== undefined) where.status = Number(query.status);
    if (query.entity_id) where.entityId = query.entity_id;
    if (query.date_from) where.scheduledDate = { gte: new Date(query.date_from as string) };
    if (query.date_to) where.scheduledDate = { ...where.scheduledDate, lte: new Date(query.date_to as string) };
    return paginate({
      query: (skip, take) =>
        prisma.technicalVisit.findMany({
          where, skip, take,
          include: {
            technician: { select: { id: true, displayName: true, email: true } },
            entity: { select: { id: true, name: true } },
            visitIssues: { where: { deletedAt: null }, select: { issueId: true } },
          },
          orderBy: [{ scheduledDate: "desc" }, { createdAt: "desc" }],
        }),
      count: () => prisma.technicalVisit.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/technical-visits/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const { issue_ids = [], ...b } = body as any;
    const visit = await prisma.$transaction(async (tx) => {
      const v = await tx.technicalVisit.create({
        data: {
          workspaceId: ws.id,
          technicianId: b.technician ?? null,
          technician2Id: b.technician_2 ?? null,
          entityId: b.entity ?? null,
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
          createdById: user.id,
        },
      });
      if (issue_ids.length) {
        await tx.technicalVisitIssue.createMany({
          data: issue_ids.map((id: string) => ({ visitId: v.id, issueId: id })),
        });
      }
      return v;
    });
    set.status = 201;
    return visit;
  })

  .get("/technical-visits/report/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where: any = { workspaceId: ws.id, deletedAt: null };
    if (query.status !== undefined) where.status = Number(query.status);
    if (query.entity_id) where.entityId = query.entity_id;
    if (query.date_from) where.scheduledDate = { gte: new Date(query.date_from as string) };
    if (query.date_to) where.scheduledDate = { ...where.scheduledDate, lte: new Date(query.date_to as string) };

    const [total, scheduled, completed] = await Promise.all([
      prisma.technicalVisit.count({ where }),
      prisma.technicalVisit.count({ where: { ...where, status: 0 } }),
      prisma.technicalVisit.count({ where: { ...where, status: 1 } }),
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
      where: { ...where, status: 1, startedAt: { not: null }, finishedAt: { not: null } },
      select: { startedAt: true, finishedAt: true },
    });

    let avgDurationHours: number | null = null;
    if (completedVisits.length > 0) {
      const totalMs = completedVisits.reduce(
        (acc, v) => acc + (v.finishedAt!.getTime() - v.startedAt!.getTime()), 0
      );
      avgDurationHours = Math.round(totalMs / completedVisits.length / 3_600_000 * 100) / 100;
    }

    return {
      summary: { total, scheduled, completed, avg_duration_hours: avgDurationHours },
      motivations: { update: motUpdate, bug_fix: motBugFix, training: motTraining, improvement: motImprovement, commercial: motCommercial, other: motOther },
      by_entity: byEntity.map((r) => ({ entity_id: r.entityId, count: r._count.id })),
      by_technician: byTechnician.map((r) => ({ technician_id: r.technicianId, count: r._count.id })),
    };
  })

  .get("/technical-visits/:visit_id/", async ({ params: { slug, visit_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return prisma.technicalVisit.findFirstOrThrow({
      where: { id: visit_id, workspaceId: ws.id, deletedAt: null },
      include: {
        technician: { select: { id: true, displayName: true, email: true } },
        entity: { select: { id: true, name: true } },
        visitIssues: { where: { deletedAt: null }, select: { issueId: true } },
      },
    });
  })

  .patch("/technical-visits/:visit_id/", async ({ params: { slug, visit_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    const dateFields = new Set(["scheduledDate", "startedAt", "finishedAt"]);
    const map: Record<string, string> = {
      technician: "technicianId", technician_2: "technician2Id", entity: "entityId",
      contacts: "contacts", city: "city", scheduled_date: "scheduledDate",
      started_at: "startedAt", finished_at: "finishedAt", status: "status", period: "period",
      mot_update: "motUpdate", mot_bug_fix: "motBugFix", mot_training: "motTraining",
      mot_improvement: "motImprovement", mot_commercial: "motCommercial", mot_other: "motOther",
      mot_other_description: "motOtherDescription", summary: "summary",
      conclusion: "conclusion", visit_number: "visitNumber",
    };
    for (const [k, v] of Object.entries(map)) {
      if (b[k] !== undefined) data[v] = dateFields.has(v) && b[k] ? new Date(b[k]) : b[k];
    }
    return prisma.technicalVisit.update({ where: { id: visit_id }, data });
  })

  .delete("/technical-visits/:visit_id/", async ({ params: { slug, visit_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    await prisma.technicalVisit.update({ where: { id: visit_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  });
