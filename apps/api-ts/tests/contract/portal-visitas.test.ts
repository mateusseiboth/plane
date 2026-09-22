/**
 * Visitas técnicas no portal do cliente: só as da entidade da conta, por
 * situação, e o relatório em modo leitura.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { prismaReal } from "@tests/helpers/prisma-real";
import {
  TEST_API_BASE_URL,
  apiClient,
  createApiToken,
  createEntity,
  createProject,
  createTechnicalVisit,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

const SENHA = "portal-secreto-123";
const DIA = 24 * 60 * 60 * 1000;

const portalGet = (caminho: string, token: string) =>
  fetch(`${TEST_API_BASE_URL}/portal/api${caminho}`, { headers: { Authorization: `Bearer ${token}` } });

describe("Visitas técnicas no portal", () => {
  let wsSlug: string;
  let tokenComEntidade: string;
  let tokenSemEntidade: string;
  let efetivadaId: string;
  let abertaId: string;
  let vencidaId: string;
  let deOutraEntidadeId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser({ firstName: "Ana", lastName: "Souza" });
    const admin = apiClient((await createApiToken(user.id)).token);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    const projeto = await createProject(ws.id, user.id, { name: "SIART", identifier: "SIART" });
    const entidade = await createEntity(ws.id, { name: "Prefeitura de Exemplo" });
    const outraEntidade = await createEntity(ws.id, { name: "Outra" });

    const agora = Date.now();
    const efetivada = await createTechnicalVisit(ws.id, {
      entityId: entidade.id,
      technicianId: user.id,
      status: 4,
      scheduledDate: new Date(agora - 10 * DIA),
      visitNumber: "1-2026",
    });
    await prismaReal().technicalVisit.update({
      where: { id: efetivada.id },
      data: { summary: "<p>Treinamos a equipe.</p>", conclusion: "<p>Tudo certo.</p>", projectIds: [projeto.id] },
    });
    efetivadaId = efetivada.id;
    abertaId = (
      await createTechnicalVisit(ws.id, { entityId: entidade.id, status: 0, scheduledDate: new Date(agora + 5 * DIA) })
    ).id;
    vencidaId = (
      await createTechnicalVisit(ws.id, { entityId: entidade.id, status: 1, scheduledDate: new Date(agora - 5 * DIA) })
    ).id;
    await createTechnicalVisit(ws.id, { entityId: entidade.id, status: 5, scheduledDate: new Date(agora + 3 * DIA) });
    deOutraEntidadeId = (
      await createTechnicalVisit(ws.id, { entityId: outraEntidade.id, status: 4, scheduledDate: new Date(agora - DIA) })
    ).id;

    const criar = async (email: string, entityId?: string) => {
      await admin.post(`/workspaces/${wsSlug}/portal-accounts/`, {
        name: email,
        email,
        password: SENHA,
        entity_id: entityId,
        project_ids: [projeto.id],
      });
      // Endereço próprio: o limite de login do portal é por IP e a suíte inteira o dividiria.
      const res = await fetch(`${TEST_API_BASE_URL}/portal/api/entrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.10.0.3" },
        body: JSON.stringify({ workspace: wsSlug, email, senha: SENHA }),
      });
      return ((await res.json()) as any).token as string;
    };
    tokenComEntidade = await criar("prefeitura@teste.test", entidade.id);
    tokenSemEntidade = await criar("avulso@teste.test");
  });

  afterAll(() => cleanDb());

  const ids = async (situacao: string, token = tokenComEntidade) => {
    const res = await portalGet(`/visitas?situacao=${situacao}`, token);
    expect(res.status).toBe(200);
    return ((await res.json()) as any).results.map((v: any) => v.id);
  };

  it("separa por situação e nunca mostra cancelada nem visita de outra entidade", async () => {
    expect(await ids("efetivadas")).toEqual([efetivadaId]);
    expect(await ids("abertas")).toEqual([abertaId]);
    expect(await ids("vencidas")).toEqual([vencidaId]);
  });

  it("conta sem entidade não vê visita nenhuma", async () => {
    expect(await ids("efetivadas", tokenSemEntidade)).toEqual([]);
  });

  it("abre o relatório da visita efetivada", async () => {
    const res = await portalGet(`/visitas/${efetivadaId}`, tokenComEntidade);
    expect(res.status).toBe(200);
    const visita = (await res.json()) as any;
    expect(visita).toMatchObject({
      numero: "1-2026",
      situacao: "Concluída",
      tecnicos: ["Ana Souza"],
      sistemas: ["SIART"],
      resumo_html: "<p>Treinamos a equipe.</p>",
      conclusao_html: "<p>Tudo certo.</p>",
    });
  });

  it("visita de outra entidade, id inventado ou malformado: 404", async () => {
    expect((await portalGet(`/visitas/${deOutraEntidadeId}`, tokenComEntidade)).status).toBe(404);
    expect((await portalGet(`/visitas/0192f4b8-0000-7000-8000-000000000999`, tokenComEntidade)).status).toBe(404);
    expect((await portalGet(`/visitas/nao-e-uuid`, tokenComEntidade)).status).toBe(404);
  });

  it("sem crachá do portal: 401", async () => {
    expect((await portalGet(`/visitas?situacao=abertas`, "")).status).toBe(401);
  });
});
