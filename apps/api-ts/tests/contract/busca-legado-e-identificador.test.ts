/**
 * Contrato dos dois caminhos que levam a pessoa até um chamado:
 *
 *  1. Busca pelo número do chamado no sistema antigo ("500-2026"), digitado do
 *     jeito que a pessoa lembra — com hífen, com barra, com espaço ou sem nada.
 *  2. Resolução do identificador legível ("ESIC-150") para o chamado, que é o
 *     endpoint por trás da rota /:espaco/browse/:identificador/ do frontend e,
 *     portanto, de todo link de notificação.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createIssue,
  createProject,
  createState,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

describe("BuscaPorNumeroLegadoEIdentificador", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;
  let projectIdentifier: string;
  let chamadoLegadoId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    const project = await createProject(ws.id, user.id, { identifier: "ESIC" });
    projectId = project.id;
    projectIdentifier = project.identifier;
    client = apiClient(token.token);

    const chamado = await createIssue(projectId, ws.id, {
      name: "Projeção Cálculo",
      sequenceId: 150,
      legacyTicketNumber: "500-2026",
    });
    chamadoLegadoId = chamado.id;

    // Vizinho com número parecido: garante que a busca não devolve qualquer coisa.
    await createIssue(projectId, ws.id, {
      name: "Outro assunto",
      sequenceId: 151,
      legacyTicketNumber: "500-2025",
    });

    // Solicitação em triagem: o frontend a desvia da tela de chamado para a
    // tela de entrada, então a flag precisa vir preenchida.
    const triagem = await createState(projectId, ws.id, { name: "Triagem", group: "triage", isTriage: true });
    await createIssue(projectId, ws.id, {
      name: "Solicitação em triagem",
      sequenceId: 152,
      stateId: triagem.id,
    });
  });

  afterAll(() => cleanDb());

  // ── Busca global pelo número legado ───────────────────────────────────────

  const idsDaBusca = async (termo: string) => {
    const res = await client.get(`/workspaces/${wsSlug}/global-search/?q=${encodeURIComponent(termo)}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    return [...data.results.issues, ...data.results.intakes].map((i: any) => i.id);
  };

  it("acha pelo número legado exatamente como está gravado", async () => {
    expect(await idsDaBusca("500-2026")).toContain(chamadoLegadoId);
  });

  it("acha pelo número legado com o '#' que a interface mostra", async () => {
    expect(await idsDaBusca("#500-2026")).toContain(chamadoLegadoId);
  });

  it("acha pelo número legado escrito com barra em vez de hífen", async () => {
    expect(await idsDaBusca("500/2026")).toContain(chamadoLegadoId);
  });

  it("acha pelo número legado escrito com espaço em vez de hífen", async () => {
    expect(await idsDaBusca("500 2026")).toContain(chamadoLegadoId);
  });

  it("acha pelo número legado escrito sem separador nenhum", async () => {
    expect(await idsDaBusca("5002026")).toContain(chamadoLegadoId);
  });

  it("o chamado com o número exato vem na frente do vizinho parecido", async () => {
    const ids = await idsDaBusca("500-2026");
    expect(ids[0]).toBe(chamadoLegadoId);
  });

  it("número legado que não existe não devolve chamado", async () => {
    expect(await idsDaBusca("999999-1998")).toHaveLength(0);
  });

  it("a busca antiga do PowerK também acha pelo número legado", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/search/?search=500%2F2026`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.results.issue.map((i: any) => i.id)).toContain(chamadoLegadoId);
  });

  it("o resultado carrega o número legado, para a interface poder exibi-lo", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/global-search/?q=500-2026`);
    const data = (await res.json()) as any;
    const achado = data.results.issues.find((i: any) => i.id === chamadoLegadoId);
    expect(achado.legacy_ticket_number).toBe("500-2026");
  });

  // ── Identificador legível → chamado (rota /browse/) ───────────────────────

  it("resolve o identificador legível para o chamado", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/work-items/${projectIdentifier}-150/`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.id).toBe(chamadoLegadoId);
    expect(data.project_id).toBe(projectId);
    expect(data.sequence_id).toBe(150);
    expect(data.name).toBe("Projeção Cálculo");
  });

  it("resolve o identificador digitado em minúsculas", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/work-items/${projectIdentifier.toLowerCase()}-150/`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.id).toBe(chamadoLegadoId);
  });

  it("marca is_intake para o chamado em triagem, que o frontend desvia para a entrada", async () => {
    const semTriagem = await client.get(`/workspaces/${wsSlug}/work-items/${projectIdentifier}-150/`);
    expect(((await semTriagem.json()) as any).is_intake).toBe(false);

    const emTriagem = await client.get(`/workspaces/${wsSlug}/work-items/${projectIdentifier}-152/`);
    expect(emTriagem.status).toBe(200);
    expect(((await emTriagem.json()) as any).is_intake).toBe(true);
  });

  it("sequência que não existe devolve 404", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/work-items/${projectIdentifier}-999999/`);
    expect(res.status).toBe(404);
  });

  it("projeto que não existe devolve 404", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/work-items/NAOEXISTE-1/`);
    expect(res.status).toBe(404);
  });

  it("identificador sem sufixo numérico devolve 400", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/work-items/ESIC/`);
    expect(res.status).toBe(400);
  });
});
