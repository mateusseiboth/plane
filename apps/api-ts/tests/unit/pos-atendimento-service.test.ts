/**
 * PosAtendimentoService: registrar (chamado e visita), verificar, painel e a fila
 * intercalando as duas origens. DAO mockado; sem banco.
 */
import { describe, expect, it, mock } from "bun:test";
import { createPosAtendimentoService, type PosDeps } from "@modules/pos-atendimento/pos-atendimento.service";
import {
  PosConflictError,
  PosNotConcludedError,
  PosNotFoundError,
  PosValidationError,
} from "@modules/pos-atendimento/pos-atendimento.errors";
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";

const AGORA = new Date("2026-09-22T15:00:00.000Z");
const WS = "11111111-1111-4111-8111-111111111111";
const PROJ = "22222222-2222-4222-8222-222222222222";
const I1 = "44444444-4444-4444-8444-444444444444";
const V1 = "55555555-5555-4555-8555-555555555555";
const POS1 = "66666666-6666-4666-8666-666666666666";

const posDoBanco = (over: Record<string, unknown> = {}) => ({
  id: POS1,
  createdAt: AGORA,
  updatedAt: AGORA,
  workspaceId: WS,
  issueId: I1,
  visitId: null,
  expectativa: 4,
  classificacao: 3,
  problemaResolvido: null,
  meioContato: 1,
  observacao: "ok",
  recordedById: "atendente",
  recordedAt: AGORA,
  verifiedById: null,
  verifiedAt: null,
  verificationComment: null,
  legacyId: null,
  ...over,
});

const issueDoBanco = (over: Record<string, unknown> = {}) => ({
  id: I1,
  name: "Erro na folha",
  sequenceId: 7,
  ticketSequence: 12,
  ticketYear: 2026,
  projectId: PROJ,
  project: { id: PROJ, name: "SIARH", identifier: "SIARH" },
  entity: { id: "e1", name: "Prefeitura" },
  completedAt: new Date("2026-09-10T12:00:00Z"),
  updatedAt: new Date("2026-09-10T12:00:00Z"),
  assignees: [{ assignee: { id: "u1", displayName: "Ana", firstName: "Ana", lastName: "" } }],
  state: { group: "completed" },
  posAtendimento: null,
  ...over,
});

const visitDoBanco = (over: Record<string, unknown> = {}) => ({
  id: V1,
  visitNumber: "3-2026",
  status: VISIT_STATUS.CONCLUIDA,
  entity: { id: "e1", name: "Prefeitura" },
  finishedAt: new Date("2026-09-15T12:00:00Z"),
  updatedAt: new Date("2026-09-15T12:00:00Z"),
  projectIds: [PROJ],
  technician: { id: "u2", displayName: "Beto", firstName: "Beto", lastName: "" },
  technician2: null,
  posAtendimento: null,
  ...over,
});

const makeService = (overrides: Partial<Record<keyof PosDeps["dao"], unknown>> = {}) => {
  const dao = {
    findIssueAlvo: mock(async () => issueDoBanco()),
    findVisitAlvo: mock(async () => visitDoBanco()),
    createPos: mock(async (data: any) => posDoBanco(data)),
    findPos: mock(async () => ({ ...posDoBanco(), issue: { projectId: PROJ } })),
    updatePos: mock(async (_id: string, data: any) => posDoBanco(data)),
    findIssues: mock(async () => []),
    countIssues: mock(async () => 0),
    findVisits: mock(async () => []),
    countVisits: mock(async () => 0),
    findProjects: mock(async () => [{ id: PROJ, name: "SIARH", identifier: "SIARH" }]),
    findUsuarios: mock(async () => [{ id: "atendente", displayName: "Carla", firstName: "Carla", lastName: "" }]),
    findPosParaRelatorio: mock(async () => []),
    findPosDoRelatorio: mock(async () => []),
    countPosDoRelatorio: mock(async () => 0),
    ...overrides,
  } as unknown as PosDeps["dao"];
  const service = createPosAtendimentoService({ dao, now: () => AGORA });
  return { service, dao };
};

const ctx = { workspaceId: WS, userId: "atendente", canVerify: false, projectIds: [PROJ] };

const FORM = { expectativa: 4, classificacao: 3, meio_contato: 1, observacao: "Cliente satisfeito." };

describe("registrar", () => {
  it("grava o pós do chamado concluído, com quem registrou", async () => {
    const { service, dao } = makeService();
    const dto = await service.record(ctx, "issue", I1, FORM);
    expect((dao.createPos as any).mock.calls[0][0]).toMatchObject({
      workspaceId: WS,
      issueId: I1,
      expectativa: 4,
      classificacao: 3,
      meioContato: 1,
      recordedById: "atendente",
      recordedAt: AGORA,
    });
    expect((dao.createPos as any).mock.calls[0][0].verifiedAt).toBeUndefined();
    expect(dto).toMatchObject({ origem: "issue", situacao: "to_verify", expectativa_label: "Sim" });
    expect(dto.recorded_by?.display_name).toBe("Carla");
  });

  it("quem verifica (Qualidade) já registra verificado, como no legado", async () => {
    const { service, dao } = makeService();
    await service.record({ ...ctx, canVerify: true }, "issue", I1, FORM);
    expect((dao.createPos as any).mock.calls[0][0]).toMatchObject({ verifiedAt: AGORA, verifiedById: "atendente" });
  });

  it("chamado não concluído é recusado sem gravar", async () => {
    const { service, dao } = makeService({
      findIssueAlvo: mock(async () => issueDoBanco({ state: { group: "started" } })),
    });
    const erro = await service.record(ctx, "issue", I1, FORM).catch((e) => e);
    expect(erro).toBeInstanceOf(PosNotConcludedError);
    expect(erro.status).toBe(422);
    expect(dao.createPos).not.toHaveBeenCalled();
  });

  it("segundo pós do mesmo chamado é conflito", async () => {
    const { service } = makeService({
      findIssueAlvo: mock(async () => issueDoBanco({ posAtendimento: posDoBanco() })),
    });
    const erro = await service.record(ctx, "issue", I1, FORM).catch((e) => e);
    expect(erro).toBeInstanceOf(PosConflictError);
    expect(erro.status).toBe(409);
  });

  it("chamado de outro espaço ou fora dos sistemas da pessoa é 404", async () => {
    const { service } = makeService({ findIssueAlvo: mock(async () => null) });
    expect(
      await service.record(ctx, "issue", "33333333-3333-4333-8333-333333333333", FORM).catch((e) => e)
    ).toBeInstanceOf(PosNotFoundError);
  });

  it("formulário incompleto volta com os campos", async () => {
    const { service, dao } = makeService();
    const erro = await service.record(ctx, "visit", V1, FORM).catch((e) => e);
    expect(erro).toBeInstanceOf(PosValidationError);
    expect(erro.errors.map((e: any) => e.path)).toEqual(["problema_resolvido"]);
    expect(dao.createPos).not.toHaveBeenCalled();
  });

  it("visita concluída grava com o problema resolvido", async () => {
    const { service, dao } = makeService();
    await service.record(ctx, "visit", V1, { ...FORM, problema_resolvido: "sim" });
    expect((dao.createPos as any).mock.calls[0][0]).toMatchObject({ visitId: V1, problemaResolvido: "sim" });
  });

  it("visita ainda não concluída é recusada", async () => {
    const { service } = makeService({
      findVisitAlvo: mock(async () => visitDoBanco({ status: VISIT_STATUS.RELATORIO })),
    });
    const erro = await service.record(ctx, "visit", V1, { ...FORM, problema_resolvido: "sim" }).catch((e) => e);
    expect(erro).toBeInstanceOf(PosNotConcludedError);
  });
});

describe("verificar", () => {
  it("marca verificado com comentário", async () => {
    const { service, dao } = makeService();
    await service.verify({ ...ctx, canVerify: true, userId: "qualidade" }, POS1, { comment: "Conferido" });
    expect((dao.updatePos as any).mock.calls[0][1]).toEqual({
      verifiedAt: AGORA,
      verifiedById: "qualidade",
      verificationComment: "Conferido",
    });
  });

  it("verificar de novo é conflito", async () => {
    const { service } = makeService({
      findPos: mock(async () => ({ ...posDoBanco({ verifiedAt: AGORA }), issue: { projectId: PROJ } })),
    });
    expect(await service.verify(ctx, POS1, {}).catch((e) => e)).toBeInstanceOf(PosConflictError);
  });

  it("pós de chamado fora dos sistemas da pessoa é 404", async () => {
    const { service } = makeService({
      findPos: mock(async () => ({ ...posDoBanco(), issue: { projectId: "outro" } })),
    });
    expect(await service.verify(ctx, POS1, {}).catch((e) => e)).toBeInstanceOf(PosNotFoundError);
  });
});

describe("id malformado", () => {
  it("vira 404 sem chegar ao banco", async () => {
    const { service, dao } = makeService();
    expect(await service.getByAlvo(ctx, "issue", "abc").catch((e) => e)).toBeInstanceOf(PosNotFoundError);
    expect(await service.verify(ctx, "abc", {}).catch((e) => e)).toBeInstanceOf(PosNotFoundError);
    expect(dao.findIssueAlvo).not.toHaveBeenCalled();
    expect(dao.findPos).not.toHaveBeenCalled();
  });
});

describe("painel", () => {
  it("chamado concluído sem pós", async () => {
    const { service } = makeService();
    expect(await service.getByAlvo(ctx, "issue", I1)).toEqual({ concluido: true, pos: null });
  });

  it("visita com pós devolve o registro", async () => {
    const { service } = makeService({
      findVisitAlvo: mock(async () => visitDoBanco({ posAtendimento: posDoBanco({ issueId: null, visitId: V1 }) })),
    });
    const painel = await service.getByAlvo(ctx, "visit", V1);
    expect(painel.pos).toMatchObject({ origem: "visit", visit_id: V1 });
  });
});

describe("fila", () => {
  it("intercala chamados e visitas pela data de conclusão", async () => {
    const { service } = makeService({
      findIssues: mock(async () => [issueDoBanco()]),
      countIssues: mock(async () => 1),
      findVisits: mock(async () => [visitDoBanco()]),
      countVisits: mock(async () => 1),
    });
    const pagina = await service.list(ctx, {});
    expect(pagina.total_count).toBe(2);
    expect(pagina.results.map((r: any) => r.origem)).toEqual(["visit", "issue"]);
    const chamado = pagina.results[1] as any;
    expect(chamado).toMatchObject({
      code: "SIARH-7",
      ticket_number: "12-2026",
      title: "Erro na folha",
      entity: { id: "e1", name: "Prefeitura" },
      situacao: "pending",
      pos: null,
    });
    expect(chamado.responsaveis).toEqual([{ id: "u1", display_name: "Ana" }]);
    expect((pagina.results[0] as any).sistemas).toEqual([{ id: PROJ, name: "SIARH", identifier: "SIARH" }]);
  });

  it("origem só visita não consulta chamados", async () => {
    const { service, dao } = makeService();
    await service.list(ctx, { origem: "visit" });
    expect(dao.findIssues).not.toHaveBeenCalled();
    expect(dao.findVisits).toHaveBeenCalled();
  });
});
