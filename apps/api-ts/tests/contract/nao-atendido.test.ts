/**
 * "Não atendido" (testes da nova intranet 3, 19/11/2026): depois que a
 * Qualidade conclui o chamado, o atendimento diz se o cliente foi atendido. Não
 * atendido exige o que faltou (mínimo 10 caracteres, erro no campo), devolve o chamado para a
 * Triagem com a solicitação pendente, deixa o motivo como comentário e avisa a
 * Qualidade no sino. Pode quem abriu, o Atendimento todo (intake.create) e quem
 * tria.
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
let concluido: string;
let qualidade: { user: { id: string }; api: ReturnType<typeof apiClient> };
let atendente: { user: { id: string }; api: ReturnType<typeof apiClient> };
let colega: { user: { id: string }; api: ReturnType<typeof apiClient> };

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

/** Abre pelo atendente, a Qualidade aceita e conclui. */
const openConcluida = async (name: string) => {
  const id = (
    (await (
      await atendente.api.post(`${base}/inbox-issues/`, await buildPedidoDeSolicitacao(wsId, { name }))
    ).json()) as {
      id: string;
    }
  ).id;
  await qualidade.api.patch(`${base}/inbox-issues/${id}/`, { status: 1 });
  await prisma.issue.update({ where: { id }, data: { stateId: concluido } });
  return id;
};

const naoAtendido = (api: ReturnType<typeof apiClient>, id: string, motivo?: string) =>
  api.post(`${base}/inbox-issues/${id}/nao-atendido/`, motivo === undefined ? {} : { motivo });

const readSituacao = async (id: string) => {
  const [chamado, solicitacao] = await Promise.all([
    prisma.issue.findUniqueOrThrow({ where: { id }, include: { state: true } }),
    prisma.intakeIssue.findFirstOrThrow({ where: { issueId: id, deletedAt: null } }),
  ]);
  return { etapa: chamado.state?.group, status: solicitacao.status };
};

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  const ws = await createWorkspace(dono.id);
  wsId = ws.id;
  await seedWorkflowRoles(prisma, ws.id);
  const sistema = await createProject(ws.id, dono.id);
  await createState(sistema.id, ws.id, { name: "Em Análise", group: "started" });
  concluido = (await createState(sistema.id, ws.id, { name: "Concluído", group: "completed" })).id;
  base = `/workspaces/${ws.slug}/projects/${sistema.id}`;
  qualidade = await createPessoa(sistema.id, "qualidade");
  atendente = await createPessoa(sistema.id, "atendimento");
  colega = await createPessoa(sistema.id, "atendimento");
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Não atendido", () => {
  it("sem o motivo não devolve: o erro volta para o campo motivo", async () => {
    const id = await openConcluida("Sem motivo");
    const res = await naoAtendido(atendente.api, id, "curto");
    expect(res.status).toBe(400);
    const corpo = (await res.json()) as { errors: { path: string; message: string }[] };
    expect(corpo.errors.map((e) => e.path)).toEqual(["motivo"]);
    expect(await readSituacao(id)).toEqual({ etapa: "completed", status: 1 });
  });

  it("devolve o chamado para a Triagem com a solicitação pendente", async () => {
    const id = await openConcluida("Folha não fecha");
    const res = await naoAtendido(atendente.api, id, "O cliente ainda não consegue fechar a folha.");
    expect(res.status).toBe(200);
    expect(await readSituacao(id)).toEqual({ etapa: "triage", status: -2 });
  });

  it("o motivo vira comentário e a Qualidade é avisada no sino", async () => {
    const id = await openConcluida("Guia não emite");
    await naoAtendido(atendente.api, id, "A guia continua saindo com valor zerado.");
    const comentarios = await prisma.issueComment.findMany({ where: { issueId: id, deletedAt: null } });
    expect(comentarios.some((c) => c.commentStripped?.includes("A guia continua saindo com valor zerado."))).toBe(true);
    const aviso = await prisma.notification.findFirst({
      where: { issueId: id, receiverId: qualidade.user.id, data: { path: ["type"], equals: "intake_not_fulfilled" } },
    });
    expect(aviso?.title).toBe("Não atendida: voltou para a triagem");
  });

  it("outro atendente (intake.create), que não abriu, também pode", async () => {
    const id = await openConcluida("Colega decide");
    expect((await naoAtendido(colega.api, id, "Cliente ligou dizendo que não resolveu.")).status).toBe(200);
  });

  it("antes de o chamado ser concluído não há o que confirmar", async () => {
    const id = (
      (await (
        await atendente.api.post(`${base}/inbox-issues/`, await buildPedidoDeSolicitacao(wsId, { name: "Em curso" }))
      ).json()) as { id: string }
    ).id;
    await qualidade.api.patch(`${base}/inbox-issues/${id}/`, { status: 1 });
    expect((await naoAtendido(atendente.api, id, "Ainda não ficou pronto para o cliente.")).status).toBe(400);
  });

  it("sem intake.create, sem intake.review e sem ter aberto: 403", async () => {
    const id = await openConcluida("Sem permissão");
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: colega.user.id },
      data: { revokedActions: ["intake.create"] },
    });
    expect((await naoAtendido(colega.api, id, "Tentativa de quem não pode.")).status).toBe(403);
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: colega.user.id },
      data: { revokedActions: [] },
    });
  });
});
