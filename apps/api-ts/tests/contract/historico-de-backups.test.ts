/**
 * Histórico do painel de backups (`GET /api/v1/tv/:slug/backups/historico/`): o
 * detalhe que o painel interativo abre ao clicar numa célula entidade × sistema.
 *
 * Mesma porta de entrada das demais rotas da TV: chave de painel (sem login) ou
 * sessão de quem pode ver relatórios. Sem `LEGACY_BACKUP_DB_URL` a fonte é a
 * vazia, então a lista volta vazia — o que se confere aqui é o CONTRATO: quem
 * entra, o que é recusado e em qual campo.
 *
 * Precisa de uma API rodando contra o banco de teste (API_BASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import {
  TEST_API_BASE_URL,
  apiClient,
  createApiToken,
  createEntity,
  createMemberWithToken,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

describe("histórico do painel de backups", () => {
  let slug: string;
  let entidadeId: string;
  let deOutroEspacoId: string;
  let chaveDeBackups: string;
  let chaveDoTi: string;
  let gestorToken: string;
  let visualizadorToken: string;

  const historico = (busca: string) => `${TEST_API_BASE_URL}/api/v1/tv/${slug}/backups/historico/${busca}`;
  const comChave = (busca: string, chave: string) => fetch(historico(busca), { headers: { "X-Panel-Key": chave } });

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser();
    const ws = await createWorkspace(dono.id);
    slug = ws.slug;
    await seedWorkflowRoles(prisma, ws.id);
    const admin = apiClient((await createApiToken(dono.id)).token);

    const entidade = await createEntity(ws.id, { name: "Prefeitura de Naviraí", city: "Naviraí", state: "MS" });
    entidadeId = entidade.id;

    const outroDono = await createUser();
    const outro = await createWorkspace(outroDono.id);
    deOutroEspacoId = (await createEntity(outro.id, { name: "Câmara de Coxim" })).id;

    const gestao = `/workspaces/${slug}/tv-panels/keys/`;
    const backups = (await (await admin.post(gestao, { name: "TV da infra", scopes: ["backups"] })).json()) as any;
    chaveDeBackups = backups.key;
    const doTi = (await (await admin.post(gestao, { name: "TV do TI", scopes: ["ti"] })).json()) as any;
    chaveDoTi = doTi.key;

    gestorToken = (await createMemberWithToken(ws.id, 18)).token;
    visualizadorToken = (await createMemberWithToken(ws.id, 5)).token;
  });

  afterAll(async () => {
    await cleanDb();
  });

  it("sem chave e sem sessão é 401", async () => {
    expect((await fetch(historico(`?entidade=${entidadeId}`))).status).toBe(401);
  });

  it("chave de outro painel não abre o histórico", async () => {
    expect((await comChave(`?entidade=${entidadeId}`, chaveDoTi)).status).toBe(403);
  });

  it("qualquer membro do espaço abre o histórico sem chave, inclusive o Visualizador", async () => {
    const comSessao = await fetch(historico(`?entidade=${entidadeId}`), { headers: { "X-Api-Key": gestorToken } });
    expect(comSessao.status).toBe(200);
    const visualizador = await fetch(historico(`?entidade=${entidadeId}`), {
      headers: { "X-Api-Key": visualizadorToken },
    });
    expect(visualizador.status).toBe(200);
  });

  it("sem entidade, a recusa volta no campo", async () => {
    const res = await comChave("", chaveDeBackups);
    const corpo = (await res.json()) as any;
    expect(res.status).toBe(400);
    expect(corpo.errors).toEqual([{ path: "entidade", message: "Informe a entidade do backup." }]);
  });

  it("sistema fora dos quatro do painel volta no campo do sistema", async () => {
    const res = await comChave(`?entidade=${entidadeId}&sistema=99`, chaveDeBackups);
    const corpo = (await res.json()) as any;
    expect(res.status).toBe(400);
    expect(corpo.errors).toEqual([{ path: "sistema", message: "Escolha um dos sistemas do painel." }]);
  });

  it("entidade de outro espaço é 404", async () => {
    expect((await comChave(`?entidade=${deOutroEspacoId}`, chaveDeBackups)).status).toBe(404);
  });

  it("traz a entidade, a janela e a lista de envios", async () => {
    const res = await comChave(`?entidade=${entidadeId}&sistema=3&dias=7`, chaveDeBackups);
    const corpo = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(corpo).toMatchObject({
      dias: 7,
      sistema: 3,
      entidade: { id: entidadeId, nome: "Prefeitura de Naviraí", cidade: "Naviraí", uf: "MS" },
      total: 0,
    });
    // Sem MySQL legado configurado a fonte é a vazia: lista vazia, sem quebrar.
    expect(corpo.envios).toEqual([]);
    expect(typeof corpo.gerado_em).toBe("string");
  });

  it("a janela vai de 1 a 180 dias e cai em 30 quando não vem nada", async () => {
    const padrao = (await (await comChave(`?entidade=${entidadeId}`, chaveDeBackups)).json()) as any;
    expect(padrao.dias).toBe(30);
    expect(padrao.sistema).toBeNull();

    const teto = (await (await comChave(`?entidade=${entidadeId}&dias=5000`, chaveDeBackups)).json()) as any;
    expect(teto.dias).toBe(180);
  });
});
