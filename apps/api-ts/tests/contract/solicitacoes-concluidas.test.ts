/**
 * `GET /workspaces/:slug/global-intake-issues/?status=concluido`
 *
 * A aba "Concluído" das Solicitações globais: a solicitação cujo chamado já
 * terminou (atendida, ou aceita com o chamado numa etapa concluída). A aba
 * "Aceito" (`status=1`) passa a trazer só as aceitas ainda em curso.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createIntakeIssue,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

let admin: ReturnType<typeof apiClient>;
let wsSlug: string;
let aceitaEmCurso: string;
let aceitaConcluida: string;
let atendida: string;
let pendente: string;

const listIds = async (status: string) => {
  const res = await admin.get(`/workspaces/${wsSlug}/global-intake-issues/?status=${status}`);
  expect(res.status).toBe(200);
  const corpo = (await res.json()) as any;
  return corpo.results.map((r: any) => r.issue.id).toSorted();
};

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  admin = apiClient((await createApiToken(dono.id)).token);
  const ws = await createWorkspace(dono.id);
  wsSlug = ws.slug;
  const projeto = await createProject(ws.id, dono.id);
  const estados = await prisma.state.findMany({ where: { projectId: projeto.id, deletedAt: null } });
  const concluido = estados.find((e) => e.group === "completed")!.id;
  const emCurso = estados.find((e) => e.group === "started")!.id;

  aceitaEmCurso = (await createIntakeIssue(projeto.id, ws.id, { status: 1, stateId: emCurso })).issue.id;
  aceitaConcluida = (await createIntakeIssue(projeto.id, ws.id, { status: 1, stateId: concluido })).issue.id;
  atendida = (await createIntakeIssue(projeto.id, ws.id, { status: 3, stateId: concluido })).issue.id;
  pendente = (await createIntakeIssue(projeto.id, ws.id, { status: -2 })).issue.id;
});

describe("GET global-intake-issues: aba Concluído", () => {
  it("status=concluido traz as atendidas e as aceitas de chamado concluído", async () => {
    expect(await listIds("concluido")).toEqual([aceitaConcluida, atendida].toSorted());
  });

  it("status=1 traz só as aceitas ainda em curso", async () => {
    expect(await listIds("1")).toEqual([aceitaEmCurso]);
  });

  it("os demais status continuam iguais", async () => {
    expect(await listIds("-2")).toEqual([pendente]);
  });

  it("cada item diz a situação: concluido ou o próprio status", async () => {
    const res = await admin.get(`/workspaces/${wsSlug}/global-intake-issues/?status=concluido,1`);
    const corpo = (await res.json()) as any;
    const situacao = Object.fromEntries(corpo.results.map((r: any) => [r.issue.id, r.situacao]));
    expect(situacao).toEqual({ [aceitaEmCurso]: "1", [aceitaConcluida]: "concluido", [atendida]: "concluido" });
  });
});
