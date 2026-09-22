/**
 * Permissões v2 pela API de verdade: catálogo de ações, exceções por pessoa,
 * prioridade do chamado, criação de sistema e visitas técnicas pela matriz.
 * Precisa de uma API rodando contra o banco de teste (API_BASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createIssue,
  createMemberWithToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

describe("permissões v2", () => {
  let slug: string;
  let wsId: string;
  let projectId: string;
  let issueId: string;
  let admin: ReturnType<typeof apiClient>;
  let gestor: ReturnType<typeof apiClient>;
  let ti: ReturnType<typeof apiClient>;
  let tiUserId: string;
  let guest: ReturnType<typeof apiClient>;

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser();
    const ws = await createWorkspace(owner.id);
    slug = ws.slug;
    wsId = ws.id;
    const project = await createProject(ws.id, owner.id);
    projectId = project.id;
    await seedWorkflowRoles(prisma, ws.id);
    admin = apiClient((await createApiToken(owner.id)).token);
    const g = await createMemberWithToken(ws.id, 18, projectId, 18);
    gestor = apiClient(g.token);
    const t = await createMemberWithToken(ws.id, 12, projectId, 12);
    ti = apiClient(t.token);
    tiUserId = t.user.id;
    const v = await createMemberWithToken(ws.id, 5, projectId, 5);
    guest = apiClient(v.token);
    await seedWorkflowRoles(prisma, ws.id);
    issueId = (await createIssue(projectId, ws.id, { priority: "none" } as any)).id;
  });

  afterAll(() => cleanDb());

  it("GET /roles/actions/ devolve o catálogo com rótulo, grupo e escopo", async () => {
    const res = await guest.get(`/workspaces/${slug}/roles/actions/`);
    expect(res.status).toBe(200);
    const acoes = (await res.json()) as any[];
    const prioridade = acoes.find((a) => a.key === "issue.priority");
    expect(prioridade).toMatchObject({ label: "Alterar a prioridade do chamado", scope: "project" });
    expect(typeof prioridade.group).toBe("string");
  });

  it("GET /roles/me/ devolve as ações efetivas de quem chama", async () => {
    const res = await ti.get(`/workspaces/${slug}/roles/me/`);
    expect(res.status).toBe(200);
    const me = (await res.json()) as any;
    expect(me.role.key).toBe("ti");
    expect(me.permissions).toContain("chat.atender");
    expect(me.permissions).not.toContain("issue.priority");
  });

  it("TI não altera prioridade; Gestor altera", async () => {
    const url = `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/`;
    expect((await ti.patch(url, { priority: "high" })).status).toBe(403);
    expect((await gestor.patch(url, { priority: "high" })).status).toBe(200);
  });

  it("TI ainda edita o chamado quando não mexe na prioridade", async () => {
    const url = `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/`;
    expect((await ti.patch(url, { name: "Renomeado pelo TI", priority: "high" })).status).toBe(200);
  });

  it("concessão por pessoa libera a prioridade para o TI", async () => {
    const put = await admin.put(`/workspaces/${slug}/roles/members/${tiUserId}/`, {
      granted: ["issue.priority"],
      revoked: [],
    });
    expect(put.status).toBe(200);
    const url = `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/`;
    expect((await ti.patch(url, { priority: "low" })).status).toBe(200);
  });

  it("lista as exceções de cada pessoa para quem gerencia funções", async () => {
    const res = await admin.get(`/workspaces/${slug}/roles/members/`);
    expect(res.status).toBe(200);
    const pessoas = (await res.json()) as any[];
    const doTi = pessoas.find((p) => p.member_id === tiUserId);
    expect(doTi.granted).toEqual(["issue.priority"]);
    expect(doTi.role_name).toBe("TI");
  });

  it("exceção com ação inexistente volta 400 com o campo", async () => {
    const res = await admin.put(`/workspaces/${slug}/roles/members/${tiUserId}/`, {
      granted: ["nao.existe"],
      revoked: [],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors[0].path).toBe("granted[0]");
  });

  it("quem não gerencia funções não mexe em exceção", async () => {
    const res = await ti.put(`/workspaces/${slug}/roles/members/${tiUserId}/`, {
      granted: ["role.manage"],
      revoked: [],
    });
    expect(res.status).toBe(403);
  });

  it("criar sistema exige a ação, não só ser do espaço", async () => {
    const corpo = { name: "Sistema do visitante", identifier: "VIS" };
    expect((await guest.post(`/workspaces/${slug}/projects/`, corpo)).status).toBe(403);
    expect(
      (await admin.post(`/workspaces/${slug}/projects/`, { name: "Sistema novo", identifier: "NOVO" })).status
    ).toBe(201);
  });

  it("visitante não registra visita técnica", async () => {
    const res = await guest.post(`/workspaces/${slug}/technical-visits/`, { title: "Visita" });
    expect(res.status).toBe(403);
  });

  it("espaço novo já nasce com as 7 funções gravadas", async () => {
    const criado = await guest.post("/workspaces/", { name: "Espaço novo", slug: "espaco-novo-v2" });
    expect(criado.status).toBe(201);
    const res = await guest.get("/workspaces/espaco-novo-v2/roles/");
    expect(((await res.json()) as any[]).length).toBe(7);
  });

  it("negação por pessoa tira do Gestor o que a função daria", async () => {
    const gestorId = (await prisma.workspaceMember.findFirstOrThrow({ where: { workspaceId: wsId, role: 18 } }))
      .memberId;
    await admin.put(`/workspaces/${slug}/roles/members/${gestorId}/`, { granted: [], revoked: ["issue.priority"] });
    const url = `/workspaces/${slug}/projects/${projectId}/issues/${issueId}/`;
    expect((await gestor.patch(url, { priority: "urgent" })).status).toBe(403);
  });
});
