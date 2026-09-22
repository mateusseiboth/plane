/**
 * Gateways de plugin (`/plugin-sdk`) e widget (`/widget-sdk`): quem não é membro
 * do workspace não lê nada dele, e dentro do workspace só aparecem os chamados dos
 * projetos de que o usuário participa.
 *
 * Antes, sem `workspace_slug` as listas devolviam dados de TODAS as workspaces, e
 * `/worker-items/:id` e `/entities/:id` abriam qualquer registro pelo id.
 * API de verdade + banco de teste. A API sob teste roda SEM PLUGIN_BRIDGE_SECRET.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  addMember,
  createApiToken,
  createEntity,
  createIssue,
  createProject,
  createUser,
  createWorkspace,
  ensureIntake,
  TEST_API_BASE_URL,
} from "@tests/helpers/factory";
import { prismaReal } from "@tests/helpers/prisma-real";
import { cleanDb } from "@tests/helpers/setup";

const TODAS = ["worker-items.read", "intakes.read", "actions.read", "stats.read", "users.read", "entities.read"];

interface IGateway {
  nome: string;
  prefixo: string;
  header: string;
  createExtensao: () => Promise<string>;
}

const GATEWAYS: IGateway[] = [
  {
    nome: "plugin",
    prefixo: "plugin-sdk",
    header: "X-Plugin-Id",
    createExtensao: async () =>
      (
        await prismaReal().plugin.create({
          data: {
            name: "Plugin escopo",
            slug: `plugin-escopo-${Date.now()}`,
            version: "1.0.0",
            author: "Tester",
            entryFile: "plugin.js",
            manifest: { backend: { baseUrl: "http://127.0.0.1:9" } },
            permissions: TODAS,
            status: "ACTIVE",
            storageKey: "escopo/1.0.0/plugin.js",
          },
        })
      ).id,
  },
  {
    nome: "widget",
    prefixo: "widget-sdk",
    header: "X-Widget-Id",
    createExtensao: async () =>
      (
        await prismaReal().widget.create({
          data: {
            name: "Widget escopo",
            version: "1.0.0",
            author: "Tester",
            entryFile: "widget.js",
            manifest: {},
            permissions: TODAS,
            status: "ACTIVE",
            storageKey: "escopo/1.0.0/widget.js",
          },
        })
      ).id,
  },
];

const seed = {
  token: "",
  wsA: "",
  wsB: "",
  issueVisivel: "",
  issueOutroProjeto: "",
  issueOutroWorkspace: "",
  entityA: "",
  entityB: "",
  colegaId: "",
  estranhoId: "",
};

beforeAll(async () => {
  await cleanDb();
  const user = await createUser();
  seed.token = (await createApiToken(user.id)).token;

  const dono = await createUser();
  const wsA = await createWorkspace(dono.id);
  const wsB = await createWorkspace(dono.id);
  seed.wsA = wsA.slug;
  seed.wsB = wsB.slug;

  const projetoVisivel = await createProject(wsA.id, dono.id);
  const projetoFechado = await createProject(wsA.id, dono.id);
  const projetoB = await createProject(wsB.id, dono.id);
  await addMember(wsA.id, user.id, 15, projetoVisivel.id);

  const entityA = await createEntity(wsA.id);
  const entityB = await createEntity(wsB.id);
  seed.entityA = entityA.id;
  seed.entityB = entityB.id;

  seed.issueVisivel = (await createIssue(projetoVisivel.id, wsA.id, { entityId: entityA.id })).id;
  seed.issueOutroProjeto = (await createIssue(projetoFechado.id, wsA.id, { entityId: entityA.id })).id;
  seed.issueOutroWorkspace = (await createIssue(projetoB.id, wsB.id)).id;

  await ensureIntake(projetoVisivel.id, wsA.id);
  await ensureIntake(projetoFechado.id, wsA.id);
  await ensureIntake(projetoB.id, wsB.id);

  seed.colegaId = dono.id;
  seed.estranhoId = (await createUser()).id;
});

afterAll(() => cleanDb());

for (const gateway of GATEWAYS) {
  describe(`gateway de ${gateway.nome}`, () => {
    let extensaoId = "";

    beforeAll(async () => {
      extensaoId = await gateway.createExtensao();
    });

    const get = (path: string) =>
      fetch(`${TEST_API_BASE_URL}/api/v1/${gateway.prefixo}${path}`, {
        headers: { "X-Api-Key": seed.token, [gateway.header]: extensaoId },
      });

    const ROTAS_DE_LISTA = [
      "/worker-items",
      "/worker-items/stats",
      "/intakes",
      "/intakes/stats",
      "/actions",
      "/actions/stats",
      "/stats/overview",
      "/stats/period?start_date=2000-01-01&end_date=2100-01-01",
      "/users",
      "/entities",
    ];

    it.each(ROTAS_DE_LISTA)("%s sem workspace_slug responde 400", async (rota) => {
      expect((await get(rota)).status).toBe(400);
    });

    it.each(ROTAS_DE_LISTA)("%s em workspace de que não é membro responde 403", async (rota) => {
      const junta = rota.includes("?") ? "&" : "?";
      expect((await get(`${rota}${junta}workspace_slug=${seed.wsB}`)).status).toBe(403);
    });

    it("lista só os chamados dos projetos do membro", async () => {
      const data = (await (await get(`/worker-items?workspace_slug=${seed.wsA}`)).json()) as any;
      expect(data.data.map((i: any) => i.id)).toEqual([seed.issueVisivel]);
      expect(data.total).toBe(1);
    });

    it("ações e estatísticas seguem o mesmo recorte", async () => {
      const acoes = (await (await get(`/actions?workspace_slug=${seed.wsA}`)).json()) as any;
      expect(acoes.total).toBe(1);
      const stats = (await (await get(`/worker-items/stats?workspace_slug=${seed.wsA}`)).json()) as any;
      expect(stats.total).toBe(1);
      const overview = (await (await get(`/stats/overview?workspace_slug=${seed.wsA}`)).json()) as any;
      expect(overview.worker_items_total).toBe(1);
      expect(overview.intakes_total).toBe(1);
    });

    it("triagens só dos projetos do membro", async () => {
      const data = (await (await get(`/intakes?workspace_slug=${seed.wsA}`)).json()) as any;
      expect(data.total).toBe(1);
    });

    it("chamado por id: só o visível", async () => {
      expect((await get(`/worker-items/${seed.issueVisivel}?workspace_slug=${seed.wsA}`)).status).toBe(200);
      expect((await get(`/worker-items/${seed.issueOutroProjeto}?workspace_slug=${seed.wsA}`)).status).toBe(404);
      expect((await get(`/worker-items/${seed.issueOutroWorkspace}?workspace_slug=${seed.wsA}`)).status).toBe(404);
      expect((await get(`/actions/${seed.issueOutroWorkspace}?workspace_slug=${seed.wsA}`)).status).toBe(404);
      expect((await get(`/worker-items/${seed.issueVisivel}`)).status).toBe(400);
    });

    it("entidade por id: só do workspace", async () => {
      expect((await get(`/entities/${seed.entityA}?workspace_slug=${seed.wsA}`)).status).toBe(200);
      expect((await get(`/entities/${seed.entityB}?workspace_slug=${seed.wsA}`)).status).toBe(404);
    });

    it("estatística da entidade conta só os chamados visíveis", async () => {
      const data = (await (await get(`/stats/entity/${seed.entityA}?workspace_slug=${seed.wsA}`)).json()) as any;
      expect(data.total).toBe(1);
    });

    it("usuários: só membros do workspace", async () => {
      const data = (await (await get(`/users?workspace_slug=${seed.wsA}`)).json()) as any;
      const ids = data.data.map((u: any) => u.id);
      expect(ids).toContain(seed.colegaId);
      expect(ids).not.toContain(seed.estranhoId);
      expect((await get(`/users/${seed.estranhoId}?workspace_slug=${seed.wsA}`)).status).toBe(404);
      expect((await get(`/users/${seed.colegaId}?workspace_slug=${seed.wsA}`)).status).toBe(200);
    });

    it("o próprio usuário continua acessível sem workspace", async () => {
      expect((await get("/users/me")).status).toBe(200);
    });
  });
}

describe("gateway de plugin: rotas próprias", () => {
  let pluginId = "";

  beforeAll(async () => {
    pluginId = await GATEWAYS[0].createExtensao();
  });

  const call = (path: string, init: RequestInit = {}) =>
    fetch(`${TEST_API_BASE_URL}/api/v1/plugin-sdk${path}`, {
      ...init,
      headers: { "X-Api-Key": seed.token, "X-Plugin-Id": pluginId, "Content-Type": "application/json" },
    });

  it("permissões de workspace alheio respondem 403", async () => {
    expect((await call(`/me/permissions?workspace_slug=${seed.wsB}`)).status).toBe(403);
    expect((await call(`/me/permissions?workspace_slug=${seed.wsA}`)).status).toBe(200);
  });

  it("config de workspace alheio responde 403", async () => {
    expect((await call(`/config?workspace_slug=${seed.wsB}`)).status).toBe(403);
    expect((await call(`/config?workspace_slug=${seed.wsA}`)).status).toBe(200);
  });

  it("proxy do backend não assina workspace alheio", async () => {
    expect((await call(`/backend/ping?workspace_slug=${seed.wsB}`)).status).toBe(403);
  });

  it("sem PLUGIN_BRIDGE_SECRET o proxy responde 503", async () => {
    const res = await call(`/backend/ping?workspace_slug=${seed.wsA}`);
    expect(res.status).toBe(503);
    const data = (await res.json()) as any;
    expect(data.detail).not.toContain("PLUGIN_BRIDGE_SECRET");
  });
});
