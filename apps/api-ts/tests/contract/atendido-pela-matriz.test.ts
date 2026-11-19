/**
 * Marcar a solicitação como atendida (status 3) na triagem: quem tem
 * `intake.review` (Qualidade, por padrão), quem abriu a solicitação ou quem
 * abre solicitações (`intake.create`, o Atendimento todo: cobre férias e troca
 * de turno, decisão de 19/11/2026). Antes a
 * rota cortava por nível (gestor ou mais) e o Qualidade tomava 403, enquanto a
 * tela (`inbox-issue-header.tsx`) já mostrava o botão para quem tem a ação.
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

const ACEITA = 1;
const ATENDIDA = 3;

let wsId: string;
let wsSlug: string;
let projetoId: string;
let donoId: string;
let concluido: string;

const createAceitaConcluida = async (createdById: string) =>
  (await createIntakeIssue(projetoId, wsId, { status: ACEITA, stateId: concluido, createdById })).issue.id;

const markAtendida = (token: string, issueId: string) =>
  apiClient(token).patch(`/workspaces/${wsSlug}/projects/${projetoId}/inbox-issues/${issueId}/`, { status: ATENDIDA });

const readStatus = async (issueId: string) =>
  (await prisma.intakeIssue.findFirstOrThrow({ where: { issueId }, select: { status: true } })).status;

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  donoId = dono.id;
  await createApiToken(dono.id);
  const ws = await createWorkspace(dono.id);
  wsId = ws.id;
  wsSlug = ws.slug;
  projetoId = (await createProject(ws.id, dono.id)).id;
  concluido = (await prisma.state.findFirstOrThrow({ where: { projectId: projetoId, group: "completed" } })).id;
});

describe("PATCH inbox-issues status 3 (atendido) pela matriz de ações", () => {
  it("Qualidade (intake.review), sem ser quem abriu, marca como atendida", async () => {
    const qualidade = await createMemberWithToken(wsId, 8, projetoId, 8);
    const issueId = await createAceitaConcluida(donoId);
    expect((await markAtendida(qualidade.token, issueId)).status).toBe(200);
    expect(await readStatus(issueId)).toBe(ATENDIDA);
  });

  it("Atendimento (intake.create), sem ter aberto, marca como atendida", async () => {
    const atendente = await createMemberWithToken(wsId, 6, projetoId, 6);
    const issueId = await createAceitaConcluida(donoId);
    expect((await markAtendida(atendente.token, issueId)).status).toBe(200);
    expect(await readStatus(issueId)).toBe(ATENDIDA);
  });

  it("sem intake.create, sem intake.review e sem ter aberto: 403", async () => {
    const atendente = await createMemberWithToken(wsId, 6, projetoId, 6);
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: atendente.user.id },
      data: { revokedActions: ["intake.create"] },
    });
    const issueId = await createAceitaConcluida(donoId);
    expect((await markAtendida(atendente.token, issueId)).status).toBe(403);
    expect(await readStatus(issueId)).toBe(ACEITA);
  });

  it("quem abriu a solicitação marca como atendida mesmo sem intake.review", async () => {
    const atendente = await createMemberWithToken(wsId, 6, projetoId, 6);
    const issueId = await createAceitaConcluida(atendente.user.id);
    expect((await markAtendida(atendente.token, issueId)).status).toBe(200);
    expect(await readStatus(issueId)).toBe(ATENDIDA);
  });

  it("Qualidade com intake.review e intake.create negadas por pessoa: 403", async () => {
    const qualidade = await createMemberWithToken(wsId, 8, projetoId, 8);
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: qualidade.user.id },
      data: { revokedActions: ["intake.review", "intake.create"] },
    });
    const issueId = await createAceitaConcluida(donoId);
    expect((await markAtendida(qualidade.token, issueId)).status).toBe(403);
  });
});
