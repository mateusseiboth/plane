/**
 * `GET /workspaces/:slug/global-intake-issues/resumo/`
 *
 * O número do menu Solicitação/Triagem: quantas solicitações que a PRÓPRIA
 * pessoa abriu já têm o chamado concluído e ainda não foram marcadas como
 * atendidas (aceita, status 1, com o chamado numa etapa do grupo `completed`).
 * A atendida (3) sai da conta. Vale para quem abriu mesmo sem participar do
 * sistema: o Atendimento abre pedido para qualquer sistema.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createIntakeIssue,
  createMemberWithToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

let atendente: ReturnType<typeof apiClient>;
let colega: ReturnType<typeof apiClient>;
let wsSlug: string;

const readResumo = async (cliente: ReturnType<typeof apiClient>) => {
  const res = await cliente.get(`/workspaces/${wsSlug}/global-intake-issues/resumo/`);
  expect(res.status).toBe(200);
  return res.json();
};

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  await createApiToken(dono.id);
  const ws = await createWorkspace(dono.id);
  wsSlug = ws.slug;
  const projeto = await createProject(ws.id, dono.id);
  const estados = await prisma.state.findMany({ where: { projectId: projeto.id, deletedAt: null } });
  const concluido = estados.find((e) => e.group === "completed")!.id;
  const emCurso = estados.find((e) => e.group === "started")!.id;

  // Atendente sem vínculo com o sistema: abre pedido, não participa dele.
  const daAtendente = await createMemberWithToken(ws.id, 15);
  atendente = apiClient(daAtendente.token);
  const doColega = await createMemberWithToken(ws.id, 15);
  colega = apiClient(doColega.token);

  const abertaPor = (createdById: string, status: number, stateId?: string) =>
    createIntakeIssue(projeto.id, ws.id, { status, createdById, ...(stateId ? { stateId } : {}) });

  await abertaPor(daAtendente.user.id, 1, concluido);
  await abertaPor(daAtendente.user.id, 1, concluido);
  await abertaPor(daAtendente.user.id, 3, concluido);
  await abertaPor(daAtendente.user.id, 1, emCurso);
  await abertaPor(daAtendente.user.id, -2);
  await abertaPor(doColega.user.id, 1, concluido);

  const apagada = await abertaPor(daAtendente.user.id, 1, concluido);
  await prisma.intakeIssue.update({ where: { id: apagada.link.id }, data: { deletedAt: new Date() } });
});

describe("GET global-intake-issues/resumo", () => {
  it("conta as solicitações da pessoa com chamado concluído e ainda não atendidas", async () => {
    expect(await readResumo(atendente)).toEqual({ resolvidas_para_atender: 2 });
  });

  it("não conta as solicitações abertas por outra pessoa", async () => {
    expect(await readResumo(colega)).toEqual({ resolvidas_para_atender: 1 });
  });

  it("quem não é do espaço não lê o resumo", async () => {
    const estranho = await createUser();
    const cliente = apiClient((await createApiToken(estranho.id)).token);
    const res = await cliente.get(`/workspaces/${wsSlug}/global-intake-issues/resumo/`);
    expect(res.status).toBe(403);
  });
});
