/**
 * Analítico "chamados por usuário": a listagem traz só os totais e uma amostra
 * dos chamados mais recentes, e a rota por usuário pagina o resto. O relatório
 * inteiro chegava num JSON só (46 mil chamados em produção) e travava a tela.
 * API de verdade + banco de teste.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  addAssignee,
  apiClient,
  createApiToken,
  createIssue,
  createMemberWithToken,
  createProject,
  createState,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";
import { prismaReal } from "@tests/helpers/prisma-real";
import { cleanDb } from "@tests/helpers/setup";
import { DEFAULT_STATES } from "@utils/project-defaults";
import { STATE } from "@utils/permissions";

/** 60 do Davi no Tributos, 3 do Davi na Folha e 2 da Quitéria. */
const DO_DAVI_EM_TRIBUTOS = 60;
const DO_DAVI_EM_FOLHA = 3;
const DA_QUITERIA = 2;

describe("analítico por usuário: amostra na listagem e paginação por pessoa", () => {
  let admin: ReturnType<typeof apiClient>;
  let semPermissao: ReturnType<typeof apiClient>;
  let slug: string;
  let tributos: string;
  let folha: string;
  let daviId: string;
  let quiteriaId: string;
  const idsDoDavi: string[] = [];

  beforeAll(async () => {
    await cleanDb();
    const db = prismaReal();
    const owner = await createUser({ firstName: "Ana", lastName: "Admin" });
    admin = apiClient((await createApiToken(owner.id)).token);
    const ws = await createWorkspace(owner.id);
    slug = ws.slug;

    const p1 = await createProject(ws.id, owner.id, { name: "Tributos", identifier: "TRIB" });
    const p2 = await createProject(ws.id, owner.id, { name: "Folha", identifier: "FOLHA" });
    tributos = p1.id;
    folha = p2.id;

    const criadas = await Promise.all(
      DEFAULT_STATES.map((s) => createState(p1.id, ws.id, { name: s.name, group: s.group, sequence: s.sequence }))
    );
    const etapas: Record<string, string> = Object.fromEntries(criadas.map((e) => [e.name, e.id]));
    const aFazerFolha = await createState(p2.id, ws.id, { name: STATE.A_FAZER, group: "unstarted" });

    const davi = await createMemberWithToken(ws.id, 12, p1.id, 12);
    const quiteria = await createMemberWithToken(ws.id, 8, p1.id, 8);
    await db.user.update({ where: { id: davi.user.id }, data: { firstName: "Davi", lastName: "Dev" } });
    await db.user.update({ where: { id: quiteria.user.id }, data: { firstName: "Quitéria", lastName: "Qualidade" } });
    daviId = davi.user.id;
    quiteriaId = quiteria.user.id;
    semPermissao = apiClient(davi.token);

    // Um chamado por dia, do mais antigo para o mais novo: a amostra tem que vir do fim.
    const criar = async (projectId: string, stateId: string, indice: number, donoId: string) => {
      const issue = await createIssue(projectId, ws.id, { name: `Chamado ${indice}`, stateId });
      await db.issue.update({
        where: { id: issue.id },
        data: { createdAt: new Date(Date.UTC(2026, 0, 1 + indice, 12)) },
      });
      await addAssignee(issue.id, donoId, projectId, ws.id);
      return issue.id;
    };

    for (let i = 0; i < DO_DAVI_EM_TRIBUTOS; i++) {
      idsDoDavi.push(await criar(tributos, etapas[i % 2 === 0 ? STATE.A_FAZER : STATE.CONCLUIDO]!, i, daviId));
    }
    for (let i = 0; i < DO_DAVI_EM_FOLHA; i++) {
      idsDoDavi.push(await criar(folha, aFazerFolha.id, 100 + i, daviId));
    }
    for (let i = 0; i < DA_QUITERIA; i++) await criar(tributos, etapas[STATE.A_FAZER]!, 200 + i, quiteriaId);
  });

  afterAll(() => cleanDb());

  const getJson = async (path: string, client = admin) => {
    const res = await client.get(`/workspaces/${slug}/reports/${path}`);
    return { status: res.status, body: (await res.json()) as any };
  };

  const readDavi = (body: any) => body.usuarios.find((u: any) => u.user_id === daviId);

  it("a listagem traz os totais e só uma amostra de 25 chamados por usuário", async () => {
    const { status, body } = await getJson("milestones-by-user/");
    expect(status).toBe(200);
    expect(body.por_usuario).toBe(25);
    expect(body.total).toBe(DO_DAVI_EM_TRIBUTOS + DO_DAVI_EM_FOLHA + DA_QUITERIA);

    const davi = readDavi(body);
    expect(davi.name).toBe("Davi Dev");
    expect(davi.chamados_total).toBe(DO_DAVI_EM_TRIBUTOS + DO_DAVI_EM_FOLHA);
    expect(davi.total).toBe(davi.chamados_total);
    expect(davi.chamados).toHaveLength(25);
    expect(davi.abertos + davi.encerrados).toBe(davi.chamados_total);
    expect(davi.encerrados).toBe(DO_DAVI_EM_TRIBUTOS / 2);
  });

  it("a amostra são os mais recentes, do mais novo para o mais antigo", async () => {
    const { body } = await getJson("milestones-by-user/?por_usuario=5");
    const davi = readDavi(body);
    expect(davi.chamados).toHaveLength(5);
    expect(davi.chamados.map((c: any) => c.id)).toEqual(idsDoDavi.slice(-5).toReversed());
    const datas = davi.chamados.map((c: any) => c.created_at);
    expect(datas).toEqual(datas.toSorted().toReversed());
  });

  it("o limite por usuário não passa de 200", async () => {
    const { body } = await getJson("milestones-by-user/?por_usuario=5000");
    expect(body.por_usuario).toBe(200);
    expect(readDavi(body).chamados).toHaveLength(DO_DAVI_EM_TRIBUTOS + DO_DAVI_EM_FOLHA);
  });

  it("a rota por usuário pagina de 50 em 50, do mais recente para o mais antigo", async () => {
    const primeira = await getJson(`milestones-by-user/${daviId}/`);
    expect(primeira.status).toBe(200);
    expect(primeira.body).toMatchObject({
      user_id: daviId,
      name: "Davi Dev",
      page: 1,
      per_page: 50,
      total: DO_DAVI_EM_TRIBUTOS + DO_DAVI_EM_FOLHA,
      total_pages: 2,
    });
    expect(primeira.body.chamados).toHaveLength(50);
    expect(primeira.body.chamados[0].id).toBe(idsDoDavi.at(-1));
    expect(primeira.body.chamados[0].marcos).toBeDefined();

    const segunda = await getJson(`milestones-by-user/${daviId}/?page=2`);
    expect(segunda.body.chamados).toHaveLength(DO_DAVI_EM_TRIBUTOS + DO_DAVI_EM_FOLHA - 50);
    const daPrimeira = new Set(primeira.body.chamados.map((c: any) => c.id));
    expect(segunda.body.chamados.some((c: any) => daPrimeira.has(c.id))).toBe(false);
  });

  it("a rota por usuário respeita per_page e a página fora do fim vem vazia", async () => {
    const { body } = await getJson(`milestones-by-user/${daviId}/?page=3&per_page=10`);
    expect(body).toMatchObject({ page: 3, per_page: 10, total_pages: 7 });
    expect(body.chamados.map((c: any) => c.id)).toEqual(idsDoDavi.toReversed().slice(20, 30));

    const vazia = await getJson(`milestones-by-user/${daviId}/?page=99`);
    expect(vazia.body.chamados).toEqual([]);
  });

  it("a rota por usuário aplica os mesmos filtros da listagem", async () => {
    const porSistema = await getJson(`milestones-by-user/${daviId}/?project_ids=${folha}`);
    expect(porSistema.body.total).toBe(DO_DAVI_EM_FOLHA);

    const abertos = await getJson(`milestones-by-user/${daviId}/?situacao=abertos`);
    expect(abertos.body.total).toBe(DO_DAVI_EM_TRIBUTOS / 2 + DO_DAVI_EM_FOLHA);

    const homologacao = await getJson(`milestones-by-user/${daviId}/?perfil=homologacao`);
    expect(homologacao.body.total).toBe(0);

    const outraPessoa = await getJson(`milestones-by-user/${quiteriaId}/`);
    expect(outraPessoa.body.total).toBe(DA_QUITERIA);
  });

  it("a rota por usuário exige a permissão de relatórios", async () => {
    const { status } = await getJson(`milestones-by-user/${daviId}/`, semPermissao);
    expect(status).toBe(403);
  });
});
