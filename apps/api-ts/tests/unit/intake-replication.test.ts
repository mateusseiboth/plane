/**
 * H4 — replicação para os intakes vinculados. Quando o work item de origem é
 * concluído ou cancelado, seus comentários e atividades são copiados para o
 * intake que apontava para ele como duplicata, e o intake recebe o desfecho.
 * As cópias são idempotentes (externalSource/externalId).
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {createIssue, createProject, createUser, createWorkspace, ensureIntake} from "@tests/helpers/factory";
import {replicateToLinkedIntakes} from "@utils/intake-replication";

describe("replicateToLinkedIntakes", () => {
  let workspaceId: string;
  let projectId: string;
  let actorId: string;
  let intakeId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    actorId = user.id;
    const ws = await createWorkspace(user.id);
    workspaceId = ws.id;
    projectId = (await createProject(ws.id, user.id)).id;
    intakeId = (await ensureIntake(projectId, workspaceId)).id;
  });

  afterAll(() => cleanDb());

  /** Cria a origem (com 1 comentário + 1 atividade) e um intake ligado a ela. */
  async function scenario() {
    const source = await createIssue(projectId, workspaceId, {name: "Origem"});
    const target = await createIssue(projectId, workspaceId, {name: "Intake"});
    const comment = await prisma.issueComment.create({
      data: {
        issueId: source.id,
        projectId,
        workspaceId,
        actorId,
        commentHtml: "<p>resolvido</p>",
        commentStripped: "resolvido",
        access: "INTERNAL",
      },
    });
    const activity = await prisma.issueActivity.create({
      data: {
        issueId: source.id,
        projectId,
        workspaceId,
        actorId,
        verb: "updated",
        field: "state",
        oldValue: "a",
        newValue: "b",
        comment: "mudou o estado",
        epoch: Date.now(),
      },
    });
    const link = await prisma.intakeIssue.create({
      data: {intakeId, issueId: target.id, projectId, workspaceId, status: -2, duplicateOf: source.id},
    });
    return {source, target, comment, activity, link};
  }

  it("copia comentários e atividades e marca o intake como aceito", async () => {
    const {source, target, comment, activity, link} = await scenario();
    await replicateToLinkedIntakes(source.id, "completed");

    const copies = await prisma.issueComment.findMany({where: {issueId: target.id}});
    expect(copies).toHaveLength(1);
    expect(copies[0].externalSource).toBe("intake_replica");
    expect(copies[0].externalId).toBe(comment.id);
    expect(copies[0].commentStripped).toBe("resolvido");

    const acts = await prisma.issueActivity.findMany({where: {issueId: target.id}});
    expect(acts).toHaveLength(1);
    expect(acts[0].field).toBe("intake_replica");
    expect(acts[0].oldValue).toBe(activity.id);
    expect(acts[0].newValue).toBe("state");

    expect((await prisma.intakeIssue.findUniqueOrThrow({where: {id: link.id}})).status).toBe(1);
  });

  it("cancelado marca o intake como recusado (-1)", async () => {
    const {source, link} = await scenario();
    await replicateToLinkedIntakes(source.id, "cancelled");
    expect((await prisma.intakeIssue.findUniqueOrThrow({where: {id: link.id}})).status).toBe(-1);
  });

  it("é idempotente — rodar de novo não duplica cópias", async () => {
    const {source, target} = await scenario();
    await replicateToLinkedIntakes(source.id, "completed");
    await replicateToLinkedIntakes(source.id, "completed");
    expect(await prisma.issueComment.count({where: {issueId: target.id}})).toBe(1);
    expect(await prisma.issueActivity.count({where: {issueId: target.id}})).toBe(1);
  });

  it("não faz nada quando nenhum intake aponta para a origem", async () => {
    const orphan = await createIssue(projectId, workspaceId, {name: "Sem intake"});
    await prisma.issueComment.create({
      data: {issueId: orphan.id, projectId, workspaceId, actorId, commentHtml: "<p>x</p>", commentStripped: "x"},
    });
    await replicateToLinkedIntakes(orphan.id, "completed");
    expect(await prisma.issueComment.count({where: {issueId: orphan.id}})).toBe(1);
  });

  it("ignora vínculo cuja origem é o próprio intake", async () => {
    const self = await createIssue(projectId, workspaceId, {name: "Auto-referência"});
    await prisma.intakeIssue.create({
      data: {intakeId, issueId: self.id, projectId, workspaceId, status: -2, duplicateOf: self.id},
    });
    await prisma.issueComment.create({
      data: {issueId: self.id, projectId, workspaceId, actorId, commentHtml: "<p>y</p>", commentStripped: "y"},
    });
    await replicateToLinkedIntakes(self.id, "completed");
    expect(await prisma.issueComment.count({where: {issueId: self.id}})).toBe(1);
  });

  it("não replica atividades que pertencem a um comentário", async () => {
    const {source, target} = await scenario();
    const c = await prisma.issueComment.findFirstOrThrow({where: {issueId: source.id}});
    await prisma.issueActivity.create({
      data: {
        issueId: source.id,
        projectId,
        workspaceId,
        actorId,
        verb: "created",
        field: "comment",
        issueCommentId: c.id,
        epoch: Date.now(),
      },
    });
    await replicateToLinkedIntakes(source.id, "completed");
    const acts = await prisma.issueActivity.findMany({where: {issueId: target.id}});
    expect(acts).toHaveLength(1);
  });
});
