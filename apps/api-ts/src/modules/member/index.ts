import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";

export const memberModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  .get("/members/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    const where = { workspaceId: ws.id, isActive: true, deletedAt: null };
    return paginate({
      query: (skip, take) =>
        prisma.workspaceMember.findMany({
          where, skip, take,
          include: { member: { select: { id: true, email: true, displayName: true, avatar: true } } },
        }),
      count: () => prisma.workspaceMember.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .get("/members/me/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    return prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: ws.id, memberId: user.id, deletedAt: null },
      include: { member: { select: { id: true, email: true, displayName: true, avatar: true } } },
    });
  })

  .get("/projects/:project_id/members/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { projectId: project_id, isActive: true, deletedAt: null };
    return paginate({
      query: (skip, take) =>
        prisma.projectMember.findMany({
          where, skip, take,
          include: { member: { select: { id: true, email: true, displayName: true, avatar: true } } },
        }),
      count: () => prisma.projectMember.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/projects/:project_id/members/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 20) { set.status = 403; return { detail: "Only admins can add members." }; }

    const b = body as any;
    const m = await prisma.projectMember.create({
      data: { projectId: project_id, workspaceId: ws.id, memberId: b.member_id, role: b.role ?? 5, isActive: true },
    });
    set.status = 201;
    return m;
  })

  .patch("/projects/:project_id/members/:member_id/", async ({ params: { slug, project_id, member_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 20) { set.status = 403; return { detail: "Only admins can update member roles." }; }
    return prisma.projectMember.update({ where: { id: member_id }, data: { role: (body as any).role } });
  })

  .delete("/projects/:project_id/members/:member_id/", async ({ params: { slug, project_id, member_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 20) { set.status = 403; return { detail: "Only admins can remove members." }; }
    await prisma.projectMember.update({ where: { id: member_id }, data: { deletedAt: new Date(), isActive: false } });
    set.status = 204;
    return null;
  });
