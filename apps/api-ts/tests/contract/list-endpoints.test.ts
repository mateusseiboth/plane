/**
 * Contrato das rotas de LISTAGEM.
 *
 * A forma da resposta NÃO é uniforme: algumas rotas devolvem array puro e outras
 * um envelope paginado ({results, total_count, next_cursor, …}). O frontend
 * depende dessa diferença, então cada rota é fixada aqui — junto com paginação,
 * filtros, isolamento entre workspaces e autorização.
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {
  addMember,
  apiClient,
  createApiToken,
  createCycle,
  createEntity,
  createIntakeIssue,
  createIssue,
  createLabel,
  createMemberWithToken,
  createModule,
  createProject,
  createState,
  createSticky,
  createTechnicalVisit,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

type Envelope = {
  results: any[];
  total_count: number;
  total_results: number;
  next_cursor: string;
  prev_cursor: string;
  next_page_results: boolean;
  prev_page_results: boolean;
};

describe("Rotas de listagem", () => {
  let client: ReturnType<typeof apiClient>;
  let adminId: string;
  let wsSlug: string;
  let workspaceId: string;
  let projectId: string;
  let otherProjectId: string;
  let cycleId: string;
  let entityAtiva: string;
  let entityInativa: string;
  let technicianId: string;
  let visitAgendada: string;
  let visitConcluida: string;
  // segundo workspace, para provar isolamento
  let otherSlug: string;
  let otherClient: ReturnType<typeof apiClient>;

  beforeAll(async () => {
    await cleanDb();
    const admin = await createUser();
    adminId = admin.id;
    client = apiClient((await createApiToken(admin.id)).token);
    const ws = await createWorkspace(admin.id);
    wsSlug = ws.slug;
    workspaceId = ws.id;

    projectId = (await createProject(ws.id, admin.id, {identifier: "MAIN"})).id;
    otherProjectId = (await createProject(ws.id, admin.id, {identifier: "SEC"})).id;

    await createLabel(projectId, workspaceId, {name: "Correção", slaHours: 16});
    await createLabel(projectId, workspaceId, {name: "Melhoria"});
    await createState(projectId, workspaceId, {name: "Aguardando cliente", group: "backlog"});
    cycleId = (await createCycle(projectId, workspaceId, admin.id, {name: "Ciclo 1"})).id;
    await createModule(projectId, workspaceId, {name: "Módulo 1"});
    await createSticky(workspaceId, admin.id, {title: "Lembrete"});
    await createIssue(projectId, workspaceId, {name: "Chamado listável", sequenceId: 1});
    await createIntakeIssue(projectId, workspaceId, {name: "Intake pendente", status: -2, createdById: admin.id});
    await createIntakeIssue(projectId, workspaceId, {name: "Intake aceito", status: 1, createdById: admin.id});

    entityAtiva = (await createEntity(ws.id, {name: "Cliente Ativo", isActive: true})).id;
    entityInativa = (await createEntity(ws.id, {name: "Cliente Inativo", isActive: false})).id;

    const tech = await createMemberWithToken(ws.id, 15, projectId, 15);
    technicianId = tech.user.id;
    visitAgendada = (
      await createTechnicalVisit(ws.id, {
        technicianId,
        entityId: entityAtiva,
        status: 0,
        scheduledDate: new Date("2026-05-10T09:00:00Z"),
        city: "Blumenau",
      })
    ).id;
    visitConcluida = (
      await createTechnicalVisit(ws.id, {
        technicianId: adminId,
        entityId: entityInativa,
        status: 2,
        scheduledDate: new Date("2026-07-20T09:00:00Z"),
        city: "Joinville",
      })
    ).id;

    await prisma.notification.createMany({
      data: [
        {
          workspaceId,
          projectId,
          receiverId: adminId,
          actorId: adminId,
          title: "Lida",
          entity: "issue",
          entityId: projectId,
          isRead: true,
        },
        {
          workspaceId,
          projectId,
          receiverId: adminId,
          actorId: adminId,
          title: "Não lida",
          entity: "issue",
          entityId: projectId,
          isRead: false,
        },
      ],
    });

    // Segundo workspace com dados equivalentes.
    const outsider = await createUser();
    const ws2 = await createWorkspace(outsider.id);
    otherSlug = ws2.slug;
    otherClient = apiClient((await createApiToken(outsider.id)).token);
    const project2 = await createProject(ws2.id, outsider.id, {identifier: "ALHE"});
    await createEntity(ws2.id, {name: "Entidade Alheia"});
    await createLabel(project2.id, ws2.id, {name: "Etiqueta Alheia"});
    await createIssue(project2.id, ws2.id, {name: "Chamado Alheio"});
    await createTechnicalVisit(ws2.id, {status: 0});
    await createSticky(ws2.id, outsider.id, {title: "Nota Alheia"});
  });

  afterAll(() => cleanDb());

  const ws = (p: string) => `/workspaces/${wsSlug}${p}`;
  const proj = (p: string) => `/workspaces/${wsSlug}/projects/${projectId}${p}`;

  async function getJson(path: string, c = client): Promise<any> {
    const res = await c.get(path);
    expect(res.status).toBe(200);
    return res.json();
  }

  function expectEnvelope(data: any): Envelope {
    expect(data.results).toBeInstanceOf(Array);
    expect(typeof data.total_count).toBe("number");
    expect(typeof data.next_cursor).toBe("string");
    expect(typeof data.prev_cursor).toBe("string");
    expect(typeof data.next_page_results).toBe("boolean");
    expect(typeof data.prev_page_results).toBe("boolean");
    return data as Envelope;
  }

  // ── Forma da resposta ──────────────────────────────────────────────────────

  describe("rotas que devolvem ARRAY puro", () => {
    const arrayRoutes: [string, () => string][] = [
      // O store percorre a resposta com `for..of`; envelope aqui quebra a tela.
      ["páginas do projeto", () => proj("/pages/")],
      // `fetchArchived`/`fetchFavorites` tipam o retorno como `TPage[]`.
      ["páginas arquivadas do projeto", () => proj("/archived-pages/")],
      ["páginas favoritas do projeto", () => proj("/favorite-pages/")],
      ["páginas arquivadas do workspace", () => ws("/archived-pages/")],
      ["páginas favoritas do workspace", () => ws("/favorite-pages/")],
      ["workspaces do usuário", () => "/workspaces/"],
      ["projetos", () => ws("/projects/")],
      ["membros do workspace", () => ws("/members/")],
      ["convites do workspace", () => ws("/invitations/")],
      ["labels do workspace", () => ws("/labels/")],
      ["estados do workspace", () => ws("/states/")],
      ["estimativas do workspace", () => ws("/estimates/")],
      ["favoritos do usuário", () => ws("/user-favorites/")],
      ["visitas recentes", () => ws("/recent-visits/")],
      ["chamados urgentes", () => ws("/urgent-issues/")],
      ["links rápidos", () => ws("/quick-links/")],
      ["tipos de chamado", () => ws("/issue-types/")],
      ["propriedades de chamado", () => ws("/issue-properties/")],
      ["papéis do workspace", () => ws("/roles/")],
      // `fetchWorkspaceCycles` também percorre o corpo direto — mesma
      // serialização `ICycle` da listagem do projeto.
      ["ciclos do workspace", () => ws("/cycles/")],
      // `cycle.store.ts` faz `response.forEach(...)` direto no corpo em
      // fetchAllCycles/fetchActiveCycle, e o CycleService tipa o retorno como
      // `ICycle[]` — envelope aqui deixava o quadro de ciclos vazio.
      ["ciclos do projeto", () => proj("/cycles/")],
      // Mesmo motivo em fetchArchivedCycles.
      ["ciclos arquivados do projeto", () => proj("/archived-cycles/")],
      // `CycleService.addCycleToFavorites` e o painel de favoritos leem a lista
      // direto; ainda não existia rota.
      ["ciclos favoritos do projeto", () => proj("/user-favorite-cycles/")],
      ["estados do projeto", () => proj("/states/")],
      ["labels do projeto", () => proj("/labels/")],
      ["módulos do projeto", () => proj("/modules/")],
      ["estimativas do projeto", () => proj("/estimates/")],
      ["membros do projeto", () => proj("/members/")],
      ["intakes do projeto", () => proj("/intakes/")],
      ["views favoritas do projeto", () => proj("/user-favorite-views/")],
      ["deploy boards do projeto", () => proj("/deploy-boards/")],
      ["meus workspaces", () => "/users/me/workspaces/"],
      ["meus convites", () => "/users/me/workspaces/invitations/"],
    ];

    it.each(arrayRoutes)("%s devolve array", async (_label, url) => {
      const data = await getJson(url());
      expect(data).toBeInstanceOf(Array);
    });

    it("labels do projeto trazem sla_hours e ordenação estável", async () => {
      const labels = await getJson(proj("/labels/"));
      expect(labels.map((l: any) => l.name).sort()).toEqual(["Correção", "Melhoria"]);
      expect(labels.find((l: any) => l.name === "Correção").sla_hours).toBe(16);
    });

    it("estados do projeto vêm ordenados por sequence e sem triagem", async () => {
      const states = await getJson(proj("/states/"));
      const sequences = states.map((s: any) => s.sequence);
      expect([...sequences].sort((a: number, b: number) => a - b)).toEqual(sequences);
      expect(states.every((s: any) => s.project_id === projectId)).toBe(true);
    });

    it("membros do projeto trazem o papel", async () => {
      const members = await getJson(proj("/members/"));
      expect(members.length).toBeGreaterThan(0);
      expect(members.every((m: any) => typeof m.role === "number")).toBe(true);
    });
  });

  describe("rotas que devolvem ENVELOPE paginado", () => {
    const envelopeRoutes: [string, () => string][] = [
      ["membros de projeto (workspace)", () => ws("/project-members/")],
      ["módulos do workspace", () => ws("/modules/")],
      ["stickies", () => ws("/stickies/")],
      ["favoritos", () => ws("/favorites/")],
      ["chamados do workspace", () => ws("/issues/")],
      ["chamados detalhados", () => ws("/issues-detail/")],
      ["intake global", () => ws("/global-intake-issues/")],
      ["rascunhos", () => ws("/draft-issues/")],
      ["entidades", () => ws("/entities/")],
      ["visitas técnicas", () => ws("/technical-visits/")],
      ["views do workspace", () => ws("/views/")],
      ["páginas do workspace", () => ws("/pages/")],
      ["webhooks", () => ws("/webhooks/")],
      ["jobs de importação", () => ws("/import-jobs/")],
      // A tela "Exportações anteriores" navega por next_cursor/prev_cursor.
      ["histórico de exportações", () => ws("/export-issues/")],
      ["analytic views", () => ws("/analytic-view/")],
      ["notificações", () => ws("/users/notifications/")],
      ["chamados do projeto", () => proj("/issues/")],
      // Os chamados de um ciclo continuam em envelope: o store de chamados lê
      // `results`/`total_count` para paginar o quadro.
      ["chamados do ciclo", () => proj(`/cycles/${cycleId}/cycle-issues/`)],
      ["convites do projeto", () => proj("/invitations/")],
      ["views do projeto", () => proj("/views/")],
      ["inbox do projeto", () => proj("/inbox-issues/")],
      ["intake work items", () => proj("/intake-work-items/")],
      ["widgets", () => "/widgets/"],
      ["plugins", () => "/plugins/"],
      ["tokens de API", () => "/users/api-tokens/"],
    ];

    it.each(envelopeRoutes)("%s devolve envelope", async (_label, url) => {
      expectEnvelope(await getJson(url()));
    });

    it("custom-webhooks devolve apenas `results`", async () => {
      const data = await getJson(ws("/custom-webhooks/"));
      expect(data.results).toBeInstanceOf(Array);
    });

    it("plugins instalados do workspace devolvem `installed`", async () => {
      const data = await getJson(ws("/plugins/"));
      expect(data.installed).toBeInstanceOf(Array);
    });
  });

  // ── Paginação ──────────────────────────────────────────────────────────────

  describe("paginação por cursor", () => {
    it("entidades: navega página a página mantendo total_count", async () => {
      const first = expectEnvelope(await getJson(ws("/entities/?cursor=1:0:0")));
      expect(first.results).toHaveLength(1);
      expect(first.total_count).toBe(2);
      expect(first.next_cursor).toBe("1:1:0");
      expect(first.next_page_results).toBe(true);
      expect(first.prev_page_results).toBe(false);

      const second = expectEnvelope(await getJson(ws(`/entities/?cursor=${first.next_cursor}`)));
      expect(second.results).toHaveLength(1);
      expect(second.next_page_results).toBe(false);
      expect(second.prev_page_results).toBe(true);
      expect(second.results[0].id).not.toBe(first.results[0].id);
    });

    it("entidades: página inexistente devolve vazio sem zerar o total", async () => {
      const page = expectEnvelope(await getJson(ws("/entities/?cursor=1:50:0")));
      expect(page.results).toEqual([]);
      expect(page.total_count).toBe(2);
    });

    it("visitas técnicas respeitam o cursor", async () => {
      const page = expectEnvelope(await getJson(ws("/technical-visits/?cursor=1:0:0")));
      expect(page.results).toHaveLength(1);
      expect(page.total_count).toBe(2);
    });

    it("intake global respeita per_page", async () => {
      const page = expectEnvelope(await getJson(ws("/global-intake-issues/?per_page=1")));
      expect(page.results).toHaveLength(1);
      expect(page.next_cursor).toBe("1:1:0");
    });
  });

  // ── Filtros por rota ───────────────────────────────────────────────────────

  describe("filtros de entidades", () => {
    it("is_active=true traz só as ativas", async () => {
      const page = expectEnvelope(await getJson(ws("/entities/?is_active=true")));
      expect(page.results.map((e: any) => e.id)).toEqual([entityAtiva]);
      expect(page.total_count).toBe(1);
    });

    it("is_active=false traz só as inativas", async () => {
      const page = expectEnvelope(await getJson(ws("/entities/?is_active=false")));
      expect(page.results.map((e: any) => e.id)).toEqual([entityInativa]);
    });

    it("sem filtro traz todas, ordenadas por nome", async () => {
      const page = expectEnvelope(await getJson(ws("/entities/")));
      expect(page.results.map((e: any) => e.name)).toEqual(["Cliente Ativo", "Cliente Inativo"]);
    });
  });

  describe("filtros de visitas técnicas", () => {
    it("status", async () => {
      const page = expectEnvelope(await getJson(ws("/technical-visits/?status=2")));
      expect(page.results.map((v: any) => v.id)).toEqual([visitConcluida]);
    });

    it("technician_id", async () => {
      const page = expectEnvelope(await getJson(ws(`/technical-visits/?technician_id=${technicianId}`)));
      expect(page.results.map((v: any) => v.id)).toEqual([visitAgendada]);
    });

    it("entity_id", async () => {
      const page = expectEnvelope(await getJson(ws(`/technical-visits/?entity_id=${entityInativa}`)));
      expect(page.results.map((v: any) => v.id)).toEqual([visitConcluida]);
    });

    it("intervalo date_from/date_to", async () => {
      const page = expectEnvelope(
        await getJson(ws("/technical-visits/?date_from=2026-01-01&date_to=2026-06-01")),
      );
      expect(page.results.map((v: any) => v.id)).toEqual([visitAgendada]);
    });

    it("status + técnico combinados sem correspondência devolvem vazio", async () => {
      const page = expectEnvelope(await getJson(ws(`/technical-visits/?status=2&technician_id=${technicianId}`)));
      expect(page.results).toEqual([]);
      expect(page.total_count).toBe(0);
    });

    it("status inexistente devolve vazio", async () => {
      const page = expectEnvelope(await getJson(ws("/technical-visits/?status=99")));
      expect(page.results).toEqual([]);
    });
  });

  describe("filtros de notificações", () => {
    it("read=true / read=false", async () => {
      const lidas = expectEnvelope(await getJson(ws("/users/notifications/?read=true")));
      expect(lidas.results.map((n: any) => n.title)).toEqual(["Lida"]);
      const naoLidas = expectEnvelope(await getJson(ws("/users/notifications/?read=false")));
      expect(naoLidas.results.map((n: any) => n.title)).toEqual(["Não lida"]);
    });

    it("sem filtro traz as duas", async () => {
      const page = expectEnvelope(await getJson(ws("/users/notifications/")));
      expect(page.total_count).toBe(2);
    });

    it("valor inválido em `read` é ignorado", async () => {
      const page = expectEnvelope(await getJson(ws("/users/notifications/?read=talvez")));
      expect(page.total_count).toBe(2);
    });

    it("contador de não lidas", async () => {
      const data = await getJson(ws("/users/notifications/unread/"));
      expect(data.count).toBe(1);
    });

    it("outro usuário não vê as notificações alheias", async () => {
      const stranger = await createMemberWithToken(workspaceId, 15);
      const page = expectEnvelope(await getJson(ws("/users/notifications/"), apiClient(stranger.token)));
      expect(page.results).toEqual([]);
    });
  });

  describe("filtros de intake", () => {
    it("intake global traz só os pendentes por padrão", async () => {
      const page = expectEnvelope(await getJson(ws("/global-intake-issues/")));
      expect(page.results.every((r: any) => r.status === -2)).toBe(true);
      expect(page.total_count).toBe(1);
    });

    it("status=1 traz os aceitos", async () => {
      const page = expectEnvelope(await getJson(ws("/global-intake-issues/?status=1")));
      expect(page.results.map((r: any) => r.status)).toEqual([1]);
    });

    it("status com CSV aceita vários", async () => {
      const page = expectEnvelope(await getJson(ws("/global-intake-issues/?status=-2,1")));
      expect(page.total_count).toBe(2);
    });

    it("inbox do projeto sem filtro traz todos os registros de intake", async () => {
      const page = expectEnvelope(await getJson(proj("/inbox-issues/")));
      expect(page.total_count).toBe(2);
    });

    it("inbox do projeto filtra por status", async () => {
      const page = expectEnvelope(await getJson(proj("/inbox-issues/?status=1")));
      expect(page.total_count).toBe(1);
      expect(page.results[0].status).toBe(1);
    });

    it("inbox de projeto sem intake devolve lista vazia", async () => {
      const page = expectEnvelope(
        await getJson(`/workspaces/${wsSlug}/projects/${otherProjectId}/inbox-issues/`),
      );
      expect(page.results).toEqual([]);
      expect(page.total_count).toBe(0);
    });
  });

  describe("stickies são por usuário", () => {
    it("o dono vê a própria nota", async () => {
      const page = expectEnvelope(await getJson(ws("/stickies/")));
      expect(page.results.map((s: any) => s.name ?? s.title)).toContain("Lembrete");
    });

    it("outro membro do mesmo workspace não vê as notas alheias", async () => {
      const stranger = await createMemberWithToken(workspaceId, 15);
      const page = expectEnvelope(await getJson(ws("/stickies/"), apiClient(stranger.token)));
      expect(page.results).toEqual([]);
    });
  });

  // ── Isolamento entre workspaces ────────────────────────────────────────────

  describe("isolamento entre workspaces", () => {
    it("entidades de outro workspace não aparecem", async () => {
      const page = expectEnvelope(await getJson(ws("/entities/")));
      expect(page.results.some((e: any) => e.name === "Entidade Alheia")).toBe(false);
    });

    it("labels de outro workspace não aparecem", async () => {
      const labels = await getJson(ws("/labels/"));
      expect(labels.some((l: any) => l.name === "Etiqueta Alheia")).toBe(false);
    });

    it("visitas de outro workspace não aparecem", async () => {
      const page = expectEnvelope(await getJson(ws("/technical-visits/")));
      expect(page.total_count).toBe(2);
    });

    it("projetos de outro workspace não aparecem", async () => {
      const projects = await getJson(ws("/projects/"));
      expect(projects.every((p: any) => p.workspace_id === workspaceId || p.workspace === workspaceId)).toBe(true);
      expect(projects.some((p: any) => p.identifier === "ALHE")).toBe(false);
    });

    it("o outro workspace enxerga apenas os próprios dados", async () => {
      const page = expectEnvelope(await getJson(`/workspaces/${otherSlug}/entities/`, otherClient));
      expect(page.results.map((e: any) => e.name)).toEqual(["Entidade Alheia"]);
    });

    it("stickies não vazam entre workspaces", async () => {
      const page = expectEnvelope(await getJson(`/workspaces/${otherSlug}/stickies/`, otherClient));
      expect(page.results.map((s: any) => s.name ?? s.title)).toEqual(["Nota Alheia"]);
    });
  });

  // ── Autorização ────────────────────────────────────────────────────────────

  describe("autorização", () => {
    const protectedRoutes = [
      () => ws("/entities/"),
      () => ws("/technical-visits/"),
      () => ws("/stickies/"),
      () => ws("/labels/"),
      () => ws("/members/"),
      () => ws("/users/notifications/"),
      () => ws("/issues/"),
      () => ws("/cycles/"),
    ];

    it.each(protectedRoutes.map((r, i) => [i, r] as const))("rota %i devolve 401 sem token", async (_i, url) => {
      const anon = apiClient("nao-existe");
      expect((await anon.get(url())).status).toBe(401);
    });

    it.each(protectedRoutes.map((r, i) => [i, r] as const))(
      "rota %i devolve 403 para quem não é membro",
      async (_i, url) => {
        const res = await otherClient.get(url());
        expect(res.status).toBe(403);
      },
    );

    it("workspace inexistente devolve 404", async () => {
      expect((await client.get("/workspaces/slug-que-nao-existe/entities/")).status).toBe(404);
      expect((await client.get("/workspaces/slug-que-nao-existe/technical-visits/")).status).toBe(404);
    });

    it("projeto inexistente devolve 404 nas listagens de projeto", async () => {
      const missing = `/workspaces/${wsSlug}/projects/00000000-0000-0000-0000-000000000000`;
      expect((await client.get(`${missing}/labels/`)).status).toBe(404);
      expect((await client.get(`${missing}/states/`)).status).toBe(404);
      expect((await client.get(`${missing}/cycles/`)).status).toBe(404);
    });

    it("membro do workspace sem acesso ao projeto recebe 403 nas listagens do projeto", async () => {
      const stranger = await createMemberWithToken(workspaceId, 15);
      const strangerClient = apiClient(stranger.token);
      expect((await strangerClient.get(proj("/labels/"))).status).toBe(403);
      expect((await strangerClient.get(proj("/states/"))).status).toBe(403);
    });

    it("visualizador (papel 5) ainda lê as listagens do projeto", async () => {
      const guest = await createUser();
      const token = await createApiToken(guest.id);
      await addMember(workspaceId, guest.id, 5, projectId, 5);
      const guestClient = apiClient(token.token);
      expect((await guestClient.get(proj("/labels/"))).status).toBe(200);
      expect((await guestClient.get(proj("/issues/"))).status).toBe(200);
    });
  });
});
