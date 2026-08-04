import Elysia from "elysia";
import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { getWorkspaceOrFail, requireWorkspaceMember, getProjectOrFail } from "@utils/workspace";

function fmtEstimate(e: any) {
  return {
    id: e.id,
    workspace: e.workspaceId,
    project: e.projectId,
    name: e.name,
    description: e.description ?? "",
    type: e.type ?? "categories",
    points: (e.points ?? []).map((p: any) => ({
      id: p.id, estimate: e.id, workspace: e.workspaceId, project: e.projectId,
      key: p.key, value: p.value, description: p.description ?? "",
      created_at: p.createdAt?.toISOString(), updated_at: p.updatedAt?.toISOString(),
    })),
    created_at: e.createdAt?.toISOString(),
    updated_at: e.updatedAt?.toISOString(),
    created_by: e.createdById ?? null,
  };
}

export const estimateModule = new Elysia()
  .use(authPlugin)

  // ── Workspace-level estimates ─────────────────────────────────────────────────
  .get("/workspaces/:slug/estimates/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const estimates = await prisma.estimate.findMany({
      where: { workspaceId: ws.id, deletedAt: null },
      include: { points: { where: { deletedAt: null }, orderBy: { key: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    return estimates.map(fmtEstimate);
  })

  // ── Project-level estimates ───────────────────────────────────────────────────
  .get("/workspaces/:slug/projects/:project_id/estimates/", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const estimates = await prisma.estimate.findMany({
      where: { workspaceId: ws.id, projectId: project_id, deletedAt: null },
      include: { points: { where: { deletedAt: null }, orderBy: { key: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    return estimates.map(fmtEstimate);
  })

  .post("/workspaces/:slug/projects/:project_id/estimates/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    const b = body as any;
    // Nome é obrigatório, como nas demais entidades — antes um POST sem nome
    // criava silenciosamente uma estimativa chamada "Estimate".
    const name = b.estimate?.name ?? b.name;
    if (!name) { set.status = 400; return { detail: "O nome é obrigatório." }; }
    const estimate = await prisma.estimate.create({
      data: {
        workspaceId: ws.id, projectId: project_id,
        name,
        description: b.estimate?.description ?? b.description ?? "",
        type: b.estimate?.type ?? b.type ?? "categories",
        createdById: user.id,
      },
    });
    // Create points if provided
    const rawPoints: any[] = b.estimate_points ?? b.points ?? [];
    if (rawPoints.length > 0) {
      await prisma.estimatePoint.createMany({
        data: rawPoints.map((p: any, idx: number) => ({
          estimateId: estimate.id, workspaceId: ws.id, projectId: project_id,
          key: p.key ?? idx, value: String(p.value ?? p.key ?? idx),
          description: p.description ?? "",
        })),
      });
    }
    const full = await prisma.estimate.findUnique({
      where: { id: estimate.id },
      include: { points: { where: { deletedAt: null }, orderBy: { key: "asc" } } },
    });
    set.status = 201;
    return fmtEstimate(full);
  })

  .get("/workspaces/:slug/projects/:project_id/estimates/:estimate_id/", async ({ params: { slug, project_id, estimate_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const estimate = await prisma.estimate.findFirst({
      where: { id: estimate_id, projectId: project_id, deletedAt: null },
      include: { points: { where: { deletedAt: null }, orderBy: { key: "asc" } } },
    });
    if (!estimate) { set.status = 404; return { detail: "Não encontrado." }; }
    return fmtEstimate(estimate);
  })

  .patch("/workspaces/:slug/projects/:project_id/estimates/:estimate_id/", async ({ params: { slug, project_id, estimate_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.description !== undefined) data.description = b.description;
    if (b.type !== undefined) data.type = b.type;
    const estimate = await prisma.estimate.update({ where: { id: estimate_id }, data });
    // Update points if provided
    if (b.estimate_points) {
      for (const p of b.estimate_points) {
        if (p.id) {
          await prisma.estimatePoint.update({ where: { id: p.id }, data: { key: p.key, value: String(p.value ?? p.key), description: p.description ?? "" } });
        } else {
          await prisma.estimatePoint.create({
            data: { estimateId: estimate_id, workspaceId: ws.id, projectId: project_id, key: p.key, value: String(p.value ?? p.key), description: p.description ?? "" },
          });
        }
      }
    }
    const full = await prisma.estimate.findUnique({
      where: { id: estimate.id },
      include: { points: { where: { deletedAt: null }, orderBy: { key: "asc" } } },
    });
    return fmtEstimate(full);
  })

  .delete("/workspaces/:slug/projects/:project_id/estimates/:estimate_id/", async ({ params: { slug, project_id, estimate_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    await prisma.estimate.update({ where: { id: estimate_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Estimate points ───────────────────────────────────────────────────────────
  .post("/workspaces/:slug/projects/:project_id/estimates/:estimate_id/estimate-points/", async ({ params: { slug, project_id, estimate_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    const b = body as any;
    const point = await prisma.estimatePoint.create({
      data: { estimateId: estimate_id, workspaceId: ws.id, projectId: project_id, key: b.key ?? 0, value: String(b.value ?? b.key ?? 0), description: b.description ?? "" },
    });
    set.status = 201;
    return { id: point.id, estimate: estimate_id, key: point.key, value: point.value, description: point.description, created_at: point.createdAt.toISOString(), updated_at: point.updatedAt.toISOString() };
  })

  .patch("/workspaces/:slug/projects/:project_id/estimates/:estimate_id/estimate-points/:point_id/", async ({ params: { slug, project_id, estimate_id, point_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    const b = body as any;
    const data: any = {};
    if (b.key !== undefined) data.key = b.key;
    if (b.value !== undefined) data.value = String(b.value);
    if (b.description !== undefined) data.description = b.description;
    const point = await prisma.estimatePoint.update({ where: { id: point_id }, data });
    return { id: point.id, estimate: estimate_id, key: point.key, value: point.value, description: point.description, created_at: point.createdAt.toISOString(), updated_at: point.updatedAt.toISOString() };
  })

  .delete("/workspaces/:slug/projects/:project_id/estimates/:estimate_id/estimate-points/:point_id/", async ({ params: { slug, project_id, estimate_id, point_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    await prisma.estimatePoint.delete({ where: { id: point_id } });
    set.status = 204;
    return null;
  });
