/**
 * `issues.completed_at`: gravado quando o chamado entra numa etapa do grupo
 * concluído e limpo quando sai, qualquer que seja o caminho (PATCH do chamado,
 * edição em massa, triagem, solicitação, criação direta). Mesma regra do Plane
 * original: cancelado não é conclusão. Mais o backfill a partir do histórico de
 * etapa. API de verdade + banco de teste.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  apiClient,
  createApiToken,
  createIntakeIssue,
  createIssue,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";
import { prismaReal } from "@tests/helpers/prisma-real";
import { cleanDb } from "@tests/helpers/setup";
import { backfillDatasDeConclusao } from "@utils/data-de-conclusao";

const HORA = 3_600_000;

/** Id da etapa pelo nome (o helper da fábrica devolve o mapa sem tipo). */
const idDaEtapa = async (projectId: string, nome: string) =>
  (await prismaReal().state.findFirstOrThrow({ where: { projectId, name: nome }, select: { id: true } })).id;

describe("data de conclusão do chamado", () => {
  let admin: ReturnType<typeof apiClient>;
  let slug: string;
  let wsId: string;
  let projetoId: string;
  let emAndamento: string;
  let concluido: string;
  let cancelado: string;

  const db = () => prismaReal();
  const url = (sufixo = "") => `/workspaces/${slug}/projects/${projetoId}${sufixo}`;
  const concluidoEm = async (issueId: string) =>
    (await db().issue.findUniqueOrThrow({ where: { id: issueId }, select: { completedAt: true } })).completedAt;
  const novoChamado = (stateId = emAndamento) => createIssue(projetoId, wsId, { stateId });

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    admin = apiClient((await createApiToken(user.id)).token);
    const ws = await createWorkspace(user.id);
    slug = ws.slug;
    wsId = ws.id;
    projetoId = (await createProject(ws.id, user.id)).id;
    emAndamento = await idDaEtapa(projetoId, "In Progress");
    concluido = await idDaEtapa(projetoId, "Done");
    cancelado = await idDaEtapa(projetoId, "Cancelled");
  });

  afterAll(() => cleanDb());

  it("PATCH para concluído grava a data; voltar para o fluxo limpa", async () => {
    const issue = await novoChamado();
    const antes = Date.now();
    expect((await admin.patch(url(`/issues/${issue.id}/`), { state_id: concluido })).status).toBe(200);
    const data = await concluidoEm(issue.id);
    expect(data).not.toBeNull();
    expect(data!.getTime()).toBeGreaterThanOrEqual(antes - 5000);

    expect((await admin.patch(url(`/issues/${issue.id}/`), { state_id: emAndamento })).status).toBe(200);
    expect(await concluidoEm(issue.id)).toBeNull();
  });

  it("mudar outro campo de um chamado concluído não mexe na data", async () => {
    const issue = await novoChamado();
    await admin.patch(url(`/issues/${issue.id}/`), { state_id: concluido });
    const primeira = await concluidoEm(issue.id);
    await admin.patch(url(`/issues/${issue.id}/`), { name: "Outro título" });
    expect(await concluidoEm(issue.id)).toEqual(primeira);
  });

  it("cancelar não é concluir", async () => {
    const issue = await novoChamado();
    await admin.patch(url(`/issues/${issue.id}/`), { state_id: cancelado });
    expect(await concluidoEm(issue.id)).toBeNull();
  });

  it("edição em massa grava, limpa e registra a mudança de etapa no histórico", async () => {
    const [a, b] = [await novoChamado(), await novoChamado()];
    const res = await admin.post(url("/issues/bulk-update/"), { issue_ids: [a.id, b.id], state: concluido });
    expect(res.status).toBe(200);
    expect(await concluidoEm(a.id)).not.toBeNull();
    expect(await concluidoEm(b.id)).not.toBeNull();
    const historico = await db().issueActivity.findMany({ where: { issueId: a.id, field: "state" } });
    expect(historico.map((h) => [h.oldValue, h.newValue])).toEqual([["In Progress", "Done"]]);

    await admin.post(url("/issues/bulk-update/"), { issue_ids: [a.id, b.id], state: emAndamento });
    expect(await concluidoEm(a.id)).toBeNull();
    expect(await concluidoEm(b.id)).toBeNull();
  });

  it("chamado criado direto em etapa concluída já nasce com a data", async () => {
    const res = await admin.post(url("/issues/"), { name: "Nasce concluído", state_id: concluido });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as any;
    expect(await concluidoEm(id)).not.toBeNull();
  });

  it("concluir pela triagem (intake-work-items) grava a data", async () => {
    const { issue } = await createIntakeIssue(projetoId, wsId, {});
    expect((await admin.patch(url(`/intake-work-items/${issue.id}/`), { state: concluido })).status).toBe(200);
    expect(await concluidoEm(issue.id)).not.toBeNull();
  });

  it("concluir pela solicitação (inbox-issues) grava a data", async () => {
    const { issue } = await createIntakeIssue(projetoId, wsId, {});
    const res = await admin.patch(url(`/inbox-issues/${issue.id}/`), { issue: { state_id: concluido } });
    expect(res.status).toBe(200);
    expect(await concluidoEm(issue.id)).not.toBeNull();
  });

  it("a data informada na gravação vale (importador do SAC)", async () => {
    const informada = new Date("2020-05-04T12:00:00Z");
    const issue = await db().issue.create({
      data: { projectId: projetoId, workspaceId: wsId, name: "Migrado", stateId: concluido, completedAt: informada },
    });
    expect(await concluidoEm(issue.id)).toEqual(informada);
  });

  describe("backfill", () => {
    it("usa a última entrada na etapa atual, cai para updated_at sem histórico, limpa quem reabriu e é idempotente", async () => {
      const comHistorico = await novoChamado(concluido);
      const semHistorico = await novoChamado(concluido);
      const reaberto = await novoChamado(emAndamento);
      const entrada = new Date(Date.now() - 48 * HORA);
      await db().issueActivity.createMany({
        data: [
          {
            issueId: comHistorico.id,
            workspaceId: wsId,
            projectId: projetoId,
            field: "state",
            oldValue: "Done",
            newValue: "In Progress",
            createdAt: new Date(Date.now() - 96 * HORA),
          },
          {
            issueId: comHistorico.id,
            workspaceId: wsId,
            projectId: projetoId,
            field: "state",
            oldValue: "In Progress",
            newValue: "Done",
            createdAt: entrada,
          },
        ],
      });
      // Como estava antes do gatilho: concluído sem data, e reaberto com data velha.
      await db()
        .$executeRaw`UPDATE issues SET completed_at = NULL WHERE id IN (${comHistorico.id}::uuid, ${semHistorico.id}::uuid)`;
      await db().$executeRaw`UPDATE issues SET completed_at = now() WHERE id = ${reaberto.id}::uuid`;
      const atualizadoEm = (await db().issue.findUniqueOrThrow({ where: { id: semHistorico.id } })).updatedAt;

      expect(await backfillDatasDeConclusao()).toBeGreaterThanOrEqual(3);
      expect(await concluidoEm(comHistorico.id)).toEqual(entrada);
      expect(await concluidoEm(semHistorico.id)).toEqual(atualizadoEm);
      expect(await concluidoEm(reaberto.id)).toBeNull();

      expect(await backfillDatasDeConclusao()).toBe(0);
    });
  });

  it("a média de resolução dos relatórios passa a contar o chamado concluído pela tela", async () => {
    // Sistema separado: nele não há chamado migrado com a data já gravada.
    const dono = (await db().workspaceMember.findFirstOrThrow({ where: { workspaceId: wsId } })).memberId;
    const outro = await createProject(wsId, dono);
    const issue = await createIssue(outro.id, wsId, { stateId: await idDaEtapa(outro.id, "In Progress") });
    await admin.patch(`/workspaces/${slug}/projects/${outro.id}/issues/${issue.id}/`, {
      state_id: await idDaEtapa(outro.id, "Done"),
    });
    const res = await admin.get(`/workspaces/${slug}/reports/tickets-overview/?project_ids=${outro.id}`);
    const body = (await res.json()) as any;
    expect(body.kpis.avg_resolution_days).not.toBeNull();
  });
});
