/**
 * Visitas técnicas (W08) pela API de verdade: técnicos, número N-AAAA, cidade da
 * entidade, visita criada a partir de um chamado, chamados vinculados, trava ao
 * encerrar, funcionalidades (módulos), anexo do relatório, lista com vencidas e
 * quem pode mexer em quê pela matriz. Precisa da API rodando contra o banco de
 * teste (API_BASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";
import { getAnoDaVisita } from "@modules/technical-visit/visit-number";
import { cleanDb } from "@tests/helpers/setup";
import {
  TEST_API_BASE_URL,
  apiClient,
  createApiToken,
  createEntity,
  createIssue,
  createMemberWithToken,
  createModule,
  createProject,
  createUser,
  createWorkspace,
  projectStates,
} from "@tests/helpers/factory";

const ANO = getAnoDaVisita(new Date());

const RELATORIO = {
  started_at: "2026-05-04T12:00:00Z",
  finished_at: "2026-05-04T18:00:00Z",
  summary: "<p>Folha não fechava</p>",
  conclusion: "<p>Folha fechada</p>",
  mot_bug_fix: true,
};

const json = async (res: Response) => (await res.json()) as any;

describe("visitas técnicas", () => {
  let slug: string;
  let wsId: string;
  let projectId: string;
  let identifier: string;
  let entityId: string;
  let admin: ReturnType<typeof apiClient>;
  let gestor: ReturnType<typeof apiClient>;
  let tecnico: ReturnType<typeof apiClient>;
  let tecnicoToken: string;
  let tecnicoId: string;
  let colega: ReturnType<typeof apiClient>;
  let colegaId: string;
  let adminId: string;

  const visitas = (sufixo = "") => `/workspaces/${slug}/technical-visits/${sufixo}`;

  /** Visita do técnico, criada por quem gerencia. */
  const createVisitaDoTecnico = async (extra: Record<string, unknown> = {}) =>
    json(await gestor.post(visitas(), { technician_id: tecnicoId, scheduled_date: "2026-05-04T12:00:00Z", ...extra }));

  const closeIssue = async (issueId: string) => {
    const concluido = (await projectStates(projectId)).byGroup("completed")[0]!;
    await prisma.issue.update({ where: { id: issueId }, data: { stateId: concluido.id } });
  };

  const upload = (token: string, visitId: string, nome = "relatorio-assinado.pdf") => {
    const form = new FormData();
    form.append("file", new File(["%PDF-1.4 assinado"], nome, { type: "application/pdf" }));
    return fetch(`${TEST_API_BASE_URL}/api/v1${visitas(`${visitId}/attachments/`)}`, {
      method: "POST",
      headers: { "X-Api-Key": token },
      body: form,
    });
  };

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser();
    adminId = owner.id;
    const ws = await createWorkspace(owner.id);
    slug = ws.slug;
    wsId = ws.id;
    const project = await createProject(ws.id, owner.id);
    projectId = project.id;
    identifier = project.identifier;
    admin = apiClient((await createApiToken(owner.id)).token);
    const g = await createMemberWithToken(ws.id, 18, projectId, 18);
    gestor = apiClient(g.token);
    const t = await createMemberWithToken(ws.id, 6, projectId, 6);
    tecnico = apiClient(t.token);
    tecnicoToken = t.token;
    tecnicoId = t.user.id;
    const c = await createMemberWithToken(ws.id, 6, projectId, 6);
    colega = apiClient(c.token);
    colegaId = c.user.id;
    await seedWorkflowRoles(prisma, ws.id);
    entityId = (await createEntity(ws.id, { name: "Prefeitura de Bonito", city: "Bonito", state: "MS" })).id;
  });

  afterAll(() => cleanDb());

  describe("criação", () => {
    it("grava técnico e 2º técnico escolhidos, não quem criou", async () => {
      const res = await gestor.post(visitas(), { technician_id: tecnicoId, technician2_id: colegaId });
      expect(res.status).toBe(201);
      const visita = await json(res);
      expect(visita.technician_id).toBe(tecnicoId);
      expect(visita.technician2_id).toBe(colegaId);
      expect(visita.technician.id).toBe(tecnicoId);
      expect(typeof visita.technician.display_name).toBe("string");
    });

    it("sem técnico informado, o técnico é quem criou", async () => {
      const visita = await json(await tecnico.post(visitas(), {}));
      expect(visita.technician_id).toBe(tecnicoId);
    });

    it("técnico de fora do espaço volta para o campo", async () => {
      const estranho = await createUser();
      const res = await gestor.post(visitas(), { technician_id: estranho.id });
      expect(res.status).toBe(400);
      expect((await json(res)).errors).toEqual([{ path: "technician_id", message: expect.any(String) }]);
    });

    it("2º técnico igual ao primeiro é recusado", async () => {
      const res = await gestor.post(visitas(), { technician_id: tecnicoId, technician2_id: tecnicoId });
      expect(res.status).toBe(400);
      expect((await json(res)).errors[0].path).toBe("technician2_id");
    });

    it("cidade vem da entidade e o que foi digitado vence", async () => {
      expect((await json(await gestor.post(visitas(), { entity_id: entityId }))).city).toBe("Bonito");
      expect((await json(await gestor.post(visitas(), { entity_id: entityId, city: "Jardim" }))).city).toBe("Jardim");
    });

    it("visitante não registra visita", async () => {
      const v = await createMemberWithToken(wsId, 5, projectId, 5);
      expect((await apiClient(v.token).post(visitas(), {})).status).toBe(403);
    });
  });

  describe("número N-AAAA", () => {
    it("é gerado no servidor, em sequência no ano, ignorando o que o cliente manda", async () => {
      const outro = await createWorkspace(adminId);
      const cliente = admin;
      const url = `/workspaces/${outro.slug}/technical-visits/`;
      const a = await json(await cliente.post(url, { visit_number: "999-1999" }));
      const b = await json(await cliente.post(url, {}));
      expect(a.visit_number).toBe(`1-${ANO}`);
      expect(b.visit_number).toBe(`2-${ANO}`);
    });

    it("continua depois do maior número do ano que veio do SAC", async () => {
      const outro = await createWorkspace(adminId);
      await prisma.technicalVisit.create({ data: { workspaceId: outro.id, visitNumber: `41-${ANO}` } });
      await prisma.technicalVisit.create({ data: { workspaceId: outro.id, visitNumber: `99-${ANO - 1}` } });
      const nova = await json(await admin.post(`/workspaces/${outro.slug}/technical-visits/`, {}));
      expect(nova.visit_number).toBe(`42-${ANO}`);
    });

    it("criações simultâneas não repetem número", async () => {
      const outro = await createWorkspace(adminId);
      const url = `/workspaces/${outro.slug}/technical-visits/`;
      const criadas = await Promise.all(Array.from({ length: 8 }, () => admin.post(url, {}).then(json)));
      const numeros = criadas.map((v) => v.visit_number);
      expect(new Set(numeros).size).toBe(8);
      expect(numeros).toContain(`8-${ANO}`);
    });
  });

  describe("a partir de um chamado", () => {
    it("nasce vinculada ao chamado, com a entidade e o sistema dele", async () => {
      const chamado = await createIssue(projectId, wsId, { name: "Folha não fecha", entityId, sequenceId: 7 });
      const res = await tecnico.post(visitas(), { issue_ids: [chamado.id] });
      expect(res.status).toBe(201);
      const visita = await json(res);
      expect(visita.entity_id).toBe(entityId);
      expect(visita.city).toBe("Bonito");
      expect(visita.project_ids).toEqual([projectId]);
      expect(visita.issues).toEqual([
        expect.objectContaining({ id: chamado.id, name: "Folha não fecha", code: `${identifier}-7`, is_open: true }),
      ]);
    });

    it("chamado de outro espaço é recusado", async () => {
      const outro = await createWorkspace(adminId);
      const p = await createProject(outro.id, adminId);
      const alheio = await createIssue(p.id, outro.id);
      const res = await tecnico.post(visitas(), { issue_ids: [alheio.id] });
      expect(res.status).toBe(400);
      expect((await json(res)).errors[0].path).toBe("issue_ids");
    });
  });

  describe("chamados vinculados", () => {
    it("vincular e desvincular aparece na resposta da visita", async () => {
      const visita = await createVisitaDoTecnico();
      const chamado = await createIssue(projectId, wsId, { name: "Vincular", sequenceId: 20 });
      const vinculo = await tecnico.post(visitas(`${visita.id}/issues/`), { issue_id: chamado.id });
      expect(vinculo.status).toBe(201);
      expect((await json(vinculo)).issues.map((i: any) => i.id)).toEqual([chamado.id]);
      expect((await json(await tecnico.get(visitas(`${visita.id}/`)))).issues[0].code).toBe(`${identifier}-20`);

      expect((await tecnico.post(visitas(`${visita.id}/issues/`), { issue_id: chamado.id })).status).toBe(409);
      expect((await tecnico.delete(visitas(`${visita.id}/issues/${chamado.id}/`))).status).toBe(204);
      expect((await json(await tecnico.get(visitas(`${visita.id}/`)))).issues).toEqual([]);
    });

    it("chamado de outro espaço não é vinculado", async () => {
      const visita = await createVisitaDoTecnico();
      const outro = await createWorkspace(adminId);
      const p = await createProject(outro.id, adminId);
      const alheio = await createIssue(p.id, outro.id);
      expect((await tecnico.post(visitas(`${visita.id}/issues/`), { issue_id: alheio.id })).status).toBe(404);
    });

    it("quem não é o técnico da visita não vincula", async () => {
      const visita = await createVisitaDoTecnico();
      const chamado = await createIssue(projectId, wsId);
      expect((await colega.post(visitas(`${visita.id}/issues/`), { issue_id: chamado.id })).status).toBe(403);
    });
  });

  describe("encerrar", () => {
    it("sem o relatório preenchido devolve cada campo que falta", async () => {
      const visita = await createVisitaDoTecnico();
      const res = await tecnico.patch(visitas(`${visita.id}/`), { status: VISIT_STATUS.CONCLUIDA });
      expect(res.status).toBe(422);
      const corpo = await json(res);
      expect(corpo.errors.map((e: any) => e.path)).toEqual([
        "started_at",
        "finished_at",
        "summary",
        "conclusion",
        "motivos",
      ]);
      expect((await json(await tecnico.get(visitas(`${visita.id}/`)))).status).toBe(VISIT_STATUS.AGENDADA);
    });

    it("chamado vinculado aberto trava; concluído o chamado, encerra", async () => {
      const chamado = await createIssue(projectId, wsId, { sequenceId: 30 });
      const visita = await createVisitaDoTecnico({ issue_ids: [chamado.id] });
      const res = await tecnico.patch(visitas(`${visita.id}/`), { ...RELATORIO, status: VISIT_STATUS.CONCLUIDA });
      expect(res.status).toBe(422);
      const erro = (await json(res)).errors[0];
      expect(erro.path).toBe("issues");
      expect(erro.message).toContain(`${identifier}-30`);

      // A recusa não grava nada do PATCH: o relatório vai de novo.
      expect((await json(await tecnico.get(visitas(`${visita.id}/`)))).summary).toBeNull();
      await closeIssue(chamado.id);
      const ok = await tecnico.patch(visitas(`${visita.id}/`), { ...RELATORIO, status: VISIT_STATUS.CONCLUIDA });
      expect(ok.status).toBe(200);
      expect((await json(ok)).status).toBe(VISIT_STATUS.CONCLUIDA);
    });

    it("o fim não é inventado ao concluir", async () => {
      const visita = await createVisitaDoTecnico();
      const { finished_at: _fim, ...semFim } = RELATORIO;
      const res = await tecnico.patch(visitas(`${visita.id}/`), { ...semFim, status: VISIT_STATUS.CONCLUIDA });
      expect(res.status).toBe(422);
      expect((await json(res)).errors.map((e: any) => e.path)).toEqual(["finished_at"]);
    });
  });

  describe("quem mexe em quê", () => {
    it("o técnico dono preenche o relatório; o colega não", async () => {
      const visita = await createVisitaDoTecnico();
      expect((await tecnico.patch(visitas(`${visita.id}/`), { summary: "<p>ok</p>" })).status).toBe(200);
      expect((await colega.patch(visitas(`${visita.id}/`), { summary: "<p>meu</p>" })).status).toBe(403);
    });

    it("o dono não troca data nem técnico nem cancela; quem gerencia faz", async () => {
      const visita = await createVisitaDoTecnico();
      const url = visitas(`${visita.id}/`);
      expect((await tecnico.patch(url, { scheduled_date: "2026-06-01T12:00:00Z" })).status).toBe(403);
      expect((await tecnico.patch(url, { technician_id: colegaId })).status).toBe(403);
      expect((await tecnico.patch(url, { status: VISIT_STATUS.CANCELADA })).status).toBe(403);

      const trocada = await json(
        await gestor.patch(url, { technician_id: colegaId, scheduled_date: "2026-06-01T12:00:00Z" })
      );
      expect(trocada.technician_id).toBe(colegaId);
      expect((await gestor.patch(url, { status: VISIT_STATUS.CANCELADA })).status).toBe(200);
      expect((await colega.patch(url, { summary: "<p>depois</p>" })).status).toBe(409);
    });

    it("excluir é de quem gerencia", async () => {
      const visita = await createVisitaDoTecnico();
      expect((await tecnico.delete(visitas(`${visita.id}/`))).status).toBe(403);
      expect((await gestor.delete(visitas(`${visita.id}/`))).status).toBe(204);
    });

    it("concessão por pessoa libera o que a função não dá", async () => {
      const visita = await createVisitaDoTecnico();
      await prisma.workspaceMember.updateMany({
        where: { workspaceId: wsId, memberId: tecnicoId },
        data: { grantedActions: ["visit.manage.all"] },
      });
      const res = await tecnico.patch(visitas(`${visita.id}/`), { scheduled_date: "2026-07-01T12:00:00Z" });
      await prisma.workspaceMember.updateMany({
        where: { workspaceId: wsId, memberId: tecnicoId },
        data: { grantedActions: [] },
      });
      expect(res.status).toBe(200);
    });
  });

  describe("funcionalidades (módulos)", () => {
    it("aceita módulo dos sistemas da visita e recusa de outro sistema", async () => {
      const modulo = await createModule(projectId, wsId, { name: "Folha" });
      const outroSistema = await createProject(wsId, adminId);
      const alheio = await createModule(outroSistema.id, wsId);
      const visita = await createVisitaDoTecnico({ project_ids: [projectId] });
      const url = visitas(`${visita.id}/`);

      const recusa = await tecnico.patch(url, { module_ids: [alheio.id] });
      expect(recusa.status).toBe(400);
      expect((await json(recusa)).errors[0].path).toBe("module_ids");

      const ok = await json(await tecnico.patch(url, { module_ids: [modulo.id] }));
      expect(ok.module_ids).toEqual([modulo.id]);
      expect(ok.modules).toEqual([{ id: modulo.id, name: "Folha", project_id: projectId }]);
      expect(ok.projects[0]).toMatchObject({ id: projectId, identifier });
    });
  });

  describe("anexo do relatório", () => {
    it("envia, lista e baixa", async () => {
      const visita = await createVisitaDoTecnico();
      const res = await upload(tecnicoToken, visita.id);
      expect(res.status).toBe(201);
      const corpo = await json(res);
      expect(corpo.attachments).toEqual([
        expect.objectContaining({ name: "relatorio-assinado.pdf", size: 17, mime_type: "application/pdf" }),
      ]);
      const baixado = await tecnico.get(visitas(`${visita.id}/attachments/${corpo.attachments[0].id}/`));
      expect(baixado.status).toBe(200);
      expect(await baixado.text()).toBe("%PDF-1.4 assinado");
      expect(baixado.headers.get("content-disposition")).toContain("relatorio-assinado.pdf");
    });

    it("em Aguardando Assinatura, anexar o relatório assinado conclui a visita", async () => {
      const visita = await createVisitaDoTecnico(RELATORIO);
      const aguardando = await tecnico.patch(visitas(`${visita.id}/`), { status: VISIT_STATUS.AGUARDANDO_ASSINATURA });
      expect(aguardando.status).toBe(200);
      const corpo = await json(await upload(tecnicoToken, visita.id));
      expect(corpo.status).toBe(VISIT_STATUS.CONCLUIDA);
    });

    it("se a visita não pode encerrar, o anexo não é gravado", async () => {
      const visita = await createVisitaDoTecnico(RELATORIO);
      await tecnico.patch(visitas(`${visita.id}/`), { status: VISIT_STATUS.AGUARDANDO_ASSINATURA });
      const chamado = await createIssue(projectId, wsId, { sequenceId: 40 });
      await tecnico.post(visitas(`${visita.id}/issues/`), { issue_id: chamado.id });
      const res = await upload(tecnicoToken, visita.id);
      expect(res.status).toBe(422);
      const detalhe = await json(await tecnico.get(visitas(`${visita.id}/`)));
      expect(detalhe.attachments).toEqual([]);
      expect(detalhe.status).toBe(VISIT_STATUS.AGUARDANDO_ASSINATURA);
    });

    it("o colega não anexa na visita de outro", async () => {
      const visita = await createVisitaDoTecnico();
      const c = await prisma.apiToken.findFirstOrThrow({ where: { userId: colegaId } });
      expect((await upload(c.token, visita.id)).status).toBe(403);
    });
  });

  describe("lista", () => {
    let slugLista: string;
    let tecnicoLista: string;
    let entidadeLista: string;
    let vencida: string;

    beforeAll(async () => {
      const ws = await createWorkspace(adminId);
      slugLista = ws.slug;
      tecnicoLista = (await createMemberWithToken(ws.id, 6)).user.id;
      entidadeLista = (await createEntity(ws.id, { name: "Câmara" })).id;
      const criar = (data: Record<string, unknown>) =>
        prisma.technicalVisit.create({ data: { workspaceId: ws.id, ...data } as any });
      vencida = (
        await criar({ technicianId: tecnicoLista, scheduledDate: new Date("2026-01-10T12:00:00Z"), status: 0 })
      ).id;
      await criar({ entityId: entidadeLista, scheduledDate: new Date("2026-02-10T12:00:00Z"), status: 4 });
      await criar({ scheduledDate: new Date("2099-01-10T12:00:00Z"), status: 0 });
    });

    const listar = async (q = "") => json(await admin.get(`/workspaces/${slugLista}/technical-visits/${q}`));

    it("marca a vencida", async () => {
      const pagina = await listar();
      const porId = new Map(pagina.results.map((v: any) => [v.id, v.is_overdue]));
      expect(porId.get(vencida)).toBe(true);
      expect([...porId.values()].filter(Boolean)).toHaveLength(1);
    });

    it("filtra vencidas, técnico, entidade e período", async () => {
      expect((await listar("?overdue=true")).results.map((v: any) => v.id)).toEqual([vencida]);
      expect((await listar(`?technician_id=${tecnicoLista}`)).results.map((v: any) => v.id)).toEqual([vencida]);
      expect((await listar(`?entity_id=${entidadeLista}`)).total_count).toBe(1);
      expect((await listar("?date_from=2026-01-01&date_to=2026-02-28")).total_count).toBe(2);
    });

    it("pagina", async () => {
      const primeira = await listar("?cursor=2:0:0");
      expect(primeira.results).toHaveLength(2);
      expect(primeira.total_count).toBe(3);
      expect(primeira.next_page_results).toBe(true);
      expect((await listar(`?cursor=${primeira.next_cursor}`)).results).toHaveLength(1);
    });
  });
});
