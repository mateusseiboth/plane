/**
 * Pós-atendimento pela API de verdade: fila de chamados e visitas concluídos, as
 * três abas, filtros, registro (chamado × visita), verificação da Qualidade,
 * painel do detalhe, relatório de satisfação e as permissões da matriz
 * (`posatendimento.record`, `posatendimento.verify`, `report.view`), inclusive
 * concessão por pessoa. Precisa de uma API rodando contra o banco de teste.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import {
  addAssignee,
  apiClient,
  createApiToken,
  createEntity,
  createIssue,
  createMemberWithToken,
  createProject,
  createTechnicalVisit,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

type Client = ReturnType<typeof apiClient>;

/** Etapa criada por `createProject`, pelo nome. */
const findStateId = async (projectId: string, name: string) =>
  (await prisma.state.findFirstOrThrow({ where: { projectId, name }, select: { id: true } })).id;

const FORM = { expectativa: 4, classificacao: 3, meio_contato: 1, observacao: "Cliente satisfeito." };

describe("pós-atendimento", () => {
  let slug: string;
  let wsId: string;
  let admin: Client;
  let atendimento: Client;
  let atendimentoId: string;
  let qualidade: Client;
  let ti: Client;
  let tiId: string;
  let entityId: string;
  let concluido: { id: string };
  let emAndamento: { id: string };
  let foraDoSistema: { id: string };
  let visitaConcluida: { id: string };
  let visitaAgendada: { id: string };

  const base = () => `/workspaces/${slug}/pos-atendimento`;
  const fila = async (client: Client, query = "") => {
    const res = await client.get(`${base()}/?${query}`);
    return { res, body: (await res.json()) as any };
  };
  const idsDaFila = async (client: Client, query = "") =>
    (await fila(client, query)).body.results.map((r: any) => r.id);

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser();
    const ws = await createWorkspace(owner.id);
    slug = ws.slug;
    wsId = ws.id;
    admin = apiClient((await createApiToken(owner.id)).token);
    const projeto = await createProject(ws.id, owner.id, { name: "SIARH", identifier: "SIARH" });
    const outroProjeto = await createProject(ws.id, owner.id, { name: "Contábil", identifier: "CONT" });
    const entidade = await createEntity(ws.id, { name: "Prefeitura" });
    entityId = entidade.id;

    const a = await createMemberWithToken(ws.id, 6, projeto.id);
    atendimento = apiClient(a.token);
    atendimentoId = a.user.id;
    qualidade = apiClient((await createMemberWithToken(ws.id, 8, projeto.id)).token);
    const t = await createMemberWithToken(ws.id, 12, projeto.id);
    ti = apiClient(t.token);
    tiId = t.user.id;
    await seedWorkflowRoles(prisma, ws.id);

    concluido = await createIssue(projeto.id, ws.id, {
      name: "Folha travada",
      stateId: await findStateId(projeto.id, "Done"),
      entityId,
      sequenceId: 1,
    });
    await addAssignee(concluido.id, atendimentoId, projeto.id, ws.id);
    emAndamento = await createIssue(projeto.id, ws.id, {
      stateId: await findStateId(projeto.id, "In Progress"),
      sequenceId: 2,
    });
    foraDoSistema = await createIssue(outroProjeto.id, ws.id, {
      stateId: await findStateId(outroProjeto.id, "Done"),
      sequenceId: 1,
    });
    visitaConcluida = await createTechnicalVisit(ws.id, { status: 4, visitNumber: "1-2026", technicianId: tiId });
    await prisma.technicalVisit.update({ where: { id: visitaConcluida.id }, data: { projectIds: [projeto.id] } });
    visitaAgendada = await createTechnicalVisit(ws.id, { status: 0, visitNumber: "2-2026" });
  });

  afterAll(() => cleanDb());

  it("TI sem a ação não vê a fila nem registra", async () => {
    expect((await fila(ti)).res.status).toBe(403);
    expect((await ti.post(`${base()}/issues/${concluido.id}/`, FORM)).status).toBe(403);
  });

  it("fila pendente traz chamado e visita concluídos, e só dos sistemas da pessoa", async () => {
    const { res, body } = await fila(atendimento);
    expect(res.status).toBe(200);
    const ids = body.results.map((r: any) => r.id);
    expect(ids).toContain(concluido.id);
    expect(ids).toContain(visitaConcluida.id);
    expect(ids).not.toContain(emAndamento.id);
    expect(ids).not.toContain(visitaAgendada.id);
    expect(ids).not.toContain(foraDoSistema.id);
    const chamado = body.results.find((r: any) => r.id === concluido.id);
    expect(chamado).toMatchObject({
      origem: "issue",
      code: "SIARH-1",
      title: "Folha travada",
      entity: { id: entityId, name: "Prefeitura" },
      situacao: "pending",
      pos: null,
    });
    expect(chamado.responsaveis.map((p: any) => p.id)).toEqual([atendimentoId]);
    const visita = body.results.find((r: any) => r.id === visitaConcluida.id);
    expect(visita).toMatchObject({ origem: "visit", code: "1-2026" });
    expect(visita.sistemas.map((s: any) => s.name)).toEqual(["SIARH"]);
  });

  it("filtra por origem, entidade e responsável", async () => {
    expect(await idsDaFila(atendimento, "origem=visit")).toEqual([visitaConcluida.id]);
    expect(await idsDaFila(atendimento, `entity_id=${entityId}`)).toEqual([concluido.id]);
    expect(await idsDaFila(atendimento, `responsavel_id=${tiId}`)).toEqual([visitaConcluida.id]);
  });

  it("chamado não concluído é recusado", async () => {
    const res = await atendimento.post(`${base()}/issues/${emAndamento.id}/`, FORM);
    expect(res.status).toBe(422);
  });

  it("chamado fora dos sistemas da pessoa não existe para ela", async () => {
    expect((await atendimento.post(`${base()}/issues/${foraDoSistema.id}/`, FORM)).status).toBe(404);
  });

  it("formulário incompleto volta com cada campo", async () => {
    const res = await atendimento.post(`${base()}/issues/${concluido.id}/`, { observacao: "" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.map((e: any) => e.path)).toEqual(["expectativa", "classificacao", "meio_contato", "observacao"]);
  });

  it("Atendimento registra; o chamado passa para pendente de verificação", async () => {
    const res = await atendimento.post(`${base()}/issues/${concluido.id}/`, FORM);
    expect(res.status).toBe(201);
    const pos = (await res.json()) as any;
    expect(pos).toMatchObject({
      origem: "issue",
      issue_id: concluido.id,
      expectativa_label: "Sim",
      classificacao_label: "Ótimo",
      meio_contato_label: "Telefone",
      situacao: "to_verify",
      verified_at: null,
    });
    expect(pos.recorded_by.id).toBe(atendimentoId);
    expect(await idsDaFila(atendimento)).not.toContain(concluido.id);
    expect(await idsDaFila(atendimento, "situacao=to_verify")).toContain(concluido.id);
    expect((await atendimento.post(`${base()}/issues/${concluido.id}/`, FORM)).status).toBe(409);
  });

  it("painel do chamado mostra o pós feito", async () => {
    const res = await ti.get(`${base()}/issues/${concluido.id}/`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.concluido).toBe(true);
    expect(body.pos.observacao).toBe("Cliente satisfeito.");
  });

  it("Atendimento não verifica; Qualidade verifica com comentário, uma vez só", async () => {
    const { body } = await fila(qualidade, "situacao=to_verify");
    const pos = body.results.find((r: any) => r.id === concluido.id).pos;
    expect((await atendimento.post(`${base()}/${pos.id}/verify/`, {})).status).toBe(403);
    const res = await qualidade.post(`${base()}/${pos.id}/verify/`, { comment: "Conferido por telefone." });
    expect(res.status).toBe(200);
    expect((await res.json()) as any).toMatchObject({
      situacao: "verified",
      verification_comment: "Conferido por telefone.",
    });
    expect((await qualidade.post(`${base()}/${pos.id}/verify/`, {})).status).toBe(409);
    expect(await idsDaFila(qualidade, "situacao=verified")).toContain(concluido.id);
  });

  it("visita exige o problema resolvido; Qualidade registra já verificado", async () => {
    const url = `${base()}/visits/${visitaConcluida.id}/`;
    const semProblema = await qualidade.post(url, FORM);
    expect(semProblema.status).toBe(400);
    expect(((await semProblema.json()) as any).errors.map((e: any) => e.path)).toEqual(["problema_resolvido"]);
    const res = await qualidade.post(url, { ...FORM, classificacao: 1, problema_resolvido: "parcial" });
    expect(res.status).toBe(201);
    expect((await res.json()) as any).toMatchObject({
      origem: "visit",
      problema_resolvido_label: "Parcialmente",
      situacao: "verified",
    });
    const painel = (await (await atendimento.get(url)).json()) as any;
    expect(painel.pos.visit_id).toBe(visitaConcluida.id);
  });

  it("visita agendada é recusada", async () => {
    const res = await atendimento.post(`${base()}/visits/${visitaAgendada.id}/`, {
      ...FORM,
      problema_resolvido: "sim",
    });
    expect(res.status).toBe(422);
  });

  it("concessão por pessoa libera a fila para o TI", async () => {
    const put = await admin.put(`/workspaces/${slug}/roles/members/${tiId}/`, {
      granted: ["posatendimento.record"],
      revoked: [],
    });
    expect(put.status).toBe(200);
    expect((await fila(ti)).res.status).toBe(200);
  });

  it("relatório de satisfação exige report.view e distribui as notas", async () => {
    expect((await atendimento.get(`${base()}/report/`)).status).toBe(403);
    const res = await admin.get(`${base()}/report/`);
    expect(res.status).toBe(200);
    const r = (await res.json()) as any;
    expect(r.total).toBe(2);
    expect(r.classificacao.find((c: any) => c.codigo === 3).total).toBe(1);
    expect(r.classificacao.find((c: any) => c.codigo === 1).total).toBe(1);
    expect(r.por_sistema.find((s: any) => s.name === "SIARH").total).toBe(2);
    expect(r.por_entidade.find((e: any) => e.name === "Prefeitura").total).toBe(1);

    const itens = (await (await admin.get(`${base()}/report/items/?classificacao=1`)).json()) as any;
    expect(itens.results.map((i: any) => i.id)).toEqual([visitaConcluida.id]);
    expect(itens.results[0].pos.classificacao_label).toBe("Ruim");
  });

  it("outro espaço não enxerga nada", async () => {
    const outro = await createUser();
    const outroWs = await createWorkspace(outro.id);
    await seedWorkflowRoles(prisma, outroWs.id);
    const estranho = apiClient((await createApiToken(outro.id)).token);
    expect((await estranho.get(`${base()}/`)).status).toBe(403);
    expect((await estranho.get(`/workspaces/${outroWs.slug}/pos-atendimento/issues/${concluido.id}/`)).status).toBe(
      404
    );
    expect(wsId).toBeTruthy();
  });
});
