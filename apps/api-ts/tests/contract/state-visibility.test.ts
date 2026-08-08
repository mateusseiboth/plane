/**
 * Visibilidade x movimentação.
 *
 * Regra nova do produto: **quem participa do projeto vê todos os chamados, em
 * qualquer etapa**. O recorte por setor virou filtro (templates prontos na UI),
 * não regra de visibilidade — antes o TI simplesmente não recebia da API o que
 * estivesse em Triagem, e a Qualidade não via "Em Desenvolvimento".
 *
 * O que o papel ainda controla é para onde ele pode MOVER um chamado.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createProject, createUser, createWorkspace } from "@tests/helpers/factory";

/** Etapas do fluxo pt-BR, uma por grupo relevante. */
const ETAPAS = [
  { name: "Triagem", group: "triage", sequence: 5000, isTriage: true },
  { name: "A Fazer", group: "unstarted", sequence: 15000 },
  { name: "Em Análise", group: "started", sequence: 20000 },
  { name: "Em Desenvolvimento", group: "started", sequence: 25000 },
  { name: "Em Teste", group: "started", sequence: 30000 },
  { name: "Concluído", group: "completed", sequence: 40000 },
];

describe("TestStateVisibilityAndTransitions", () => {
  let wsSlug: string;
  let wsId: string;
  let projectId: string;
  const stateIdByName = new Map<string, string>();
  const clientByRole = new Map<number, ReturnType<typeof apiClient>>();

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser({ email: "vis-owner@plane.test" });
    const ws = await createWorkspace(owner.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    const project = await createProject(ws.id, owner.id);
    projectId = project.id;

    // Substitui os estados genéricos da factory pelo fluxo real do fork.
    await prisma.state.deleteMany({ where: { projectId } });
    for (const etapa of ETAPAS) {
      const state = await prisma.state.create({
        data: {
          projectId,
          workspaceId: ws.id,
          name: etapa.name,
          group: etapa.group,
          sequence: etapa.sequence,
          isTriage: etapa.isTriage ?? false,
          color: "#111111",
          slug: etapa.name.toLowerCase().replace(/\s+/g, "-"),
        },
      });
      stateIdByName.set(etapa.name, state.id);
    }

    await seedWorkflowRoles(prisma, ws.id);

    // Um chamado em CADA etapa, para provar que todas aparecem na listagem.
    for (const etapa of ETAPAS) {
      await prisma.issue.create({
        data: {
          projectId,
          workspaceId: ws.id,
          name: `Chamado em ${etapa.name}`,
          stateId: stateIdByName.get(etapa.name)!,
          sequenceId: etapa.sequence,
        },
      });
    }

    // Um usuário por papel restrito (Atendimento 6, Qualidade 8, TI 12).
    for (const role of [6, 8, 12]) {
      const user = await createUser({ email: `vis-role-${role}@plane.test` });
      await prisma.workspaceMember.create({ data: { workspaceId: ws.id, memberId: user.id, role, isActive: true } });
      await prisma.projectMember.create({
        data: { projectId, workspaceId: ws.id, memberId: user.id, role, isActive: true },
      });
      clientByRole.set(role, apiClient((await createApiToken(user.id)).token));
    }
  });

  afterAll(() => cleanDb());

  const issuesUrl = () => `/workspaces/${wsSlug}/projects/${projectId}/issues/`;

  describe("todos veem todas as etapas", () => {
    for (const [papel, role] of [
      ["Atendimento", 6],
      ["Qualidade", 8],
      ["TI", 12],
    ] as const) {
      it(`${papel} recebe chamados de todas as ${ETAPAS.length} etapas`, async () => {
        const res = await clientByRole.get(role)!.get(issuesUrl());
        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.total_count).toBe(ETAPAS.length);

        const vistos = new Set(data.results.map((i: any) => i.state_id));
        for (const etapa of ETAPAS) {
          expect(vistos.has(stateIdByName.get(etapa.name))).toBe(true);
        }
      });
    }

    it("TI enxerga a Triagem — era exatamente o que a regra antiga escondia", async () => {
      const res = await clientByRole.get(12)!.get(`${issuesUrl()}?state_id=${stateIdByName.get("Triagem")}`);
      const data = (await res.json()) as any;
      expect(data.total_count).toBe(1);
      expect(data.results[0].name).toBe("Chamado em Triagem");
    });

    it("Qualidade enxerga Em Desenvolvimento — idem", async () => {
      const res = await clientByRole
        .get(8)!
        .get(`${issuesUrl()}?state_id=${stateIdByName.get("Em Desenvolvimento")}`);
      const data = (await res.json()) as any;
      expect(data.total_count).toBe(1);
    });
  });

  describe("mover entre etapas continua restrito ao papel", () => {
    /** Cria um chamado numa etapa e tenta movê-lo para outra com o papel dado. */
    async function tentarMover(role: number, de: string, para: string) {
      const issue = await prisma.issue.create({
        data: {
          projectId,
          workspaceId: wsId,
          name: `Mover ${de} → ${para} (${role})`,
          stateId: stateIdByName.get(de)!,
          sequenceId: 90000 + role,
        },
      });
      const res = await clientByRole
        .get(role)!
        .patch(`${issuesUrl()}${issue.id}/`, { state_id: stateIdByName.get(para) });
      return res.status;
    }

    it("TI move A Fazer → Em Desenvolvimento", async () => {
      expect(await tentarMover(12, "A Fazer", "Em Desenvolvimento")).toBe(200);
    });

    it("TI NÃO tira um chamado da Triagem (é papel da Qualidade)", async () => {
      expect(await tentarMover(12, "Triagem", "A Fazer")).toBe(403);
    });

    it("Qualidade move Triagem → A Fazer", async () => {
      expect(await tentarMover(8, "Triagem", "A Fazer")).toBe(200);
    });

    it("Atendimento não move chamado nenhum", async () => {
      expect(await tentarMover(6, "Triagem", "A Fazer")).toBe(403);
    });
  });
});
