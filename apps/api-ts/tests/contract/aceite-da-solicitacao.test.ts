/**
 * Aceitar a solicitação põe quem aceitou entre os responsáveis (testes da nova
 * intranet 3, 18/11/2026): o chamado ia para Em Análise só com o atendente que
 * abriu, e não dava para saber qual pessoa da Qualidade estava analisando. O
 * atendente continua responsável (pedido do dono do produto).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  buildPedidoDeSolicitacao,
  createApiToken,
  createProject,
  createState,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

let base: string;
let wsId: string;
let qualidade: { user: { id: string }; api: ReturnType<typeof apiClient> };
let atendimento: { user: { id: string }; api: ReturnType<typeof apiClient> };

const createPessoa = async (projectId: string, key: string) => {
  const user = await createUser();
  const funcao = await prisma.workflowRole.findFirstOrThrow({ where: { workspaceId: wsId, key, deletedAt: null } });
  await prisma.workspaceMember.create({
    data: { workspaceId: wsId, memberId: user.id, role: funcao.level, workflowRoleId: funcao.id, isActive: true },
  });
  await prisma.projectMember.create({
    data: { projectId, workspaceId: wsId, memberId: user.id, role: funcao.level, workflowRoleId: funcao.id },
  });
  return { user, api: apiClient((await createApiToken(user.id)).token) };
};

const openSolicitacao = async (name: string) =>
  (
    (await (
      await atendimento.api.post(`${base}/inbox-issues/`, await buildPedidoDeSolicitacao(wsId, { name }))
    ).json()) as { id: string }
  ).id;

const readResponsaveis = async (issueId: string) =>
  (await prisma.issueAssignee.findMany({ where: { issueId, deletedAt: null } })).map((a) => a.assigneeId).sort();

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  const ws = await createWorkspace(dono.id);
  wsId = ws.id;
  await seedWorkflowRoles(prisma, ws.id);
  const sistema = await createProject(ws.id, dono.id);
  await createState(sistema.id, ws.id, { name: "Em Análise", group: "started" });
  base = `/workspaces/${ws.slug}/projects/${sistema.id}`;
  qualidade = await createPessoa(sistema.id, "qualidade");
  atendimento = await createPessoa(sistema.id, "atendimento");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("aceite da solicitação", () => {
  it("quem aceitou entra como responsável, junto do atendente", async () => {
    const id = await openSolicitacao("Folha não fecha");
    const antes = await readResponsaveis(id);
    expect((await qualidade.api.patch(`${base}/inbox-issues/${id}/`, { status: 1 })).status).toBe(200);
    expect(await readResponsaveis(id)).toEqual([...new Set([...antes, qualidade.user.id])].sort());
  });

  it("a resposta do aceite já traz os responsáveis, para a tela mostrar sem recarregar", async () => {
    const id = await openSolicitacao("Empenho travado");
    const res = await qualidade.api.patch(`${base}/inbox-issues/${id}/`, { status: 1 });
    const corpo = (await res.json()) as { issue: { assignee_ids: string[] } };
    expect(corpo.issue.assignee_ids.sort()).toEqual(await readResponsaveis(id));
    expect(corpo.issue.assignee_ids).toContain(qualidade.user.id);
  });

  it("aceitar de novo não duplica o responsável", async () => {
    const id = await openSolicitacao("Guia não emite");
    await qualidade.api.patch(`${base}/inbox-issues/${id}/`, { status: 1 });
    await qualidade.api.patch(`${base}/inbox-issues/${id}/`, { status: 1 });
    const linhas = await prisma.issueAssignee.findMany({
      where: { issueId: id, assigneeId: qualidade.user.id, deletedAt: null },
    });
    expect(linhas).toHaveLength(1);
  });

  it("adiar não muda os responsáveis", async () => {
    const id = await openSolicitacao("Relatório lento");
    const antes = await readResponsaveis(id);
    const amanha = new Date(Date.now() + 86_400_000).toISOString();
    expect((await qualidade.api.patch(`${base}/inbox-issues/${id}/`, { status: 0, snoozed_till: amanha })).status).toBe(
      200
    );
    expect(await readResponsaveis(id)).toEqual(antes);
  });
});
