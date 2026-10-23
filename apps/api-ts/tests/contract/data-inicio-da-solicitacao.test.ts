/**
 * A data de início do chamado conta da abertura da solicitação.
 *
 * Pedido do cliente (23/10/2026): o Atendimento abre a solicitação e é dali que
 * o prazo do chamado começa a contar, não do dia em que a triagem aceitou.
 * `start_date` é data pura (dia de início no fuso do escritório, ver
 * @utils/prazo); a solicitação nasce com o dia da abertura e aceitar na triagem
 * não mexe nela.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { dataLocal, inicioDoDia } from "@utils/prazo";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createProject, createUser, createWorkspace } from "@tests/helpers/factory";

let admin: ReturnType<typeof apiClient>;
let base: string;

const openSolicitacao = async (name: string): Promise<string> => {
  const res = await admin.post(`${base}/inbox-issues/`, { name });
  expect(res.status).toBe(201);
  return ((await res.json()) as any).issue.id;
};

const readInicio = async (issueId: string): Promise<string | null> =>
  ((await (await admin.get(`${base}/issues/${issueId}/`)).json()) as any).start_date;

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  admin = apiClient((await createApiToken(dono.id)).token);
  const ws = await createWorkspace(dono.id);
  const projeto = await createProject(ws.id, dono.id);
  base = `/workspaces/${ws.slug}/projects/${projeto.id}`;
});

describe("data de início da solicitação", () => {
  it("a solicitação nova nasce com o dia da abertura como início", async () => {
    const issueId = await openSolicitacao("Guia não emite");
    expect(await readInicio(issueId)).toBe(dataLocal(new Date()));
  });

  it("aceitar na triagem mantém o início gravado", async () => {
    const issueId = await openSolicitacao("Relatório lento");
    // Abertura num dia anterior: o aceite de hoje não pode trazer o início para hoje.
    await prisma.issue.update({ where: { id: issueId }, data: { startDate: inicioDoDia(2026, 10, 1) } });

    const res = await admin.patch(`${base}/inbox-issues/${issueId}/`, { status: 1 });
    expect(res.status).toBe(200);
    expect(await readInicio(issueId)).toBe("2026-10-01");
  });
});
