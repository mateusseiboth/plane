/**
 * Painéis de TV: gestão das chaves (`panel.manage`) e as rotas de dados, que
 * abrem por CHAVE (sem login) ou por SESSÃO de quem pode ver relatórios.
 *
 * Precisa de uma API rodando contra o banco de teste (API_BASE_URL), com
 * CHAT_INTERNAL_URL apontando para o chat falso servido aqui (porta 8299).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { STATE } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import {
  TEST_API_BASE_URL,
  apiClient,
  createApiToken,
  createEntity,
  createIssue,
  createMemberWithToken,
  createProject,
  createState,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

type Client = ReturnType<typeof apiClient>;

const PORTA_DO_CHAT_FALSO = 8299;

describe("painéis de TV", () => {
  let slug: string;
  let wsId: string;
  let admin: Client;
  let gestor: Client;
  let gestorToken: string;
  let visualizadorToken: string;
  let chatFalso: ReturnType<typeof Bun.serve>;
  let chaveGeral: string;
  let chaveDoTi: string;

  const gestao = (caminho: string) => `/workspaces/${slug}/tv-panels${caminho}`;
  const tv = (caminho: string) => `${TEST_API_BASE_URL}/api/v1/tv/${slug}${caminho}`;

  const comChave = (caminho: string, chave: string) => fetch(tv(caminho), { headers: { "X-Panel-Key": chave } });

  beforeAll(async () => {
    await cleanDb();
    chatFalso = Bun.serve({
      port: PORTA_DO_CHAT_FALSO,
      fetch: (req) =>
        new URL(req.url).pathname.includes("/internal/painel/")
          ? Response.json({ gerado_em: new Date().toISOString(), abas: [], atendentes: [], totais: {} })
          : new Response("não encontrado", { status: 404 }),
    });

    const dono = await createUser();
    const ws = await createWorkspace(dono.id);
    slug = ws.slug;
    wsId = ws.id;
    await seedWorkflowRoles(prisma, ws.id);
    admin = apiClient((await createApiToken(dono.id)).token);

    const g = await createMemberWithToken(ws.id, 18);
    gestor = apiClient(g.token);
    gestorToken = g.token;
    const v = await createMemberWithToken(ws.id, 5);
    visualizadorToken = v.token;

    const projeto = await createProject(ws.id, dono.id);
    const triagem = await createState(projeto.id, ws.id, { name: STATE.TRIAGEM, group: "triage", sequence: 1000 });
    await createState(projeto.id, ws.id, { name: STATE.EM_TESTE, group: "started", sequence: 5000 });
    await createIssue(projeto.id, ws.id, { name: "Guia não emite", stateId: triagem.id, priority: "urgent" });
    await createEntity(ws.id, { name: "Prefeitura de Dourados", city: "Dourados", state: "MS" });
  });

  afterAll(async () => {
    chatFalso.stop(true);
    await cleanDb();
  });

  describe("gestão das chaves", () => {
    it("só quem tem panel.manage cria: o Gestor recebe 403", async () => {
      const res = await gestor.post(gestao("/keys/"), { name: "TV do Gestor", scopes: ["ti"] });
      expect(res.status).toBe(403);
    });

    it("o admin cria e o valor da chave aparece UMA vez", async () => {
      const res = await admin.post(gestao("/keys/"), { name: "TV da recepção", scopes: ["todos"] });
      const corpo = (await res.json()) as any;
      expect(res.status).toBe(201);
      expect(corpo.key).toMatch(/^ptv_/);
      expect(corpo).toMatchObject({ name: "TV da recepção", scopes: ["todos"], is_active: true });
      expect(corpo.last_four).toBe(corpo.key.slice(-4));
      chaveGeral = corpo.key;

      const doTi = (await (await admin.post(gestao("/keys/"), { name: "TV do TI", scopes: ["ti"] })).json()) as any;
      chaveDoTi = doTi.key;

      const lista = (await (await admin.get(gestao("/keys/"))).json()) as any;
      expect(lista.results).toHaveLength(2);
      expect(JSON.stringify(lista)).not.toContain(chaveGeral);
    });

    it("recusa o formulário vazio com o erro no campo", async () => {
      const res = await admin.post(gestao("/keys/"), { name: "", scopes: [] });
      const corpo = (await res.json()) as any;
      expect(res.status).toBe(400);
      expect(corpo.errors).toEqual([
        { path: "name", message: "Informe o nome da chave." },
        { path: "scopes", message: "Escolha ao menos um painel." },
      ]);
    });

    it("a criação entra na trilha de auditoria", async () => {
      const trilha = await prisma.auditLog.findMany({ where: { workspaceId: wsId, entity: "panel_key" } });
      expect(trilha.length).toBeGreaterThanOrEqual(2);
      expect(trilha[0]!.action).toBe("create");
    });

    it("as colunas do painel vêm com o padrão e a lista de etapas do espaço", async () => {
      const res = await admin.get(gestao("/columns/qualidade/"));
      const corpo = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(corpo.is_default).toBe(true);
      expect(corpo.columns.map((c: any) => c.chave)).toEqual(["verificar", "analisar", "homologar", "homologado"]);
      expect(corpo.etapas_do_espaco).toContain(STATE.EM_TESTE);
    });

    it("grava um mapeamento próprio e volta ao padrão quando pedido", async () => {
      const gravado = await admin.put(gestao("/columns/ti/"), {
        columns: [{ chave: "fila", rotulo: "Fila", cor: "laranja", etapas: [STATE.TRIAGEM] }],
      });
      const corpo = (await gravado.json()) as any;
      expect(gravado.status).toBe(200);
      expect(corpo.is_default).toBe(false);
      expect(corpo.columns).toEqual([{ chave: "fila", rotulo: "Fila", cor: "laranja", etapas: [STATE.TRIAGEM] }]);

      const quadro = (await (await comChave("/quadro/ti/", chaveGeral)).json()) as any;
      expect(quadro.colunas.map((c: any) => c.chave)).toEqual(["fila"]);
      expect(quadro.colunas[0].total).toBe(1);

      const voltou = (await (await admin.delete(gestao("/columns/ti/"))).json()) as any;
      expect(voltou.is_default).toBe(true);
    });

    it("configuração inválida volta com o campo recusado", async () => {
      const res = await admin.put(gestao("/columns/ti/"), {
        columns: [{ chave: "x", rotulo: "X", cor: "rosa", etapas: [] }],
      });
      const corpo = (await res.json()) as any;
      expect(res.status).toBe(400);
      expect(corpo.errors.map((e: any) => e.path)).toEqual(["columns[0].cor", "columns[0].etapas"]);
    });
  });

  describe("rotas de dados", () => {
    it("sem chave e sem sessão é 401", async () => {
      expect((await fetch(tv("/quadro/ti/"))).status).toBe(401);
      expect((await fetch(tv("/mapa/"))).status).toBe(401);
    });

    it("a chave abre o painel do escopo dela, pelo cabeçalho ou pela URL", async () => {
      const pelaUrl = await fetch(`${tv("/quadro/ti/")}?key=${encodeURIComponent(chaveDoTi)}`);
      expect(pelaUrl.status).toBe(200);
      const corpo = (await (await comChave("/quadro/qualidade/", chaveGeral)).json()) as any;
      expect(corpo.painel).toBe("qualidade");
      expect(corpo.colunas[0]).toMatchObject({ chave: "verificar", rotulo: "Verificar" });
      expect(corpo.colunas[0].chamados[0]).toMatchObject({ name: "Guia não emite", priority: "urgent" });
      expect(corpo.urgentes).toHaveLength(1);
    });

    it("chave com escopo restrito não abre os outros painéis", async () => {
      expect((await comChave("/quadro/qualidade/", chaveDoTi)).status).toBe(403);
      expect((await comChave("/mapa/", chaveDoTi)).status).toBe(403);
      expect((await comChave("/quadro/ti/", chaveDoTi)).status).toBe(200);
    });

    it("chave de outro espaço, inventada ou revogada não abre nada", async () => {
      expect((await comChave("/quadro/ti/", "ptv_nao_existe")).status).toBe(401);

      const criada = (await (
        await admin.post(gestao("/keys/"), { name: "TV velha", scopes: ["todos"] })
      ).json()) as any;
      expect((await comChave("/mapa/", criada.key)).status).toBe(200);
      await admin.post(gestao(`/keys/${criada.id}/revoke/`), {});
      expect((await comChave("/mapa/", criada.key)).status).toBe(401);
    });

    it("quem está logado e vê relatórios abre sem chave; o Visualizador recebe 403", async () => {
      const comSessao = await fetch(tv("/quadro/ti/"), { headers: { "X-Api-Key": gestorToken } });
      expect(comSessao.status).toBe(200);
      const semAcao = await fetch(tv("/quadro/ti/"), { headers: { "X-Api-Key": visualizadorToken } });
      expect(semAcao.status).toBe(403);
    });

    it("o mapa traz pontos, totais e as listas laterais", async () => {
      const corpo = (await (await comChave("/mapa/", chaveGeral)).json()) as any;
      expect(corpo.pontos.map((p: any) => p.cidade)).toContain("Dourados");
      expect(corpo.total_entidades).toBe(1);
      expect(corpo.sem_localizacao).toEqual([]);
      // Sem MySQL legado configurado: nenhum backup, e a tela mostra o aviso.
      expect(corpo.backups).toEqual({ total: 0, itens: [] });
    });

    it("o painel de backups responde mesmo sem a fonte legada", async () => {
      const corpo = (await (await comChave("/backups/?uf=MS", chaveGeral)).json()) as any;
      expect(corpo.uf).toBe("MS");
      expect(corpo.sem_backup).toEqual([]);
      expect(corpo.enviados).toEqual([]);
      expect(corpo.contadores.entidades_atrasadas).toBe(0);
    });

    it("o painel do atendimento vem do chat", async () => {
      const res = await comChave("/atendimento/", chaveGeral);
      expect(res.status).toBe(200);
      expect((await res.json()) as any).toMatchObject({ abas: [], atendentes: [] });
    });

    it("painel desconhecido é 404", async () => {
      expect((await comChave("/quadro/financeiro/", chaveGeral)).status).toBe(404);
    });

    it("o fluxo de eventos abre para quem tem chave", async () => {
      const controle = new AbortController();
      const res = await fetch(tv("/stream/"), {
        headers: { "X-Panel-Key": chaveGeral },
        signal: controle.signal,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      controle.abort();
    });
  });
});
