/**
 * notifyQualityOfIntake (D3) — quem abre o intake nunca é notificado do próprio
 * intake; o time de Qualidade é identificado pelo papel (workflowRole "qualidade",
 * level 8 ou o Int legado 8).
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {addMember, createIssue, createProject, createUser, createWorkspace} from "@tests/helpers/factory";
import {notifyQualityOfIntake} from "@utils/notifications";
import {seedWorkflowRoles} from "@utils/permissions";

describe("notifyQualityOfIntake", () => {
  let workspaceId: string;
  let projectId: string;
  let actorId: string;
  let qualidadeId: string;
  let tiId: string;
  let qualidadeAutorId: string;

  beforeAll(async () => {
    await cleanDb();
    const actor = await createUser();
    actorId = actor.id;
    const ws = await createWorkspace(actor.id);
    workspaceId = ws.id;
    projectId = (await createProject(ws.id, actor.id)).id;

    const qualidade = await createUser();
    qualidadeId = qualidade.id;
    await addMember(workspaceId, qualidade.id, 8, projectId, 8);

    const ti = await createUser();
    tiId = ti.id;
    await addMember(workspaceId, ti.id, 12, projectId, 12);

    // Um membro da Qualidade que também é quem abre o intake — não pode receber.
    const autor = await createUser();
    qualidadeAutorId = autor.id;
    await addMember(workspaceId, autor.id, 8, projectId, 8);

    await seedWorkflowRoles(prisma, workspaceId);
  });

  afterAll(() => cleanDb());

  it("notifica somente a Qualidade, nunca o autor nem os demais papéis", async () => {
    const issue = await createIssue(projectId, workspaceId, {name: "Chamado do intake"});
    await notifyQualityOfIntake({
      workspaceId,
      projectId,
      issueId: issue.id,
      actorId: qualidadeAutorId,
      issueName: issue.name,
    });

    const receivers = (await prisma.notification.findMany({where: {issueId: issue.id}})).map((n) => n.receiverId);
    expect(receivers).toContain(qualidadeId);
    expect(receivers).not.toContain(qualidadeAutorId);
    expect(receivers).not.toContain(tiId);
    expect(receivers).not.toContain(actorId);
  });

  it("preenche o payload lido pelo sino de notificações", async () => {
    const issue = await createIssue(projectId, workspaceId, {name: "Impressora parada"});
    await notifyQualityOfIntake({workspaceId, projectId, issueId: issue.id, actorId, issueName: issue.name});
    const n = await prisma.notification.findFirstOrThrow({where: {issueId: issue.id}});
    expect(n.title).toBe("Novo intake aberto");
    expect(n.message).toBe("Impressora parada");
    expect(n.entity).toBe("intake");
    expect(n.entityId).toBe(issue.id);
    expect(n.triggered).toBe("intake");
    expect(n.data).toEqual({type: "intake_opened"});
    expect(n.isRead).toBe(false);
  });

  it("não cria nada quando o projeto não tem ninguém da Qualidade", async () => {
    const owner = await createUser();
    const ws = await createWorkspace(owner.id);
    const project = await createProject(ws.id, owner.id);
    const issue = await createIssue(project.id, ws.id);
    await notifyQualityOfIntake({
      workspaceId: ws.id,
      projectId: project.id,
      issueId: issue.id,
      actorId: owner.id,
      issueName: issue.name,
    });
    expect(await prisma.notification.count({where: {issueId: issue.id}})).toBe(0);
  });

  it("reconhece a Qualidade pelo workflowRole mesmo com role Int diferente", async () => {
    const qualidadeRole = await prisma.workflowRole.findFirstOrThrow({where: {workspaceId, key: "qualidade"}});
    const disfarcado = await createUser();
    await prisma.projectMember.create({
      data: {
        projectId,
        workspaceId,
        memberId: disfarcado.id,
        role: 15,
        isActive: true,
        workflowRoleId: qualidadeRole.id,
      },
    });
    const issue = await createIssue(projectId, workspaceId, {name: "Via workflowRole"});
    await notifyQualityOfIntake({workspaceId, projectId, issueId: issue.id, actorId, issueName: issue.name});
    const receivers = (await prisma.notification.findMany({where: {issueId: issue.id}})).map((n) => n.receiverId);
    expect(receivers).toContain(disfarcado.id);
  });
});
