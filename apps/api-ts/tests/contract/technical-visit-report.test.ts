/**
 * Relatório de visitas técnicas (`GET /technical-visits/report/`).
 *
 * "Concluída" é `VISIT_STATUS.CONCLUIDA` (4). O relatório contava `status: 1`, que no
 * Plane é "Em Andamento": o total de concluídas e a duração média saíam das visitas
 * ainda abertas. API de verdade + banco de teste.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";
import { apiClient, createApiToken, createUser, createWorkspace } from "@tests/helpers/factory";
import { prismaReal } from "@tests/helpers/prisma-real";
import { cleanDb } from "@tests/helpers/setup";

const HORA = 3_600_000;

describe("relatório de visitas técnicas", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;

  const createVisita = (workspaceId: string, status: number, horas: number) => {
    const inicio = new Date("2026-05-04T12:00:00Z");
    return prismaReal().technicalVisit.create({
      data: { workspaceId, status, startedAt: inicio, finishedAt: new Date(inicio.getTime() + horas * HORA) },
    });
  };

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    client = apiClient(token.token);

    await createVisita(ws.id, VISIT_STATUS.CONCLUIDA, 2);
    await createVisita(ws.id, VISIT_STATUS.CONCLUIDA, 4);
    await createVisita(ws.id, VISIT_STATUS.EM_ANDAMENTO, 100);
    await createVisita(ws.id, VISIT_STATUS.AGENDADA, 50);
  });

  afterAll(() => cleanDb());

  it("conta como concluída só a visita CONCLUIDA", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/technical-visits/report/`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.summary.total).toBe(4);
    expect(data.summary.scheduled).toBe(1);
    expect(data.summary.completed).toBe(2);
  });

  it("a duração média usa só as concluídas", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/technical-visits/report/`);
    const data = (await res.json()) as any;
    expect(data.summary.avg_duration_hours).toBe(3);
  });
});
