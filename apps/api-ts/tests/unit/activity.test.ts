/**
 * Log de atividades — alimenta o feed de histórico do chamado no frontend.
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {createIssue, createProject, createUser, createWorkspace} from "@tests/helpers/factory";
import {diffChange, recordActivities} from "@utils/activity";

describe("diffChange", () => {
  it("devolve null quando o valor não mudou", () => {
    expect(diffChange("priority", "high", "high")).toBeNull();
    expect(diffChange("state", null, undefined)).toBeNull();
    expect(diffChange("point", 3, 3)).toBeNull();
  });

  it("normaliza null/undefined para null e converte o resto em string", () => {
    expect(diffChange("priority", null, "urgent")).toEqual({
      field: "priority",
      oldValue: null,
      newValue: "urgent",
      comment: "updated the priority",
    });
    expect(diffChange("point", 1, 2)!.oldValue).toBe("1");
  });

  it("aceita um comentário customizado", () => {
    expect(diffChange("name", "a", "b", "renomeou o chamado")!.comment).toBe("renomeou o chamado");
  });

  it("detecta a remoção de um valor", () => {
    expect(diffChange("target_date", "2026-01-01", null)).toEqual({
      field: "target_date",
      oldValue: "2026-01-01",
      newValue: null,
      comment: "updated the target_date",
    });
  });
});

describe("recordActivities", () => {
  let ctx: {issueId: string; workspaceId: string; projectId: string; actorId: string};

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const ws = await createWorkspace(user.id);
    const project = await createProject(ws.id, user.id);
    const issue = await createIssue(project.id, ws.id);
    ctx = {issueId: issue.id, workspaceId: ws.id, projectId: project.id, actorId: user.id};
  });

  afterAll(() => cleanDb());

  it("não escreve nada quando a lista de mudanças está vazia", async () => {
    await recordActivities(ctx, []);
    expect(await prisma.issueActivity.count({where: {issueId: ctx.issueId}})).toBe(0);
  });

  it("grava um lote com verb padrão 'updated'", async () => {
    await recordActivities(ctx, [
      {field: "priority", oldValue: "none", newValue: "urgent"},
      {field: "state", oldValue: null, newValue: "s1", verb: "created", comment: "criou"},
    ]);
    const rows = await prisma.issueActivity.findMany({where: {issueId: ctx.issueId}, orderBy: {field: "asc"}});
    expect(rows).toHaveLength(2);
    const priority = rows.find((r) => r.field === "priority")!;
    expect(priority.verb).toBe("updated");
    expect(priority.newValue).toBe("urgent");
    expect(priority.epoch).toBeGreaterThan(0);
    const state = rows.find((r) => r.field === "state")!;
    expect(state.verb).toBe("created");
    expect(state.comment).toBe("criou");
    expect(state.oldValue).toBeNull();
  });

  it("normaliza os campos opcionais ausentes", async () => {
    const issue = await createIssue(ctx.projectId, ctx.workspaceId, {name: "Outro"});
    await recordActivities({...ctx, issueId: issue.id}, [{field: "name"}]);
    const row = await prisma.issueActivity.findFirstOrThrow({where: {issueId: issue.id}});
    expect(row.oldValue).toBeNull();
    expect(row.newValue).toBeNull();
    expect(row.comment).toBe("");
  });

  it("combina bem com diffChange filtrando os nulos", async () => {
    const issue = await createIssue(ctx.projectId, ctx.workspaceId, {name: "Terceiro"});
    const changes = [
      diffChange("name", "Terceiro", "Terceiro"),
      diffChange("priority", "none", "low"),
    ].filter((c) => c !== null);
    await recordActivities({...ctx, issueId: issue.id}, changes);
    const rows = await prisma.issueActivity.findMany({where: {issueId: issue.id}});
    expect(rows).toHaveLength(1);
    expect(rows[0].field).toBe("priority");
  });
});
