/**
 * Rascunhos do espaço de trabalho: listar e abrir.
 *
 * O cabeçalho de /drafts mostrava "Rascunhos 1" e a lista ficava vazia. A API
 * devolvia o objeto cru do Prisma (camelCase); a tela esconde a linha sem
 * `project_id`, então todo rascunho sumia sem erro nenhum.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createProject, createUser, createWorkspace } from "@tests/helpers/factory";

describe("Rascunhos do espaço de trabalho", () => {
  let client: ReturnType<typeof apiClient>;
  let outroClient: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;
  let stateId: string;
  let draftId: string;

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser({ email: "dono-rascunho@plane.test" });
    const ws = await createWorkspace(dono.id);
    wsSlug = ws.slug;
    projectId = (await createProject(ws.id, dono.id)).id;
    stateId = (await prisma.state.findFirstOrThrow({ where: { projectId, deletedAt: null } })).id;
    client = apiClient((await createApiToken(dono.id)).token);

    const outro = await createUser({ email: "outro-rascunho@plane.test" });
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, memberId: outro.id, role: 15, isActive: true } });
    outroClient = apiClient((await createApiToken(outro.id)).token);
  });

  afterAll(() => cleanDb());

  it("criar aceita os campos que o formulário manda", async () => {
    const res = await client.post(`/workspaces/${wsSlug}/draft-issues/`, {
      name: "Rascunho da tela",
      project_id: projectId,
      state_id: stateId,
      priority: "high",
      start_date: "2026-10-01",
      target_date: "2026-10-09",
      description_html: "<p>texto</p>",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    draftId = body.id;
    expect(body.project_id).toBe(projectId);
    expect(body.state_id).toBe(stateId);
    expect(body.start_date).toBe("2026-10-01");
    expect(body.target_date).not.toBeNull();
  });

  it("listar devolve o envelope paginado com o rascunho em snake_case", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/draft-issues/?per_page=50&cursor=50:0:0`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.total_count).toBe(1);
    expect(body.results).toHaveLength(1);
    const [rascunho] = body.results;
    expect(rascunho).toMatchObject({
      id: draftId,
      name: "Rascunho da tela",
      project_id: projectId,
      state_id: stateId,
      priority: "high",
      is_draft: true,
      label_ids: [],
      assignee_ids: [],
    });
    expect(typeof rascunho.created_at).toBe("string");
    expect(rascunho).not.toHaveProperty("projectId");
  });

  it("abrir um rascunho devolve o mesmo formato", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/draft-issues/${draftId}/`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({
      id: draftId,
      project_id: projectId,
      state_id: stateId,
      description_html: "<p>texto</p>",
    });
  });

  it("editar aceita state_id e devolve snake_case", async () => {
    const res = await client.patch(`/workspaces/${wsSlug}/draft-issues/${draftId}/`, {
      name: "Rascunho editado",
      priority: "low",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ id: draftId, name: "Rascunho editado", priority: "low", project_id: projectId });
  });

  it("rascunho de outra pessoa não aparece na lista dela", async () => {
    const res = await outroClient.get(`/workspaces/${wsSlug}/draft-issues/`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).results).toHaveLength(0);
  });

  it("mover para o sistema vira chamado numerado e sai da lista", async () => {
    const res = await client.post(`/workspaces/${wsSlug}/draft-to-issue/${draftId}/`, {});
    expect(res.status).toBe(201);
    const chamado = (await res.json()) as any;
    expect(chamado).toMatchObject({
      project_id: projectId,
      state_id: stateId,
      name: "Rascunho editado",
      is_draft: false,
    });
    expect(chamado.sequence_id).toBeGreaterThan(0);
    expect(chamado.start_date).toBe("2026-10-01");

    const lista = (await (await client.get(`/workspaces/${wsSlug}/draft-issues/`)).json()) as any;
    expect(lista.results).toHaveLength(0);
  });
});
