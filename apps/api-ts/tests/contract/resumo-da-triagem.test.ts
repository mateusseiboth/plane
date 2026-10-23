/**
 * `GET /workspaces/:slug/global-intake-issues/resumo/`
 * `POST /workspaces/:slug/global-intake-issues/:issue_id/visto/`
 *
 * O número do menu Solicitação/Triagem: solicitações que a PRÓPRIA pessoa abriu,
 * já resolvidas (atendida, ou aceita com o chamado concluído) e que ela ainda
 * não viu. Abrir a solicitação resolvida marca como vista (só quem abriu); a
 * solicitação que volta a abrir perde o visto, e a próxima conclusão conta de
 * novo. Vale para quem abriu mesmo sem participar do sistema.
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

type Cliente = ReturnType<typeof apiClient>;

let admin: Cliente;
let atendente: Cliente;
let colega: Cliente;
let wsSlug: string;
let projetoId: string;
let concluido: string;
let emCurso: string;
let pedidoId: string;

const readResumo = async (cliente: Cliente) => {
  const res = await cliente.get(`/workspaces/${wsSlug}/global-intake-issues/resumo/`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { resolvidas_nao_vistas: number }).resolvidas_nao_vistas;
};

const markVisto = (cliente: Cliente, issueId: string) =>
  cliente.post(`/workspaces/${wsSlug}/global-intake-issues/${issueId}/visto/`, {});

const moveChamado = async (issueId: string, stateId: string) => {
  const res = await admin.patch(`/workspaces/${wsSlug}/projects/${projetoId}/issues/${issueId}/`, { state: stateId });
  expect(res.status).toBe(200);
};

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  admin = apiClient((await createApiToken(dono.id)).token);
  const ws = await createWorkspace(dono.id);
  wsSlug = ws.slug;
  projetoId = (await createProject(ws.id, dono.id)).id;
  const estados = await prisma.state.findMany({ where: { projectId: projetoId, deletedAt: null } });
  concluido = estados.find((e) => e.group === "completed")!.id;
  emCurso = estados.find((e) => e.group === "started")!.id;

  // Atendente sem vínculo com o sistema: abre pedido, não participa dele.
  const daAtendente = await createMemberWithToken(ws.id, 15);
  atendente = apiClient(daAtendente.token);
  const doColega = await createMemberWithToken(ws.id, 15);
  colega = apiClient(doColega.token);

  const abertaPor = (createdById: string, status: number, stateId?: string) =>
    createIntakeIssue(projetoId, ws.id, { status, createdById, ...(stateId ? { stateId } : {}) });

  pedidoId = (await abertaPor(daAtendente.user.id, 1, emCurso)).issue.id;
  await abertaPor(daAtendente.user.id, -2);
  await abertaPor(doColega.user.id, 3, concluido);
  const apagada = await abertaPor(daAtendente.user.id, 3, concluido);
  await prisma.intakeIssue.update({ where: { id: apagada.link.id }, data: { deletedAt: new Date() } });
});

describe("resumo da triagem: resolvidas que quem abriu ainda não viu", () => {
  it("abrir a solicitação ainda em curso não marca nada", async () => {
    expect((await markVisto(atendente, pedidoId)).status).toBe(200);
    expect(await readResumo(atendente)).toBe(0);
  });

  it("concluir o chamado conta 1 para quem abriu", async () => {
    await moveChamado(pedidoId, concluido);
    expect(await readResumo(atendente)).toBe(1);
  });

  it("não conta o que outra pessoa abriu", async () => {
    expect(await readResumo(colega)).toBe(1);
  });

  it("outra pessoa abrir a solicitação: 403 e o número continua", async () => {
    expect((await markVisto(colega, pedidoId)).status).toBe(403);
    expect(await readResumo(atendente)).toBe(1);
  });

  it("quem abriu vê a solicitação resolvida: o número cai na hora", async () => {
    const res = await markVisto(atendente, pedidoId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resolvidas_nao_vistas: 0 });
    expect(await readResumo(atendente)).toBe(0);
  });

  it("marcar de novo não muda nada", async () => {
    const res = await markVisto(atendente, pedidoId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resolvidas_nao_vistas: 0 });
  });

  it("reabrir e concluir de novo volta a contar", async () => {
    await moveChamado(pedidoId, emCurso);
    expect(await readResumo(atendente)).toBe(0);
    await moveChamado(pedidoId, concluido);
    expect(await readResumo(atendente)).toBe(1);
  });

  it("chamado que não veio de solicitação: 404", async () => {
    const res = await markVisto(atendente, "00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("quem não é do espaço não lê o resumo", async () => {
    const estranho = await createUser();
    const cliente = apiClient((await createApiToken(estranho.id)).token);
    const res = await cliente.get(`/workspaces/${wsSlug}/global-intake-issues/resumo/`);
    expect(res.status).toBe(403);
  });
});
