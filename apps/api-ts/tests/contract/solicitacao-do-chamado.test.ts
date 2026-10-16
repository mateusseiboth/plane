/**
 * O GET de um chamado traz a solicitação de que ele nasceu (`solicitacao`): quem
 * abriu, quando, de onde, entidade, módulo, prioridade pedida e o texto
 * original. Vale nas duas rotas de detalhe (por id e por identificador). As
 * listagens não carregam esse bloco.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createEntity,
  createIssue,
  createModule,
  createProject,
  createUser,
  createWorkspace,
  ensureIntake,
} from "@tests/helpers/factory";

let wsSlug: string;
let wsId: string;
let projetoId: string;
let api: ReturnType<typeof apiClient>;

const detalhe = async (issueId: string) =>
  (await (await api.get(`/workspaces/${wsSlug}/projects/${projetoId}/issues/${issueId}/`)).json()) as any;

const linkSolicitacao = async (issueId: string, extra: Partial<{ source: string; createdAt: Date }> = {}) => {
  const intake = await ensureIntake(projetoId, wsId);
  return prisma.intakeIssue.create({
    data: { intakeId: intake.id, issueId, projectId: projetoId, workspaceId: wsId, status: 1, ...extra },
  });
};

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser({ displayName: "Carla Atendimento" });
  const ws = await createWorkspace(dono.id);
  wsSlug = ws.slug;
  wsId = ws.id;
  projetoId = (await createProject(wsId, dono.id, { identifier: "FOLHA" })).id;
  api = apiClient((await createApiToken(dono.id)).token);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("solicitação de origem no detalhe do chamado", () => {
  it("chamado editado mostra o texto, o título e a prioridade de quando foi pedido", async () => {
    const dono = await prisma.user.findFirstOrThrow({ where: { displayName: "Carla Atendimento" } });
    const entidade = await createEntity(wsId, { name: "Câmara de Sorocaba" });
    const modulo = await createModule(projetoId, wsId, { name: "Holerite" });
    const chamado = await createIssue(projetoId, wsId, {
      name: "Holerite sai em branco (editado)",
      sequenceId: 1,
      priority: "low",
      entityId: entidade.id,
      createdById: dono.id,
    });
    await prisma.issue.update({ where: { id: chamado.id }, data: { descriptionHtml: "<p>reescrito</p>" } });
    await prisma.moduleIssue.create({
      data: { moduleId: modulo.id, issueId: chamado.id, projectId: projetoId, workspaceId: wsId },
    });
    await prisma.issueVersion.createMany({
      data: [
        { lastSavedAt: new Date("2026-05-02T00:00:00Z"), descriptionHtml: "<p>segunda</p>", name: "Segunda" },
        {
          lastSavedAt: new Date("2026-05-01T00:00:00Z"),
          descriptionHtml: "<p>como o cliente pediu</p>",
          name: "Holerite sai em branco",
        },
      ].map((v) => Object.assign(v, { issueId: chamado.id, projectId: projetoId, workspaceId: wsId })),
    });
    await prisma.issueActivity.createMany({
      data: [
        { field: "priority", oldValue: "urgent", newValue: "high", createdAt: new Date("2026-05-01T00:00:00Z") },
        { field: "priority", oldValue: "high", newValue: "low", createdAt: new Date("2026-05-03T00:00:00Z") },
      ].map((a) => Object.assign(a, { issueId: chamado.id, projectId: projetoId, workspaceId: wsId, verb: "updated" })),
    });
    const abertaEm = new Date("2026-04-30T13:00:00.000Z");
    const vinculo = await linkSolicitacao(chamado.id, { createdAt: abertaEm });

    expect((await detalhe(chamado.id)).solicitacao).toEqual({
      id: vinculo.id,
      aberta_em: abertaEm.toISOString(),
      aberta_por: "Carla Atendimento",
      origem: "app",
      entidade: "Câmara de Sorocaba",
      modulo: "Holerite",
      prioridade: "urgent",
      titulo: "Holerite sai em branco",
      descricao_html: "<p>como o cliente pediu</p>",
      is_texto_atual: false,
    });
  });

  it("sem versão, o texto atual é o original e o painel é avisado", async () => {
    const chamado = await createIssue(projetoId, wsId, { name: "Nunca editado", sequenceId: 2, priority: "high" });
    await prisma.issue.update({ where: { id: chamado.id }, data: { descriptionHtml: "<p>original</p>" } });
    await linkSolicitacao(chamado.id, { source: "portal" });

    const res = await api.get(`/workspaces/${wsSlug}/work-items/FOLHA-2/`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).solicitacao).toMatchObject({
      origem: "portal",
      prioridade: "high",
      titulo: "Nunca editado",
      descricao_html: "<p>original</p>",
      is_texto_atual: true,
    });
  });

  it("chamado que não nasceu de solicitação traz solicitacao nula", async () => {
    const chamado = await createIssue(projetoId, wsId, { name: "Direto", sequenceId: 3 });
    expect((await detalhe(chamado.id)).solicitacao).toBeNull();
  });

  it("solicitação apagada não conta", async () => {
    const chamado = await createIssue(projetoId, wsId, { name: "Apagada", sequenceId: 4 });
    const vinculo = await linkSolicitacao(chamado.id);
    await prisma.intakeIssue.update({ where: { id: vinculo.id }, data: { deletedAt: new Date() } });
    expect((await detalhe(chamado.id)).solicitacao).toBeNull();
  });

  it("a listagem não carrega o bloco", async () => {
    const res = await api.get(`/workspaces/${wsSlug}/projects/${projetoId}/issues/`);
    const [primeiro] = ((await res.json()) as any).results;
    expect(primeiro).not.toHaveProperty("solicitacao");
    expect(primeiro).not.toHaveProperty("moved_to_issue");
  });
});
