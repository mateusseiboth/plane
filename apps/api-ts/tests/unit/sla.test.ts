/**
 * SLA — a data de vencimento automática vem do maior slaHours entre as labels do
 * chamado, ajustado pela prioridade (Instance.configurations.priority_sla).
 * Sem label com SLA não há prazo automático (retorna null).
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {createLabel, createProject, createUser, createWorkspace} from "@tests/helpers/factory";
import {computeTargetDate, getPrioritySla, invalidatePrioritySlaCache} from "@utils/sla";

const HOUR = 60 * 60 * 1000;
const BASE = new Date("2026-04-01T12:00:00.000Z");

describe("SLA", () => {
  let workspaceId: string;
  let projectId: string;
  let correcao: string; // 16h
  let melhoria: string; // 96h
  let semSla: string;

  beforeAll(async () => {
    await cleanDb();
    invalidatePrioritySlaCache();
    const user = await createUser();
    const ws = await createWorkspace(user.id);
    workspaceId = ws.id;
    projectId = (await createProject(ws.id, user.id)).id;
    correcao = (await createLabel(projectId, workspaceId, {name: "Correção", slaHours: 16})).id;
    melhoria = (await createLabel(projectId, workspaceId, {name: "Melhoria", slaHours: 96})).id;
    semSla = (await createLabel(projectId, workspaceId, {name: "Projeto", slaHours: null})).id;
  });

  afterAll(async () => {
    invalidatePrioritySlaCache();
    await cleanDb();
  });

  describe("getPrioritySla", () => {
    it("usa os ajustes padrão quando não há Instance configurada", async () => {
      invalidatePrioritySlaCache();
      const sla = await getPrioritySla();
      expect(sla).toEqual({urgent: -8, high: -4, medium: 0, low: 8, none: 0});
    });

    it("responde do cache na segunda chamada", async () => {
      const first = await getPrioritySla();
      const second = await getPrioritySla();
      expect(second).toBe(first);
    });

    it("mescla o que a instância define por cima dos padrões", async () => {
      await prisma.instance.create({
        data: {instanceName: "Teste SLA", instanceId: `sla-${Date.now()}`, configurations: {priority_sla: {urgent: -24}}},
      });
      invalidatePrioritySlaCache();
      const sla = await getPrioritySla();
      expect(sla.urgent).toBe(-24);
      expect(sla.low).toBe(8); // preservado do padrão
      await prisma.instance.deleteMany();
      invalidatePrioritySlaCache();
    });

    it("ignora priority_sla que não é objeto", async () => {
      await prisma.instance.create({
        data: {instanceName: "Teste SLA 2", instanceId: `sla2-${Date.now()}`, configurations: {priority_sla: "nada"}},
      });
      invalidatePrioritySlaCache();
      expect(await getPrioritySla()).toEqual({urgent: -8, high: -4, medium: 0, low: 8, none: 0});
      await prisma.instance.deleteMany();
      invalidatePrioritySlaCache();
    });
  });

  describe("computeTargetDate", () => {
    it("devolve null sem labels", async () => {
      expect(await computeTargetDate([], "high", BASE)).toBeNull();
    });

    it("devolve null quando nenhuma label tem SLA", async () => {
      expect(await computeTargetDate([semSla], "high", BASE)).toBeNull();
    });

    it("usa o maior SLA entre as labels do chamado", async () => {
      const d = await computeTargetDate([correcao, melhoria, semSla], "medium", BASE);
      expect(d!.getTime()).toBe(BASE.getTime() + 96 * HOUR);
    });

    it("encurta o prazo em prioridade alta/urgente", async () => {
      const urgente = await computeTargetDate([correcao], "urgent", BASE);
      expect(urgente!.getTime()).toBe(BASE.getTime() + (16 - 8) * HOUR);
      const alta = await computeTargetDate([correcao], "high", BASE);
      expect(alta!.getTime()).toBe(BASE.getTime() + (16 - 4) * HOUR);
    });

    it("estende o prazo em prioridade baixa", async () => {
      const baixa = await computeTargetDate([correcao], "low", BASE);
      expect(baixa!.getTime()).toBe(BASE.getTime() + (16 + 8) * HOUR);
    });

    it("trata prioridade nula/desconhecida como sem ajuste", async () => {
      const nula = await computeTargetDate([correcao], null, BASE);
      expect(nula!.getTime()).toBe(BASE.getTime() + 16 * HOUR);
      const estranha = await computeTargetDate([correcao], "inexistente", BASE);
      expect(estranha!.getTime()).toBe(BASE.getTime() + 16 * HOUR);
    });

    it("nunca produz prazo anterior à base (ajuste negativo maior que o SLA)", async () => {
      const curta = await createLabel(projectId, workspaceId, {name: "SLA curto", slaHours: 2});
      const d = await computeTargetDate([curta.id], "urgent", BASE);
      expect(d!.getTime()).toBe(BASE.getTime());
    });

    it("ignora ids de label inexistentes", async () => {
      const d = await computeTargetDate(["00000000-0000-0000-0000-000000000000"], "none", BASE);
      expect(d).toBeNull();
    });
  });
});
