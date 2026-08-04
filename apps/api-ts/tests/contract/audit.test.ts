/**
 * Trilha de auditoria (LGPD) — testes de contrato.
 *
 * Verifica que as ações do usuário realmente viram registro (abrir, ver,
 * interagir, encerrar, imprimir) e que a consulta respeita a regra de acesso:
 * a trilha inteira é de administrador; o titular vê só os próprios acessos.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createProject, createUser, createWorkspace } from "@tests/helpers/factory";

/** A gravação é assíncrona (não bloqueia a resposta) — espera o registro aparecer. */
async function waitForLog(where: any, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const log = await prisma.auditLog.findFirst({ where, orderBy: { createdAt: "desc" } });
    if (log) return log;
    await Bun.sleep(75);
  }
  return null;
}

describe("TestAuditTrail", () => {
  let admin: ReturnType<typeof apiClient>;
  let membro: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let projectId: string;
  let adminId: string;
  let membroId: string;
  let issueId: string;

  beforeAll(async () => {
    await cleanDb();
    const adminUser = await createUser({ email: "audit-admin@plane.test" });
    adminId = adminUser.id;
    const ws = await createWorkspace(adminUser.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    const project = await createProject(ws.id, adminUser.id);
    projectId = project.id;
    admin = apiClient((await createApiToken(adminUser.id)).token);

    const membroUser = await createUser({ email: "audit-membro@plane.test" });
    membroId = membroUser.id;
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, memberId: membroUser.id, role: 15, isActive: true } });
    await prisma.projectMember.create({
      data: { projectId: project.id, workspaceId: ws.id, memberId: membroUser.id, role: 15, isActive: true },
    });
    membro = apiClient((await createApiToken(membroUser.id)).token);
  });

  afterAll(() => cleanDb());

  const issuesUrl = () => `/workspaces/${wsSlug}/projects/${projectId}/issues/`;
  const auditUrl = () => `/workspaces/${wsSlug}/audit-logs/`;

  it("abrir um chamado gera registro de criação", async () => {
    const res = await admin.post(issuesUrl(), { name: "Chamado auditado" });
    expect(res.status).toBe(201);
    issueId = ((await res.json()) as any).id;

    const log = await waitForLog({ entity: "issue", entityId: issueId, action: "create" });
    expect(log).not.toBeNull();
    expect(log!.actorId).toBe(adminId);
    expect(log!.workspaceId).toBe(wsId);
    expect((log!.metadata as any).project_id).toBe(projectId);
  });

  it("visualizar um chamado gera registro de acesso, com o ator correto", async () => {
    const res = await membro.get(`${issuesUrl()}${issueId}/`);
    expect(res.status).toBe(200);

    const log = await waitForLog({ entity: "issue", entityId: issueId, action: "view", actorId: membroId });
    expect(log).not.toBeNull();
    expect(log!.actorEmail).toBe("audit-membro@plane.test");
  });

  it("comentar gera registro de interação vinculado ao chamado", async () => {
    const res = await membro.post(`${issuesUrl()}${issueId}/comments/`, { comment_html: "<p>Retorno ao cliente</p>" });
    expect(res.status).toBe(201);
    const commentId = ((await res.json()) as any).id;

    const log = await waitForLog({ entity: "comment", entityId: commentId, action: "comment" });
    expect(log).not.toBeNull();
    expect((log!.metadata as any).issue_id).toBe(issueId);
  });

  it("encerrar o chamado (estado concluído) vira ação de encerramento, não update genérico", async () => {
    const done = await prisma.state.findFirst({ where: { projectId, group: "completed" } });
    const res = await admin.patch(`${issuesUrl()}${issueId}/`, { state_id: done!.id });
    expect(res.status).toBe(200);

    const log = await waitForLog({ entity: "issue", entityId: issueId, action: "close" });
    expect(log).not.toBeNull();
    expect((log!.changes as any).state?.para).toBe(done!.name);
  });

  it("alterar prioridade registra o diff de/para", async () => {
    const res = await admin.patch(`${issuesUrl()}${issueId}/`, { priority: "urgent" });
    expect(res.status).toBe(200);

    const log = await waitForLog({ entity: "issue", entityId: issueId, action: "update" });
    expect(log).not.toBeNull();
    expect((log!.changes as any).priority?.para).toBe("urgent");
  });

  it("excluir o chamado gera registro de exclusão", async () => {
    const res = await admin.post(issuesUrl(), { name: "Chamado para excluir" });
    const alvo = ((await res.json()) as any).id;
    expect((await admin.delete(`${issuesUrl()}${alvo}/`)).status).toBe(204);

    const log = await waitForLog({ entity: "issue", entityId: alvo, action: "delete" });
    expect(log).not.toBeNull();
  });

  describe("registro de eventos de tela (impressão)", () => {
    it("aceita impressão e grava o ator autenticado", async () => {
      const res = await membro.post(auditUrl(), {
        action: "print",
        entity: "issue",
        entity_id: issueId,
        metadata: { tela: "detalhe-do-chamado" },
      });
      expect(res.status).toBe(201);

      const log = await waitForLog({ entity: "issue", entityId: issueId, action: "print" });
      expect(log).not.toBeNull();
      expect(log!.actorId).toBe(membroId);
      expect((log!.metadata as any).origem).toBe("web");
      expect((log!.metadata as any).tela).toBe("detalhe-do-chamado");
    });

    it("recusa ação fora do vocabulário permitido ao cliente", async () => {
      const res = await membro.post(auditUrl(), { action: "delete", entity: "issue", entity_id: issueId });
      expect(res.status).toBe(400);
    });

    it("recusa entidade desconhecida", async () => {
      const res = await membro.post(auditUrl(), { action: "print", entity: "planilha_secreta", entity_id: issueId });
      expect(res.status).toBe(400);
    });

    it("exige entity_id", async () => {
      const res = await membro.post(auditUrl(), { action: "print", entity: "issue" });
      expect(res.status).toBe(400);
    });

    it("o ator vem do token, não do corpo da requisição", async () => {
      const res = await membro.post(auditUrl(), {
        action: "export",
        entity: "report",
        entity_id: projectId,
        actor_id: adminId,
        actor_email: "audit-admin@plane.test",
      });
      expect(res.status).toBe(201);
      const log = await waitForLog({ entity: "report", entityId: projectId, action: "export" });
      expect(log!.actorId).toBe(membroId);
      expect(log!.actorEmail).toBe("audit-membro@plane.test");
    });
  });

  describe("consulta", () => {
    it("administrador lista a trilha inteira, paginada", async () => {
      const res = await admin.get(auditUrl());
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.results).toBeInstanceOf(Array);
      expect(data.total_count).toBeGreaterThan(0);
      expect(data.results[0].entity_id).toBeDefined();
      expect(data.results[0].actor_email).toBeDefined();
    });

    it("membro comum não acessa a trilha de terceiros", async () => {
      const res = await membro.get(auditUrl());
      expect(res.status).toBe(403);
    });

    it("filtra por entidade e por ação", async () => {
      const porEntidade = (await (await admin.get(`${auditUrl()}?entity=comment`)).json()) as any;
      expect(porEntidade.results.every((l: any) => l.entity === "comment")).toBe(true);

      const porAcao = (await (await admin.get(`${auditUrl()}?action=view`)).json()) as any;
      expect(porAcao.results.every((l: any) => l.action === "view")).toBe(true);
      expect(porAcao.total_count).toBeGreaterThan(0);
    });

    it("filtra por várias ações de uma vez", async () => {
      const res = (await (await admin.get(`${auditUrl()}?action=create,delete`)).json()) as any;
      expect(res.results.every((l: any) => ["create", "delete"].includes(l.action))).toBe(true);
    });

    it("filtra por ator e por registro específico", async () => {
      const porAtor = (await (await admin.get(`${auditUrl()}?actor_id=${membroId}`)).json()) as any;
      expect(porAtor.results.every((l: any) => l.actor_id === membroId)).toBe(true);

      const porRegistro = (await (await admin.get(`${auditUrl()}?entity_id=${issueId}`)).json()) as any;
      expect(porRegistro.results.every((l: any) => l.entity_id === issueId)).toBe(true);
    });

    it("filtra por período", async () => {
      const futuro = new Date(Date.now() + 86400000).toISOString();
      const vazio = (await (await admin.get(`${auditUrl()}?date_from=${futuro}`)).json()) as any;
      expect(vazio.results).toHaveLength(0);
      expect(vazio.total_count).toBe(0);

      const passado = new Date(Date.now() - 86400000).toISOString();
      const cheio = (await (await admin.get(`${auditUrl()}?date_from=${passado}`)).json()) as any;
      expect(cheio.total_count).toBeGreaterThan(0);
    });

    it("titular consulta os próprios acessos sem ser administrador", async () => {
      const res = await membro.get(`${auditUrl()}me/`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.results.length).toBeGreaterThan(0);
      expect(data.results.every((l: any) => l.actor_id === membroId)).toBe(true);
    });

    it("exportação em CSV é restrita a administrador e vira registro", async () => {
      const negado = await membro.get(`${auditUrl()}export/`);
      expect(negado.status).toBe(403);

      const res = await admin.get(`${auditUrl()}export/`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      const csv = await res.text();
      expect(csv.split("\n")[0]).toContain("ator_email");
      expect(csv.split("\n").length).toBeGreaterThan(1);

      const log = await waitForLog({ entity: "audit_log", action: "export" });
      expect(log).not.toBeNull();
    });

    it("não vaza trilha de outro workspace", async () => {
      const outroDono = await createUser({ email: "audit-outro@plane.test" });
      const outroWs = await createWorkspace(outroDono.id);
      const outroClient = apiClient((await createApiToken(outroDono.id)).token);

      const res = await outroClient.get(`/workspaces/${outroWs.slug}/audit-logs/`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.total_count).toBe(0);
    });

    it("sem autenticação não há trilha", async () => {
      const res = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:8011"}/api/v1${auditUrl()}`);
      expect(res.status).toBe(401);
    });
  });
});
