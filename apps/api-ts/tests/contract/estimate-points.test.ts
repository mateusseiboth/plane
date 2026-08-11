/**
 * Pontos de estimativa.
 *
 * O chamado sempre teve o campo `estimate_point` no tipo compartilhado
 * (`IIssue`), mas o backend devolvia `null` fixo, não aceitava o campo na
 * criação/edição, não sabia ordenar por `estimate_point__key`, o analytics
 * ignorava `?type=points` e as distribuições de módulo (`*_estimate_points`)
 * eram zeros literais. Estes testes fixam os quatro contratos.
 *
 * `EstimatePoint.value` é texto: uma escala pode ser categórica ("P"/"M"/"G").
 * Só o que for número entra na soma — o resto vale zero, nunca NaN.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createProject, createUser, createWorkspace } from "@tests/helpers/factory";

describe("TestEstimatePoints", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let projetoId: string; // fixture de leitura (analytics, módulo, ordenação)
  let projetoMutavelId: string; // onde POST/PATCH podem mexer à vontade
  let projetoAlheioId: string;

  const ponto = new Map<string, string>(); // rótulo → id do EstimatePoint
  const chamado = new Map<string, string>(); // apelido → id do chamado
  const etapa = new Map<string, string>(); // grupo → id da etapa

  /** Cria uma estimativa com seus pontos e indexa os ids por rótulo. */
  async function criarEstimativa(projectId: string, nome: string, tipo: string, pontos: Array<[number, string]>) {
    const estimativa = await prisma.estimate.create({
      data: { workspaceId: wsId, projectId, name: nome, type: tipo },
    });
    for (const [key, value] of pontos) {
      const criado = await prisma.estimatePoint.create({
        data: { estimateId: estimativa.id, workspaceId: wsId, projectId, key, value },
      });
      ponto.set(`${nome}:${value}`, criado.id);
    }
    return estimativa;
  }

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser({ email: "estimativa-dono@plane.test" });
    const ws = await createWorkspace(dono.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    client = apiClient((await createApiToken(dono.id)).token);

    projetoId = (await createProject(ws.id, dono.id, { name: "Principal", identifier: "PRI" })).id;
    projetoMutavelId = (await createProject(ws.id, dono.id, { name: "Mutável", identifier: "MUT" })).id;
    projetoAlheioId = (await createProject(ws.id, dono.id, { name: "Alheio", identifier: "ALH" })).id;

    const etapas = await prisma.state.findMany({ where: { projectId: projetoId, deletedAt: null } });
    for (const e of etapas) etapa.set(e.group, e.id);

    // Escala numérica e escala por categoria, no mesmo projeto.
    await criarEstimativa(projetoId, "Pontos", "points", [
      [0, "1"],
      [1, "3"],
      [2, "5"],
    ]);
    await criarEstimativa(projetoId, "Camisas", "categories", [
      [5, "M"],
      [6, "G"],
    ]);
    await criarEstimativa(projetoMutavelId, "Pontos", "points", [
      [0, "2"],
      [1, "8"],
    ]);
    await criarEstimativa(projetoAlheioId, "Pontos", "points", [[0, "13"]]);

    // Fixture do projeto principal: 5 pontos concluídos, 3 em andamento,
    // 1 no backlog, uma categoria (vale 0) e um chamado sem estimativa.
    const fixtures: Array<[string, string, string | null]> = [
      ["concluido", "completed", "Pontos:5"],
      ["andamento", "started", "Pontos:3"],
      ["backlog", "backlog", "Pontos:1"],
      ["categoria", "backlog", "Camisas:M"],
      ["sem_estimativa", "backlog", null],
    ];
    for (const [apelido, grupo, rotulo] of fixtures) {
      const criado = await prisma.issue.create({
        data: {
          projectId: projetoId,
          workspaceId: wsId,
          name: `Chamado ${apelido}`,
          stateId: etapa.get(grupo)!,
          sequenceId: chamado.size + 1,
          estimatePointId: rotulo ? ponto.get(rotulo)! : null,
          ...(grupo === "completed" ? { completedAt: new Date() } : {}),
        },
      });
      chamado.set(apelido, criado.id);
    }
  });

  afterAll(() => cleanDb());

  const urlChamados = (projectId: string) => `/workspaces/${wsSlug}/projects/${projectId}/issues/`;

  // ── Chamado ───────────────────────────────────────────────────────────────

  describe("chamado", () => {
    it("grava e devolve o ponto de estimativa na criação", async () => {
      const res = await client.post(urlChamados(projetoMutavelId), {
        name: "Nasce estimado",
        estimate_point: ponto.get("Pontos:2"),
      });
      expect(res.status).toBe(201);
      const criado = (await res.json()) as any;
      expect(criado.estimate_point).toBe(ponto.get("Pontos:2"));

      // E continua lá na leitura — não é só eco do corpo enviado.
      const detalhe = (await (await client.get(`${urlChamados(projetoMutavelId)}${criado.id}`)).json()) as any;
      expect(detalhe.estimate_point).toBe(ponto.get("Pontos:2"));
    });

    it("recusa, na criação, um ponto de outro projeto", async () => {
      const res = await client.post(urlChamados(projetoMutavelId), {
        name: "Ponto emprestado",
        estimate_point: ponto.get("Pontos:13"),
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as any).detail).toContain("estimativa");
    });

    it("troca o ponto na edição e registra no histórico", async () => {
      const criado = (await (
        await client.post(urlChamados(projetoMutavelId), { name: "Reestimado" })
      ).json()) as any;
      expect(criado.estimate_point).toBeNull();

      const res = await client.patch(`${urlChamados(projetoMutavelId)}${criado.id}`, {
        estimate_point: ponto.get("Pontos:8"),
      });
      expect(res.status).toBe(200);
      expect(((await res.json()) as any).estimate_point).toBe(ponto.get("Pontos:8"));

      const historico = (await (
        await client.get(`${urlChamados(projetoMutavelId)}${criado.id}/history/?activity_type=issue-property`)
      ).json()) as any[];
      // O front lê `estimate_${tipo}` (activity-list.tsx) e mostra o rótulo do
      // ponto, não o uuid.
      const atividade = historico.find((a) => a.field === "estimate_points");
      expect(atividade).toBeDefined();
      expect(atividade.new_value).toBe("8");
      expect(atividade.old_value).toBeNull();
    });

    it("limpa o ponto com null e registra a remoção", async () => {
      const criado = (await (
        await client.post(urlChamados(projetoMutavelId), { name: "Desestimado", estimate_point: ponto.get("Pontos:2") })
      ).json()) as any;

      const res = await client.patch(`${urlChamados(projetoMutavelId)}${criado.id}`, { estimate_point: null });
      expect(res.status).toBe(200);
      expect(((await res.json()) as any).estimate_point).toBeNull();

      const historico = (await (
        await client.get(`${urlChamados(projetoMutavelId)}${criado.id}/history/?activity_type=issue-property`)
      ).json()) as any[];
      const remocao = historico.find((a) => a.field === "estimate_points" && a.verb === "removed");
      expect(remocao).toBeDefined();
      expect(remocao.old_value).toBe("2");
      expect(remocao.new_value).toBeNull();
    });

    it("recusa, na edição, um ponto de outro projeto e não mexe no valor atual", async () => {
      const criado = (await (
        await client.post(urlChamados(projetoMutavelId), { name: "Intocado", estimate_point: ponto.get("Pontos:2") })
      ).json()) as any;

      const res = await client.patch(`${urlChamados(projetoMutavelId)}${criado.id}`, {
        estimate_point: ponto.get("Pontos:13"),
      });
      expect(res.status).toBe(400);

      const detalhe = (await (await client.get(`${urlChamados(projetoMutavelId)}${criado.id}`)).json()) as any;
      expect(detalhe.estimate_point).toBe(ponto.get("Pontos:2"));
    });
  });

  // ── Ordenação ─────────────────────────────────────────────────────────────

  describe("ordenação", () => {
    /** Ids dos chamados estimados, na ordem em que a listagem os devolveu. */
    const estimados = async (ordem: string) => {
      const page = (await (await client.get(`${urlChamados(projetoId)}?order_by=${ordem}`)).json()) as any;
      const comPonto = new Set([
        chamado.get("backlog"),
        chamado.get("andamento"),
        chamado.get("concluido"),
        chamado.get("categoria"),
      ]);
      return page.results.map((i: any) => i.id).filter((id: string) => comPonto.has(id));
    };

    it("order_by=estimate_point__key segue a escala, não o rótulo", async () => {
      // Ordem da escala: 1 (key 0) · 3 (key 1) · 5 (key 2) · M (key 5).
      expect(await estimados("estimate_point__key")).toEqual([
        chamado.get("backlog"),
        chamado.get("andamento"),
        chamado.get("concluido"),
        chamado.get("categoria"),
      ]);
    });

    it("-estimate_point__key inverte", async () => {
      expect(await estimados("-estimate_point__key")).toEqual([
        chamado.get("categoria"),
        chamado.get("concluido"),
        chamado.get("andamento"),
        chamado.get("backlog"),
      ]);
    });
  });

  // ── Analytics ─────────────────────────────────────────────────────────────

  describe("analytics", () => {
    const url = (caminho: string) => `/workspaces/${wsSlug}/${caminho}&project_ids=${projetoId}`;

    it("tab=work-items&type=points soma os pontos em vez de contar chamados", async () => {
      const data = (await (await client.get(url("advance-analytics?tab=work-items&type=points"))).json()) as any;
      expect(data.total_work_items.count).toBe(9); // 5 + 3 + 1 + categoria (0)
      expect(data.completed_work_items.count).toBe(5);
      expect(data.started_work_items.count).toBe(3);
      expect(data.backlog_work_items.count).toBe(1);
      expect(data.un_started_work_items.count).toBe(0);
    });

    it("sem type=points continua contando chamados", async () => {
      const data = (await (await client.get(url("advance-analytics?tab=work-items"))).json()) as any;
      expect(data.total_work_items.count).toBe(5);
      expect(data.backlog_work_items.count).toBe(3);
    });

    it("charts com type=points soma por grupo de etapa", async () => {
      const data = (await (await client.get(url("advance-analytics-charts?type=points&x_axis=STATE_GROUPS"))).json()) as any;
      expect(data.schema).toEqual({ count: "Pontos" });
      const porGrupo = new Map(data.data.map((d: any) => [d.key, d.count]));
      expect(porGrupo.get("completed")).toBe(5);
      expect(porGrupo.get("started")).toBe(3);
      expect(porGrupo.get("backlog")).toBe(1); // a categoria "M" não vira ponto
    });

    it("y_axis=ESTIMATE_POINT_COUNT pede a mesma soma", async () => {
      const data = (await (
        await client.get(url("advance-analytics-charts?type=custom-work-items&x_axis=STATE_GROUPS&y_axis=ESTIMATE_POINT_COUNT"))
      ).json()) as any;
      expect(data.schema).toEqual({ count: "Pontos" });
      expect(data.data.reduce((s: number, d: any) => s + d.count, 0)).toBe(9);
    });

    it("x_axis=ESTIMATE_POINTS agrupa pelos pontos da escala", async () => {
      const data = (await (
        await client.get(url("advance-analytics-charts?type=custom-work-items&x_axis=ESTIMATE_POINTS"))
      ).json()) as any;
      const porRotulo = new Map(data.data.map((d: any) => [d.name, d.count]));
      // Um chamado em cada ponto usado; o sem estimativa cai em "none".
      expect(porRotulo.get("5")).toBe(1);
      expect(porRotulo.get("M")).toBe(1);
    });

    it("stats com type=points devolve as colunas em pontos", async () => {
      const linhas = (await (await client.get(url("advance-analytics-stats?type=points"))).json()) as any[];
      const principal = linhas.find((l) => l.project_id === projetoId)!;
      expect(principal.completed_work_items).toBe(5);
      expect(principal.started_work_items).toBe(3);
      expect(principal.backlog_work_items).toBe(1);
    });
  });

  // ── Módulo ────────────────────────────────────────────────────────────────

  describe("distribuição do módulo", () => {
    it("*_estimate_points somam de verdade", async () => {
      const base = `/workspaces/${wsSlug}/projects/${projetoId}/modules/`;
      const modulo = (await (await client.post(base, { name: "Entrega 1" })).json()) as any;
      const vinculo = await client.post(`${base}${modulo.id}/issues/`, { issues: [...chamado.values()] });
      expect(vinculo.status).toBe(201);

      const detalhe = (await (await client.get(`${base}${modulo.id}/`)).json()) as any;
      expect(detalhe.total_issues).toBe(5);
      expect(detalhe.completed_issues).toBe(1);

      expect(detalhe.total_estimate_points).toBe(9);
      expect(detalhe.completed_estimate_points).toBe(5);
      expect(detalhe.started_estimate_points).toBe(3);
      expect(detalhe.backlog_estimate_points).toBe(1);
      expect(detalhe.unstarted_estimate_points).toBe(0);
      expect(detalhe.cancelled_estimate_points).toBe(0);
    });

    it("módulo vazio continua com tudo zerado", async () => {
      const base = `/workspaces/${wsSlug}/projects/${projetoId}/modules/`;
      const modulo = (await (await client.post(base, { name: "Entrega vazia" })).json()) as any;
      expect(modulo.total_estimate_points).toBe(0);
      expect(modulo.completed_estimate_points).toBe(0);
    });
  });
});
