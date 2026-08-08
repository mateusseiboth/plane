/**
 * Analytics avançada.
 *
 * A tela de Análises sempre chamou `advance-analytics`, `-charts` e `-stats`;
 * como o backend não tinha essas rotas, ela abria com TODOS os contadores em
 * zero e os gráficos vazios — sem erro visível, porque o serviço engole a falha.
 * Estes testes fixam os três contratos.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createProject, createUser, createWorkspace } from "@tests/helpers/factory";

const ETAPAS = [
  { name: "Triagem", group: "triage", sequence: 5000 },
  { name: "A Fazer", group: "unstarted", sequence: 15000 },
  { name: "Em Desenvolvimento", group: "started", sequence: 25000 },
  { name: "Concluído", group: "completed", sequence: 40000 },
];

describe("TestAdvanceAnalytics", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;
  let outroProjetoId: string;
  const etapa = new Map<string, string>();

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser({ email: "analytics-owner@plane.test" });
    const ws = await createWorkspace(owner.id);
    wsSlug = ws.slug;
    client = apiClient((await createApiToken(owner.id)).token);

    const projeto = await createProject(ws.id, owner.id);
    projectId = projeto.id;
    const outro = await createProject(ws.id, owner.id, { name: "Outro", identifier: "OUT" });
    outroProjetoId = outro.id;

    await prisma.state.deleteMany({ where: { projectId } });
    for (const e of ETAPAS) {
      const state = await prisma.state.create({
        data: {
          projectId,
          workspaceId: ws.id,
          name: e.name,
          group: e.group,
          sequence: e.sequence,
          color: "#111111",
          slug: e.name.toLowerCase().replace(/\s+/g, "-"),
        },
      });
      etapa.set(e.name, state.id);
    }

    // 4 chamados no projeto principal: um por etapa, prioridades distintas.
    const prioridades = ["urgent", "high", "low", "low"];
    for (const [i, e] of ETAPAS.entries()) {
      await prisma.issue.create({
        data: {
          projectId,
          workspaceId: ws.id,
          name: `Chamado ${e.name}`,
          stateId: etapa.get(e.name)!,
          priority: prioridades[i],
          sequenceId: 1000 + i,
          ...(e.group === "completed" ? { completedAt: new Date() } : {}),
        },
      });
    }
    // 1 chamado no outro projeto, para provar que o filtro por projeto recorta.
    await prisma.issue.create({
      data: { projectId: outroProjetoId, workspaceId: ws.id, name: "De outro projeto", sequenceId: 1 },
    });
  });

  afterAll(() => cleanDb());

  const url = (caminho: string) => `/workspaces/${wsSlug}/${caminho}`;

  describe("GET /advance-analytics", () => {
    it("a visão geral conta o que existe no espaço de trabalho", async () => {
      const res = await client.get(url("advance-analytics?tab=overview"));
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      // Os cartões leem `campo.count`, não um número solto.
      expect(data.total_work_items).toEqual({ count: 5, filter_count: 5 });
      expect(data.total_projects.count).toBe(2);
      expect(data.total_users.count).toBeGreaterThanOrEqual(1);
      // Todo mundo cai em exatamente um balde de papel.
      expect(data.total_admins.count + data.total_members.count + data.total_guests.count).toBe(data.total_users.count);
    });

    it("a aba de chamados separa por grupo de etapa", async () => {
      const data = (await (await client.get(url("advance-analytics?tab=work-items"))).json()) as any;
      expect(data.total_work_items.count).toBe(5);
      expect(data.started_work_items.count).toBe(1);
      expect(data.completed_work_items.count).toBe(1);
      expect(data.un_started_work_items.count).toBe(1);
      expect(data.backlog_work_items.count).toBe(1); // Triagem entra em "backlog"
    });

    it("project_ids recorta os contadores", async () => {
      const data = (await (
        await client.get(url(`advance-analytics?tab=overview&project_ids=${outroProjetoId}`))
      ).json()) as any;
      expect(data.total_work_items.count).toBe(1);
    });
  });

  describe("GET /advance-analytics-charts", () => {
    it("type=projects devolve um ponto por projeto", async () => {
      const data = (await (await client.get(url("advance-analytics-charts?type=projects"))).json()) as any[];
      expect(Array.isArray(data)).toBe(true);
      const porNome = new Map(data.map((d) => [d.name, d.count]));
      expect(porNome.get("Outro")).toBe(1);
      expect([...porNome.values()].reduce((a, b) => a + b, 0)).toBe(5);
      // O radar só aguenta uma dezena de eixos.
      expect(data.length).toBeLessThanOrEqual(10);
      // O radar espera exatamente estas três chaves.
      expect(Object.keys(data[0]).sort()).toEqual(["count", "key", "name"]);
    });

    it("type=work-items devolve a série de criados x resolvidos", async () => {
      const data = (await (await client.get(url("advance-analytics-charts?type=work-items"))).json()) as any;
      expect(Object.keys(data.schema).sort()).toEqual(["completed_issues", "created_issues"]);
      expect(data.data.length).toBeGreaterThan(0);
      const criados = data.data.reduce((soma: number, d: any) => soma + d.created_issues, 0);
      expect(criados).toBe(5);
    });

    it("custom-work-items agrupa por prioridade, em português e do maior para o menor", async () => {
      const data = (await (
        await client.get(url("advance-analytics-charts?type=custom-work-items&x_axis=PRIORITY&y_axis=WORK_ITEM_COUNT"))
      ).json()) as any;
      expect(data.schema).toEqual({ count: "Quantidade" });
      expect(data.data[0]).toEqual({ key: "low", name: "Baixa", count: 2 });
      const contagens = data.data.map((d: any) => d.count);
      expect([...contagens].sort((a: number, b: number) => b - a)).toEqual(contagens);
    });

    it("o eixo Y recorta o conjunto contado", async () => {
      const data = (await (
        await client.get(
          url("advance-analytics-charts?type=custom-work-items&x_axis=PRIORITY&y_axis=COMPLETED_WORK_ITEM_COUNT"),
        )
      ).json()) as any;
      expect(data.data.reduce((s: number, d: any) => s + d.count, 0)).toBe(1);
    });

    it("um eixo X desconhecido cai na prioridade em vez de estourar", async () => {
      const res = await client.get(url("advance-analytics-charts?type=custom-work-items&x_axis=INVENTADO"));
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.data.length).toBeGreaterThan(0);
    });

    it("agrupa por grupo de etapa", async () => {
      const data = (await (
        await client.get(url("advance-analytics-charts?type=custom-work-items&x_axis=STATE_GROUPS"))
      ).json()) as any;
      const porGrupo = new Map(data.data.map((d: any) => [d.key, d.count]));
      expect(porGrupo.get("completed")).toBe(1);
      expect(porGrupo.get("started")).toBe(1);
    });
  });

  describe("GET /advance-analytics-stats", () => {
    it("uma linha por projeto, com as colunas que a tabela consome", async () => {
      const linhas = (await (await client.get(url("advance-analytics-stats?type=work-items"))).json()) as any[];
      expect(linhas.length).toBe(2);
      const principal = linhas.find((l) => l.project_id === projectId)!;
      expect(principal.completed_work_items).toBe(1);
      expect(principal.started_work_items).toBe(1);
      expect(principal.un_started_work_items).toBe(1);
      expect(principal.project__name).toBeDefined();
    });

    it("dentro de um projeto, agrupa por responsável", async () => {
      const res = await client.get(`/workspaces/${wsSlug}/projects/${projectId}/advance-analytics-stats?type=work-items`);
      expect(res.status).toBe(200);
      expect(await res.json()).toBeInstanceOf(Array);
    });
  });

  it("exige autenticação", async () => {
    const res = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:8011"}/api/v1${url("advance-analytics")}`);
    expect(res.status).toBe(401);
  });
});
