/**
 * Histórico de exportações — GET /workspaces/{slug}/export-issues/.
 *
 * A tela "Exportações anteriores" existia e chamava esta rota, mas só havia o
 * POST: a listagem devolvia NOT_FOUND e a tabela nunca saía do carregando.
 * Estes testes fixam o envelope paginado, a forma de cada linha (quem exportou,
 * quais projetos, formato, status) e o isolamento entre espaços de trabalho.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createMemberWithToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

describe("TestExportHistory", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let projetoA: string;
  let projetoB: string;
  let ownerDisplayName: string;
  // segundo espaço de trabalho, para provar isolamento
  let outroSlug: string;
  let outroClient: ReturnType<typeof apiClient>;

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser({ email: "export-owner@plane.test" });
    ownerDisplayName = owner.displayName;
    client = apiClient((await createApiToken(owner.id)).token);
    const ws = await createWorkspace(owner.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    projetoA = (await createProject(ws.id, owner.id, { identifier: "EXPA" })).id;
    projetoB = (await createProject(ws.id, owner.id, { identifier: "EXPB" })).id;

    const outroOwner = await createUser({ email: "export-outro@plane.test" });
    outroClient = apiClient((await createApiToken(outroOwner.id)).token);
    outroSlug = (await createWorkspace(outroOwner.id)).slug;
  });

  afterAll(() => cleanDb());

  const url = (qs = "") => `/workspaces/${wsSlug}/export-issues/${qs}`;

  const exportar = async (payload: Record<string, unknown>, c = client) => c.post(url(), payload);

  it("registra a exportação com o formato e os projetos escolhidos", async () => {
    const res = await exportar({ provider: "csv", project: [projetoA, projetoB], multiple: true });
    expect(res.status).toBe(201);
  });

  it("a listagem devolve envelope paginado (antes era NOT_FOUND)", async () => {
    const res = await client.get(url("?per_page=10&cursor=10:0:0"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(typeof data.total_count).toBe("number");
    expect(typeof data.next_cursor).toBe("string");
    expect(typeof data.prev_cursor).toBe("string");
    expect(typeof data.next_page_results).toBe("boolean");
    expect(typeof data.prev_page_results).toBe("boolean");
    // Campos que o tipo IExportServiceResponse declara e a tela lê.
    expect(typeof data.count).toBe("number");
    expect(typeof data.total_pages).toBe("number");
    expect(data.extra_stats).toBeNull();
  });

  it("cada linha traz quem exportou, os projetos, o formato e o status", async () => {
    const data = (await (await client.get(url())).json()) as any;
    const linha = data.results[0];

    expect(linha.project).toEqual([projetoA, projetoB]);
    expect(linha.provider).toBe("csv");
    expect(linha.status).toBe("queued");
    expect(typeof linha.url).toBe("string");
    expect(typeof linha.token).toBe("string");
    expect(typeof linha.created_at).toBe("string");
    expect(linha.initiated_by_detail.display_name).toBe(ownerDisplayName);
    expect(linha.initiated_by_detail.email).toBe("export-owner@plane.test");
  });

  it("responde também sem a barra final — é assim que o frontend chama", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/export-issues?per_page=10&cursor=10:0:0`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).results).toBeInstanceOf(Array);
  });

  it("as mais recentes vêm primeiro e o cursor pagina", async () => {
    await exportar({ provider: "xlsx", project: [projetoA] });
    await exportar({ provider: "json", project: [projetoB] });

    const primeira = (await (await client.get(url("?per_page=2&cursor=2:0:0"))).json()) as any;
    expect(primeira.results).toHaveLength(2);
    expect(primeira.results[0].provider).toBe("json");
    expect(primeira.results[1].provider).toBe("xlsx");
    expect(primeira.next_page_results).toBe(true);
    expect(primeira.count).toBe(2);
    expect(primeira.total_pages).toBe(2);

    const segunda = (await (await client.get(url(`?cursor=${primeira.next_cursor}`))).json()) as any;
    expect(segunda.results).toHaveLength(1);
    expect(segunda.results[0].provider).toBe("csv");
    expect(segunda.next_page_results).toBe(false);
    expect(segunda.prev_page_results).toBe(true);
    expect(segunda.total_count).toBe(primeira.total_count);
  });

  it("formato não suportado é recusado com 400", async () => {
    const res = await exportar({ provider: "pdf", project: [projetoA] });
    expect(res.status).toBe(400);
  });

  it("exportação sem projeto explícito não quebra a listagem", async () => {
    expect((await exportar({ provider: "csv" })).status).toBe(201);
    const data = (await (await client.get(url())).json()) as any;
    expect(data.results[0].project).toEqual([]);
  });

  it("o histórico de outro espaço de trabalho não vaza", async () => {
    const outro = (await (await outroClient.get(`/workspaces/${outroSlug}/export-issues/`)).json()) as any;
    expect(outro.results).toEqual([]);
    expect(outro.total_count).toBe(0);
  });

  it("quem não é do espaço de trabalho recebe 403", async () => {
    const estranho = await createUser({ email: "export-estranho@plane.test" });
    const estranhoClient = apiClient((await createApiToken(estranho.id)).token);
    expect((await estranhoClient.get(url())).status).toBe(403);
  });

  it("membro comum enxerga o histórico do espaço de trabalho", async () => {
    const { token } = await createMemberWithToken(wsId, 15);
    const membro = apiClient(token);
    const res = await membro.get(url());
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).results.length).toBeGreaterThan(0);
  });
});
