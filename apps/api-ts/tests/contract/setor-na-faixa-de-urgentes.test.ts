/**
 * A faixa de URGENTES mostra todos os urgentes em aberto do espaço e, em cada
 * um, o setor em que ele está (pedido dos testes da nova intranet, 16/11/2026):
 * o atendimento via chamados de outros setores sem saber com quem estavam.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createIssue,
  createProject,
  createState,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

type Urgente = { id: string; setor: string | null; state: { name: string } | null };

let wsSlug: string;
let atendimento: ReturnType<typeof apiClient>;
const ids: Record<string, string> = {};

const createPessoa = async (wsId: string, key: string) => {
  const user = await createUser();
  const funcao = await prisma.workflowRole.findFirstOrThrow({ where: { workspaceId: wsId, key, deletedAt: null } });
  await prisma.workspaceMember.create({
    data: { workspaceId: wsId, memberId: user.id, role: funcao.level, workflowRoleId: funcao.id, isActive: true },
  });
  return user;
};

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  const ws = await createWorkspace(dono.id);
  wsSlug = ws.slug;
  await seedWorkflowRoles(prisma, ws.id);
  const sistema = await createProject(ws.id, dono.id, { identifier: "RECURS" });
  const [triagem, emDev, emAnalise] = await Promise.all([
    createState(sistema.id, ws.id, { name: "Triagem", group: "triage", isTriage: true }),
    createState(sistema.id, ws.id, { name: "Em Desenvolvimento", group: "started" }),
    createState(sistema.id, ws.id, { name: "Em Análise", group: "started" }),
  ]);
  const [atendente, dev] = await Promise.all([createPessoa(ws.id, "atendimento"), createPessoa(ws.id, "ti")]);
  atendimento = apiClient((await createApiToken(atendente.id)).token);

  const urgente = (stateId: string, name: string) =>
    createIssue(sistema.id, ws.id, { name, stateId, priority: "urgent", createdById: atendente.id });
  const [naTriagem, comODev, semDono] = await Promise.all([
    urgente(triagem.id, "na triagem"),
    urgente(emDev.id, "com o dev"),
    urgente(emAnalise.id, "em análise sem dono"),
  ]);
  await prisma.issueAssignee.createMany({
    data: [
      { issueId: naTriagem.id, assigneeId: atendente.id, projectId: sistema.id, workspaceId: ws.id },
      { issueId: comODev.id, assigneeId: dev.id, projectId: sistema.id, workspaceId: ws.id },
      { issueId: semDono.id, assigneeId: atendente.id, projectId: sistema.id, workspaceId: ws.id },
    ],
  });
  Object.assign(ids, { naTriagem: naTriagem.id, comODev: comODev.id, semDono: semDono.id });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const readFaixa = async () => {
  const res = await atendimento.get(`/workspaces/${wsSlug}/urgent-issues/`);
  expect(res.status).toBe(200);
  return (await res.json()) as Urgente[];
};

describe("setor na faixa de urgentes", () => {
  it("todo urgente em aberto aparece, mesmo de sistema em que a pessoa não tem vínculo gravado", async () => {
    expect((await readFaixa()).map((u) => u.id).toSorted()).toEqual(Object.values(ids).toSorted());
  });

  it("na triagem, o setor é quem tria, não o atendente que abriu", async () => {
    expect((await readFaixa()).find((u) => u.id === ids.naTriagem)?.setor).toBe("Qualidade");
  });

  it("com o responsável dono da etapa, o setor é o dele", async () => {
    expect((await readFaixa()).find((u) => u.id === ids.comODev)?.setor).toBe("TI");
  });

  it("sem responsável dono da etapa, são os donos da etapa pela matriz", async () => {
    const setor = (await readFaixa()).find((u) => u.id === ids.semDono)?.setor;
    expect(setor).toBeTruthy();
    expect(setor).not.toContain("Atendimento");
  });
});
