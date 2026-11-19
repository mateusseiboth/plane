/**
 * Solicitação a partir da ouvidoria (testes da nova intranet 3, 19/11/2026):
 * quem tem `ouvidoria.criar_solicitacao` (por padrão, quem lê a ouvidoria) cria
 * a solicitação e atribui alguém do Atendimento. Ela nasce No atendimento e
 * pode virar chamado (encaminhar) ou morrer ali (encerrar); a ouvidoria mostra
 * o processo todo.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createEntity,
  createMemberWithToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

let wsId: string;
let slug: string;
let projetoId: string;
let entidadeId: string;
let gestor: ReturnType<typeof apiClient>;
let atendente: { user: { id: string }; api: ReturnType<typeof apiClient> };
let ti: { user: { id: string }; api: ReturnType<typeof apiClient> };

const createPessoa = async (key: string) => {
  const user = await createUser();
  const funcao = await prisma.workflowRole.findFirstOrThrow({ where: { workspaceId: wsId, key, deletedAt: null } });
  await prisma.workspaceMember.create({
    data: { workspaceId: wsId, memberId: user.id, role: funcao.level, workflowRoleId: funcao.id, isActive: true },
  });
  await prisma.projectMember.create({
    data: { projectId: projetoId, workspaceId: wsId, memberId: user.id, role: funcao.level, workflowRoleId: funcao.id },
  });
  return { user, api: apiClient((await createApiToken(user.id)).token) };
};

const createOuvidoria = () =>
  prisma.ouvidoria.create({
    data: {
      workspaceId: wsId,
      kind: "reclamacao",
      name: "Fulano",
      message: "A guia sai zerada.",
      entityId: entidadeId,
    },
  });

const criar = (api: ReturnType<typeof apiClient>, ouvidoriaId: string, corpo: Record<string, unknown>) =>
  api.post(`/workspaces/${slug}/ouvidoria/${ouvidoriaId}/solicitacao/`, corpo);

const readOuvidoria = async (id: string) => {
  const res = await gestor.get(`/workspaces/${slug}/ouvidoria/`);
  return ((await res.json()) as { results: any[] }).results.find((o) => o.id === id);
};

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  const ws = await createWorkspace(dono.id);
  wsId = ws.id;
  slug = ws.slug;
  await seedWorkflowRoles(prisma, ws.id);
  projetoId = (await createProject(ws.id, dono.id, { name: "SIART", identifier: "SIART" })).id;
  entidadeId = (await createEntity(ws.id, { name: "Prefeitura de Teste" })).id;
  gestor = apiClient((await createMemberWithToken(ws.id, 18, projetoId, 18)).token);
  atendente = await createPessoa("atendimento");
  ti = await createPessoa("ti");
  await prisma.workspaceMember.updateMany({
    where: { workspaceId: wsId, memberId: ti.user.id },
    data: { revokedActions: ["intake.create"] },
  });
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Solicitação a partir da ouvidoria", () => {
  it("quem não tem a ação não cria", async () => {
    const ouvidoria = await createOuvidoria();
    const res = await criar(atendente.api, ouvidoria.id, { project_id: projetoId, atendente_id: atendente.user.id });
    expect(res.status).toBe(403);
  });

  it("cria No atendimento, com o atendente responsável e avisado, e liga à ouvidoria", async () => {
    const ouvidoria = await createOuvidoria();
    const res = await criar(gestor, ouvidoria.id, { project_id: projetoId, atendente_id: atendente.user.id });
    expect(res.status).toBe(201);
    const { issue_id } = (await res.json()) as { issue_id: string };

    const solicitacao = await prisma.intakeIssue.findFirstOrThrow({ where: { issueId: issue_id } });
    expect(solicitacao.status).toBe(-3);
    const chamado = await prisma.issue.findUniqueOrThrow({ where: { id: issue_id } });
    expect(chamado.entityId).toBe(entidadeId);
    expect(chamado.descriptionStripped).toContain("A guia sai zerada.");
    const responsaveis = await prisma.issueAssignee.findMany({ where: { issueId: issue_id, deletedAt: null } });
    expect(responsaveis.map((r) => r.assigneeId)).toEqual([atendente.user.id]);
    const aviso = await prisma.notification.findFirst({ where: { issueId: issue_id, receiverId: atendente.user.id } });
    expect(aviso?.title).toBe("Nova solicitação no atendimento");

    const lida = await readOuvidoria(ouvidoria.id);
    expect(lida.solicitacao).toMatchObject({ issue_id, situacao: "No atendimento", atendente: atendente.user.id });
  });

  it("atendente sem intake.create não pode ser atribuído: o erro volta para o campo", async () => {
    const ouvidoria = await createOuvidoria();
    const res = await criar(gestor, ouvidoria.id, { project_id: projetoId, atendente_id: ti.user.id });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors.map((e: any) => e.path)).toEqual(["atendente_id"]);
  });

  it("a lista de atendentes traz quem abre solicitação, e não quem não abre", async () => {
    const res = await gestor.get(`/workspaces/${slug}/atendentes/`);
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as { id: string; display_name: string }[]).map((p) => p.id);
    expect(ids).toContain(atendente.user.id);
    expect(ids).not.toContain(ti.user.id);
  });

  it("uma ouvidoria tem uma solicitação só", async () => {
    const ouvidoria = await createOuvidoria();
    expect((await criar(gestor, ouvidoria.id, { project_id: projetoId, atendente_id: atendente.user.id })).status).toBe(
      201
    );
    expect((await criar(gestor, ouvidoria.id, { project_id: projetoId, atendente_id: atendente.user.id })).status).toBe(
      409
    );
  });

  it("o processo aparece na ouvidoria: encaminhada vira pendente na triagem", async () => {
    const ouvidoria = await createOuvidoria();
    const { issue_id } = (await (
      await criar(gestor, ouvidoria.id, { project_id: projetoId, atendente_id: atendente.user.id })
    ).json()) as { issue_id: string };
    await atendente.api.post(`/workspaces/${slug}/projects/${projetoId}/inbox-issues/${issue_id}/encaminhar/`, {});
    const lida = await readOuvidoria(ouvidoria.id);
    expect(lida.solicitacao.situacao).toBe("Pendente");
    expect(lida.solicitacao.processo.map((p: any) => p.evento)).toEqual([
      "Solicitação criada",
      "Encaminhada para a triagem",
    ]);
  });
});
