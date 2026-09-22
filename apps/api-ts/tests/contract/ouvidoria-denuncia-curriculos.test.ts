/**
 * Ouvidoria, denúncia interna, currículos e lista de e-mails pela API de
 * verdade: permissões pela matriz (403 sem, 2xx com, concessão por pessoa),
 * rotas internas do robô com autenticação de serviço e o ANONIMATO da
 * denúncia (nada no registro, na auditoria, no log de API nem no "último uso"
 * da chave liga a denúncia a quem a fez).
 *
 * Precisa de uma API rodando contra o banco de teste (API_BASE_URL) com
 * CHAT_SERVICE_TOKEN igual ao deste arquivo.
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
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";
import { setPassword, signIn, withBearer } from "@tests/helpers/session";

type Client = ReturnType<typeof apiClient>;

const SERVICE_TOKEN = process.env.CHAT_SERVICE_TOKEN ?? "token-de-servico-dos-testes";
const CNPJ = "12345678000190";

const interno = (slug: string, caminho: string, init: RequestInit = {}, token: string | null = SERVICE_TOKEN) =>
  fetch(`${TEST_API_BASE_URL}/api/internal/chat/workspaces/${slug}${caminho}`, {
    method: "POST",
    ...init,
    headers: { ...(token ? { "X-Service-Token": token } : {}), ...init.headers },
  });

const internoJson = (slug: string, caminho: string, body: unknown, token?: string | null) =>
  interno(slug, caminho, { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }, token);

const pdf = (conteudo = "%PDF-1.7\nconteudo") => new Blob([conteudo], { type: "application/pdf" });

const enviarCurriculo = (slug: string, campos: Record<string, string>, arquivo: Blob = pdf()) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.append(k, v);
  form.append("file", arquivo, "curriculo da ana.pdf");
  return interno(slug, "/curriculos/", { body: form });
};

describe("ouvidoria, denúncia, currículos e lista de e-mails", () => {
  let slug: string;
  let wsId: string;
  let admin: Client;
  let gestor: Client;
  let membro: Client;
  let membroId: string;
  let membroToken: string;
  let entidadeId: string;
  let projetoId: string;
  let estranho: Client;

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser();
    const ws = await createWorkspace(owner.id);
    slug = ws.slug;
    wsId = ws.id;
    admin = apiClient((await createApiToken(owner.id)).token);
    gestor = apiClient((await createMemberWithToken(ws.id, 18)).token);
    const m = await createMemberWithToken(ws.id, 15);
    membro = apiClient(m.token);
    membroId = m.user.id;
    membroToken = m.token;
    await seedWorkflowRoles(prisma, ws.id);

    const entidade = await createEntity(ws.id, {
      name: "Prefeitura de Teste",
      cnpj: "12.345.678/0001-90",
      entityType: 2,
    });
    entidadeId = entidade.id;
    projetoId = (await createProject(ws.id, owner.id)).id;

    const outro = await createUser();
    const outroWs = await createWorkspace(outro.id);
    await seedWorkflowRoles(prisma, outroWs.id);
    estranho = apiClient((await createApiToken(outro.id)).token);
  });

  afterAll(() => cleanDb());

  describe("rotas internas do robô", () => {
    it("sem o token de serviço, ou com token errado: 401", async () => {
      expect((await internoJson(slug, "/ouvidoria/", {}, null)).status).toBe(401);
      expect((await internoJson(slug, "/ouvidoria/", {}, "errado")).status).toBe(401);
    });

    it("o crachá de um usuário não serve para a rota interna", async () => {
      const res = await fetch(`${TEST_API_BASE_URL}/api/internal/chat/workspaces/${slug}/ouvidoria/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": membroToken },
        body: "{}",
      });
      expect(res.status).toBe(401);
    });
  });

  describe("ouvidoria", () => {
    it("o robô registra; o CNPJ identifica a entidade", async () => {
      const res = await internoJson(slug, "/ouvidoria/", {
        kind: "reclamacao",
        cnpj: CNPJ,
        name: "Maria",
        message: "O sistema caiu.",
        phone: "5567999990000",
      });
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({ kind: "reclamacao", entity: { id: entidadeId }, is_read: false });
    });

    it("CNPJ desconhecido volta no campo", async () => {
      const res = await internoJson(slug, "/ouvidoria/", {
        kind: "sugestao",
        cnpj: "99999999000199",
        name: "X",
        message: "Y",
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as any).errors).toEqual([
        { path: "cnpj", message: "CNPJ não encontrado. Confira os números e envie de novo." },
      ]);
    });

    it("Membro não lê; Gestor lê, filtra, conta e marca como lida (quem e quando)", async () => {
      expect((await membro.get(`/workspaces/${slug}/ouvidoria/`)).status).toBe(403);
      expect((await membro.get(`/workspaces/${slug}/ouvidoria/unread-count/`)).status).toBe(403);
      expect((await estranho.get(`/workspaces/${slug}/ouvidoria/`)).status).toBe(403);

      expect(await (await gestor.get(`/workspaces/${slug}/ouvidoria/unread-count/`)).json()).toEqual({ count: 1 });
      const lista = (await (
        await gestor.get(`/workspaces/${slug}/ouvidoria/?kind=reclamacao&read=false`)
      ).json()) as any;
      expect(lista.results).toHaveLength(1);
      expect((await (await gestor.get(`/workspaces/${slug}/ouvidoria/?kind=sugestao`)).json()) as any).toMatchObject({
        total_count: 0,
      });

      const id = lista.results[0].id;
      const lida = (await (await admin.post(`/workspaces/${slug}/ouvidoria/${id}/read/`, {})).json()) as any;
      expect(lida.is_read).toBe(true);
      expect(typeof lida.read_at).toBe("string");
      expect(lida.read_by).not.toBeNull();
      expect(await (await gestor.get(`/workspaces/${slug}/ouvidoria/unread-count/`)).json()).toEqual({ count: 0 });
    });

    it("concessão por pessoa libera o Membro", async () => {
      await prisma.workspaceMember.updateMany({
        where: { workspaceId: wsId, memberId: membroId },
        data: { grantedActions: ["ouvidoria.read"] },
      });
      expect((await membro.get(`/workspaces/${slug}/ouvidoria/`)).status).toBe(200);
      await prisma.workspaceMember.updateMany({
        where: { workspaceId: wsId, memberId: membroId },
        data: { grantedActions: [] },
      });
    });
  });

  describe("denúncia interna", () => {
    it("qualquer membro denuncia; campos obrigatórios voltam no campo", async () => {
      const res = await membro.post(`/workspaces/${slug}/denuncias/`, { title: "", description: "" });
      expect(res.status).toBe(400);
      expect(((await res.json()) as any).errors.map((e: any) => e.path)).toEqual(["title", "description"]);
      expect((await estranho.post(`/workspaces/${slug}/denuncias/`, { title: "a", description: "b" })).status).toBe(
        403
      );
    });

    it("ANÔNIMA: nada liga a denúncia ao autor", async () => {
      await setPassword(membroId);
      const email = (await prisma.user.findUniqueOrThrow({ where: { id: membroId } })).email;
      const jwt = await signIn(email);
      const token = await prisma.apiToken.findFirstOrThrow({ where: { userId: membroId } });
      // O login grava a própria auditoria sem esperar: deixa assentar antes de contar.
      await Bun.sleep(300);
      const auditoriaAntes = await prisma.auditLog.count();
      const logDeApiAntes = await prisma.apiActivityLog.count();

      // Pelo navegador (sessão) e pela chave de API.
      const pelaSessao = await withBearer(jwt, `/api/v1/workspaces/${slug}/denuncias/`, {
        method: "POST",
        body: JSON.stringify({ title: "Anônima 1", description: "Relato", is_anonymous: true }),
      });
      expect(pelaSessao.status).toBe(201);
      const pelaChave = await membro.post(`/workspaces/${slug}/denuncias/`, {
        title: "Anônima 2",
        description: "Relato",
        is_anonymous: true,
      });
      expect(pelaChave.status).toBe(201);
      await Bun.sleep(200);

      const gravadas = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT * FROM denuncias WHERE title LIKE 'Anônima%'`;
      expect(gravadas).toHaveLength(2);
      for (const linha of gravadas) {
        // Nenhuma coluna guarda o autor, nem hora; o id é v4 (aleatório, sem instante embutido).
        expect(Object.values(linha).map(String).join("|")).not.toContain(membroId);
        expect(linha.author_id).toBeNull();
        expect(Object.keys(linha).toSorted()).toEqual(
          ["author_id", "description", "id", "is_anonymous", "reported_on", "title", "workspace_id"].toSorted()
        );
        expect((linha.reported_on as Date).getUTCHours()).toBe(0);
        expect((linha.reported_on as Date).getUTCMinutes()).toBe(0);
        expect(String(linha.id)[14]).toBe("4");
      }
      expect(await prisma.auditLog.count()).toBe(auditoriaAntes);
      expect(await prisma.apiActivityLog.count()).toBe(logDeApiAntes);
      const tokenDepois = await prisma.apiToken.findUniqueOrThrow({ where: { id: token.id } });
      expect(tokenDepois.lastUsed?.getTime() ?? null).toBe(token.lastUsed?.getTime() ?? null);
    });

    it("identificada: mostra o autor na lista", async () => {
      expect(
        (await membro.post(`/workspaces/${slug}/denuncias/`, { title: "Com nome", description: "Relato" })).status
      ).toBe(201);
      const lista = (await (await gestor.get(`/workspaces/${slug}/denuncias/`)).json()) as any;
      const comNome = lista.results.find((d: any) => d.title === "Com nome");
      expect(comNome.author.id).toBe(membroId);
      for (const d of lista.results.filter((x: any) => x.is_anonymous)) expect(d.author).toBeNull();
    });

    it("a lista é paginada e só para quem tem denuncia.read", async () => {
      expect((await membro.get(`/workspaces/${slug}/denuncias/`)).status).toBe(403);
      const pagina = (await (await admin.get(`/workspaces/${slug}/denuncias/?per_page=2`)).json()) as any;
      expect(pagina.results).toHaveLength(2);
      expect(pagina.next_page_results).toBe(true);
      expect(pagina.total_count).toBe(3);
    });
  });

  describe("currículos", () => {
    let curriculoId: string;

    it("o robô envia o PDF; arquivo que não é PDF volta no campo", async () => {
      const recusado = await enviarCurriculo(slug, { name: "Ana", position: "Programador" }, pdf("MZ nao e pdf"));
      expect(recusado.status).toBe(400);
      expect(((await recusado.json()) as any).errors[0].path).toBe("file");

      const res = await enviarCurriculo(slug, { name: "Ana", position: "Programador", phone: "5567999990000" });
      expect(res.status).toBe(201);
      const criado = (await res.json()) as any;
      expect(criado).toMatchObject({ name: "Ana", position: "Programador", file_name: "curriculo da ana.pdf" });
      curriculoId = criado.id;
    });

    it("Membro não vê; Gestor filtra por vaga, marca lido e entrevistado", async () => {
      expect((await membro.get(`/workspaces/${slug}/curriculos/`)).status).toBe(403);
      const lista = (await (await gestor.get(`/workspaces/${slug}/curriculos/?position=progr`)).json()) as any;
      expect(lista.results.map((c: any) => c.id)).toEqual([curriculoId]);
      expect(await (await gestor.get(`/workspaces/${slug}/curriculos/positions/`)).json()).toEqual(["Programador"]);

      const marcado = (await (
        await gestor.patch(`/workspaces/${slug}/curriculos/${curriculoId}/`, { is_read: true, is_interviewed: true })
      ).json()) as any;
      expect(marcado).toMatchObject({ is_read: true, is_interviewed: true });
      expect(marcado.read_by).not.toBeNull();
    });

    it("download devolve o PDF, sem cache, e fica na auditoria", async () => {
      const res = await gestor.get(`/workspaces/${slug}/curriculos/${curriculoId}/download/`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await res.text()).toBe("%PDF-1.7\nconteudo");
      await Bun.sleep(100);
      expect(
        await prisma.auditLog.count({ where: { entity: "curriculo", entityId: curriculoId, action: "download" } })
      ).toBe(1);
    });

    it("prazo de guarda configurável", async () => {
      expect(await (await gestor.get(`/workspaces/${slug}/curriculos/config/`)).json()).toEqual({
        retention_days: 365,
        site_enabled: false,
      });
      const recusado = await gestor.patch(`/workspaces/${slug}/curriculos/config/`, { retention_days: 5 });
      expect(recusado.status).toBe(400);
      expect(((await recusado.json()) as any).errors[0].path).toBe("retention_days");
      expect(
        await (await gestor.patch(`/workspaces/${slug}/curriculos/config/`, { retention_days: 90 })).json()
      ).toEqual({
        retention_days: 90,
        site_enabled: false,
      });
    });

    it("exclusão definitiva: some o registro e o arquivo", async () => {
      expect((await gestor.delete(`/workspaces/${slug}/curriculos/${curriculoId}/`)).status).toBe(204);
      expect(await prisma.curriculo.count({ where: { id: curriculoId } })).toBe(0);
      expect((await gestor.get(`/workspaces/${slug}/curriculos/${curriculoId}/download/`)).status).toBe(404);
    });
  });

  describe("e-mail do responsável pelo robô", () => {
    it("troca o e-mail e deixa o de/para na auditoria", async () => {
      const contato = await prisma.entityContact.create({
        data: { workspaceId: wsId, entityId: entidadeId, name: "Joana", email: "velho@pref.gov.br" },
      });
      const res = await internoJson(slug, "/responsavel-email/", { contact_id: contato.id, email: "Novo@Pref.gov.br" });
      expect(res.status).toBe(200);
      expect((await prisma.entityContact.findUniqueOrThrow({ where: { id: contato.id } })).email).toBe(
        "novo@pref.gov.br"
      );
      const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "entity_contact", entityId: contato.id } });
      expect(log.changes).toEqual({ email: { de: "velho@pref.gov.br", para: "novo@pref.gov.br" } });

      const invalido = await internoJson(slug, "/responsavel-email/", { contact_id: contato.id, email: "x@" });
      expect(invalido.status).toBe(400);
    });
  });

  describe("lista de e-mails dos responsáveis", () => {
    beforeAll(async () => {
      const [a, b] = await Promise.all([
        prisma.entityContact.create({
          data: { workspaceId: wsId, entityId: entidadeId, name: "Aceita", email: "aceita@pref.gov.br" },
        }),
        prisma.entityContact.create({
          data: {
            workspaceId: wsId,
            entityId: entidadeId,
            name: "Recusa",
            email: "recusa@pref.gov.br",
            receiveMessages: false,
          },
        }),
      ]);
      await prisma.entityContactProject.create({ data: { contactId: a.id, projectId: projetoId, workspaceId: wsId } });
      await prisma.entityContactProject.create({ data: { contactId: b.id, projectId: projetoId, workspaceId: wsId } });
    });

    it("exige contato.export", async () => {
      expect((await membro.get(`/workspaces/${slug}/contact-emails/`)).status).toBe(403);
      expect((await membro.get(`/workspaces/${slug}/contact-emails/export/`)).status).toBe(403);
    });

    it("filtra por sistema, respeita o opt-in e inclui internos quando pedido", async () => {
      const porSistema = (await (
        await gestor.get(`/workspaces/${slug}/contact-emails/?project_ids=${projetoId}`)
      ).json()) as any;
      expect(porSistema.emails).toEqual(["aceita@pref.gov.br"]);

      const comInternos = (await (
        await gestor.get(`/workspaces/${slug}/contact-emails/?project_ids=${projetoId}&include_members=true`)
      ).json()) as any;
      expect(comInternos.total).toBeGreaterThan(1);
      expect(comInternos.items.some((i: any) => i.origem === "interno")).toBe(true);

      const porTipo = (await (await gestor.get(`/workspaces/${slug}/contact-emails/?entity_type=9`)).json()) as any;
      expect(porTipo.total).toBe(0);
    });

    it("exporta CSV e audita a exportação", async () => {
      // A trilha é gravada sem bloquear a resposta: espera com prazo, e conta
      // só este espaço (outros arquivos da suíte também exportam contatos).
      const doEspaco = { workspaceId: wsId, entity: "entity_contact", action: "export" };
      const countExportacoes = () => prisma.auditLog.count({ where: doEspaco });
      const antes = await countExportacoes();
      const res = await gestor.get(`/workspaces/${slug}/contact-emails/export/?entity_id=${entidadeId}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/csv");
      const csv = await res.text();
      expect(csv).toContain("aceita@pref.gov.br;Aceita;Prefeitura de Teste;Responsável");
      expect(csv).not.toContain("recusa@pref.gov.br");
      const prazo = Date.now() + 3000;
      while ((await countExportacoes()) <= antes && Date.now() < prazo) await Bun.sleep(50);
      expect(await countExportacoes()).toBe(antes + 1);
    });
  });
});
