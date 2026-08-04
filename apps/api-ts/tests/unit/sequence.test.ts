/**
 * nextSequenceId — o schema tem default 0 em sequenceId, então qualquer caminho
 * de criação que esqueça este helper produz PROJ-0 em todos os chamados.
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {createIssue, createProject, createUser, createWorkspace} from "@tests/helpers/factory";
import {nextSequenceId} from "@utils/sequence";

describe("nextSequenceId", () => {
  let workspaceId: string;
  let projectA: string;
  let projectB: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const ws = await createWorkspace(user.id);
    workspaceId = ws.id;
    projectA = (await createProject(ws.id, user.id)).id;
    projectB = (await createProject(ws.id, user.id)).id;
  });

  afterAll(() => cleanDb());

  it("começa em 1 num projeto sem chamados", async () => {
    expect(await nextSequenceId(prisma, projectA)).toBe(1);
  });

  it("devolve max(sequenceId) + 1", async () => {
    await createIssue(projectA, workspaceId, {sequenceId: 1});
    await createIssue(projectA, workspaceId, {sequenceId: 7});
    expect(await nextSequenceId(prisma, projectA)).toBe(8);
  });

  it("é escopado por projeto", async () => {
    expect(await nextSequenceId(prisma, projectB)).toBe(1);
  });

  it("funciona dentro de uma transação", async () => {
    const seq = await prisma.$transaction(async (tx) => {
      const n = await nextSequenceId(tx, projectA);
      await tx.issue.create({data: {projectId: projectA, workspaceId, name: "Dentro da tx", sequenceId: n}});
      return n;
    });
    expect(seq).toBe(8);
    expect(await nextSequenceId(prisma, projectA)).toBe(9);
  });
});
