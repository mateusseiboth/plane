/**
 * Regras puras do pós-atendimento: validação do formulário (chamado × visita),
 * verificação, situação da fila, filtros, montagem do `where` e a agregação do
 * relatório de satisfação. Sem banco.
 */
import { describe, expect, it } from "bun:test";
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";
import {
  CLASSIFICACAO,
  EXPECTATIVA,
  MEIO_CONTATO,
  POS_SITUACAO,
  getMeioContatoLabel,
} from "@modules/pos-atendimento/pos-atendimento.codes";
import {
  buildSatisfacao,
  getConcluidoEm,
  getSituacao,
  mergeByConcluidoEm,
  parseFilaFiltros,
  validatePosInput,
  validateVerifyInput,
} from "@modules/pos-atendimento/pos-atendimento.rules";
import { buildIssueWhere, buildVisitWhere } from "@modules/pos-atendimento/pos-atendimento.query";

const FORM_COMPLETO = {
  expectativa: EXPECTATIVA.SIM,
  classificacao: CLASSIFICACAO.OTIMO,
  meio_contato: MEIO_CONTATO.TELEFONE,
  observacao: "Cliente satisfeito.",
};

describe("formulário do pós-atendimento", () => {
  it("chamado completo passa e vira os nomes do banco", () => {
    const { data, errors } = validatePosInput(FORM_COMPLETO, { origem: "issue", canVerify: false });
    expect(errors).toEqual([]);
    expect(data).toEqual({
      expectativa: 4,
      classificacao: 3,
      meioContato: 1,
      observacao: "Cliente satisfeito.",
      problemaResolvido: null,
    });
  });

  it("aponta cada campo que falta, no caminho que a tela usa", () => {
    const { errors } = validatePosInput({}, { origem: "issue", canVerify: false });
    expect(errors.map((e) => e.path)).toEqual(["expectativa", "classificacao", "meio_contato", "observacao"]);
    expect(errors.every((e) => !e.message.includes("—"))).toBe(true);
  });

  it("recusa código fora da tabela do legado", () => {
    const { errors } = validatePosInput(
      { ...FORM_COMPLETO, expectativa: 9, classificacao: 0, meio_contato: "x" },
      { origem: "issue", canVerify: false }
    );
    expect(errors.map((e) => e.path)).toEqual(["expectativa", "classificacao", "meio_contato"]);
  });

  it("aceita os códigos que chegam como texto do select", () => {
    const { data, errors } = validatePosInput(
      { ...FORM_COMPLETO, expectativa: "3", classificacao: "1", meio_contato: "5" },
      { origem: "issue", canVerify: false }
    );
    expect(errors).toEqual([]);
    expect(data).toMatchObject({ expectativa: 3, classificacao: 1, meioContato: 5 });
  });

  it("MSN só existe no histórico", () => {
    const { errors } = validatePosInput(
      { ...FORM_COMPLETO, meio_contato: MEIO_CONTATO.MSN },
      { origem: "issue", canVerify: true }
    );
    expect(errors.map((e) => e.path)).toEqual(["meio_contato"]);
  });

  it("comunicador interno é da Qualidade (quem verifica), como no legado", () => {
    const semVerificar = validatePosInput(
      { ...FORM_COMPLETO, meio_contato: MEIO_CONTATO.COMUNICADOR_INTERNO },
      { origem: "issue", canVerify: false }
    );
    expect(semVerificar.errors.map((e) => e.path)).toEqual(["meio_contato"]);
    const comVerificar = validatePosInput(
      { ...FORM_COMPLETO, meio_contato: MEIO_CONTATO.COMUNICADOR_INTERNO },
      { origem: "issue", canVerify: true }
    );
    expect(comVerificar.errors).toEqual([]);
  });

  it("observação em branco não conta", () => {
    const { errors } = validatePosInput({ ...FORM_COMPLETO, observacao: "   " }, { origem: "issue", canVerify: false });
    expect(errors.map((e) => e.path)).toEqual(["observacao"]);
  });

  it("problema resolvido é obrigatório na visita", () => {
    const { errors } = validatePosInput(FORM_COMPLETO, { origem: "visit", canVerify: false });
    expect(errors.map((e) => e.path)).toEqual(["problema_resolvido"]);
    const ok = validatePosInput(
      { ...FORM_COMPLETO, problema_resolvido: "parcial" },
      { origem: "visit", canVerify: false }
    );
    expect(ok.errors).toEqual([]);
    expect(ok.data.problemaResolvido).toBe("parcial");
  });

  it("problema resolvido inválido na visita volta para o campo", () => {
    const { errors } = validatePosInput(
      { ...FORM_COMPLETO, problema_resolvido: "talvez" },
      { origem: "visit", canVerify: false }
    );
    expect(errors.map((e) => e.path)).toEqual(["problema_resolvido"]);
  });

  it("no chamado o problema resolvido é ignorado", () => {
    const { data } = validatePosInput(
      { ...FORM_COMPLETO, problema_resolvido: "sim" },
      { origem: "issue", canVerify: false }
    );
    expect(data.problemaResolvido).toBeNull();
  });
});

describe("verificação", () => {
  it("comentário é opcional e em branco vira nulo", () => {
    expect(validateVerifyInput({})).toEqual({ comment: null });
    expect(validateVerifyInput({ comment: "  " })).toEqual({ comment: null });
    expect(validateVerifyInput({ comment: " Conferido " })).toEqual({ comment: "Conferido" });
  });
});

describe("situação da fila", () => {
  it("sem pós, pendente de verificação e verificado", () => {
    expect(getSituacao(null)).toBe(POS_SITUACAO.PENDENTE_POS);
    expect(getSituacao({ verifiedAt: null })).toBe(POS_SITUACAO.PENDENTE_VERIFICACAO);
    expect(getSituacao({ verifiedAt: new Date() })).toBe(POS_SITUACAO.VERIFICADO);
  });
});

describe("rótulos", () => {
  it("código desconhecido do legado não quebra a tela", () => {
    expect(getMeioContatoLabel(1)).toBe("Telefone");
    expect(getMeioContatoLabel(0)).toBe("Não informado");
    expect(getMeioContatoLabel(null)).toBe("Não informado");
  });
});

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("filtros da fila", () => {
  it("padrão é pendente de pós, das duas origens", () => {
    expect(parseFilaFiltros({})).toEqual({ situacao: "pending", origem: "all" });
  });

  it("lê situação, origem, sistema, entidade, responsável e período", () => {
    const f = parseFilaFiltros({
      situacao: "verified",
      origem: "visit",
      project_id: UUID_A,
      entity_id: UUID_B,
      responsavel_id: UUID_A,
      desde: "2026-09-01",
      ate: "2026-09-30",
    });
    expect(f).toMatchObject({
      situacao: "verified",
      origem: "visit",
      projectId: UUID_A,
      entityId: UUID_B,
      responsavelId: UUID_A,
    });
    expect(f.desde).toBeInstanceOf(Date);
    expect(f.ate!.getTime()).toBeGreaterThan(f.desde!.getTime());
  });

  it("ignora valor que não é da tabela ou id malformado", () => {
    expect(parseFilaFiltros({ situacao: "x", origem: "y", project_id: "abc", desde: "lixo" })).toEqual({
      situacao: "pending",
      origem: "all",
    });
  });
});

describe("where da fila", () => {
  const escopo = { workspaceId: UUID_A, projectIds: [UUID_A, UUID_B] };

  it("chamado pendente: concluído e sem pós, só nos sistemas da pessoa", () => {
    const where = buildIssueWhere(escopo, { situacao: "pending", origem: "all" });
    expect(where.AND).toContainEqual({ state: { group: "completed" } });
    expect(where.AND).toContainEqual({ posAtendimento: { is: null } });
    expect(where.AND).toContainEqual({ projectId: { in: [UUID_A, UUID_B] } });
    expect(where).toMatchObject({ workspaceId: UUID_A, deletedAt: null, isDraft: false });
  });

  it("sistema filtrado fora do alcance da pessoa não traz nada", () => {
    const where = buildIssueWhere(
      { workspaceId: UUID_A, projectIds: [UUID_A] },
      { situacao: "pending", origem: "all", projectId: UUID_B }
    );
    expect(where.AND).toContainEqual({ projectId: { in: [] } });
  });

  it("visita verificada, do técnico, na entidade e no sistema", () => {
    const where = buildVisitWhere(escopo, {
      situacao: "verified",
      origem: "all",
      responsavelId: UUID_B,
      entityId: UUID_A,
      projectId: UUID_A,
    });
    expect(where.AND).toContainEqual({ posAtendimento: { is: { verifiedAt: { not: null } } } });
    expect(where.AND).toContainEqual({ OR: [{ technicianId: UUID_B }, { technician2Id: UUID_B }] });
    expect(where.AND).toContainEqual({ entityId: UUID_A });
    expect(where.AND).toContainEqual({ projectIds: { array_contains: [UUID_A] } });
  });

  it("visita pendente: concluída e sem pós", () => {
    const where = buildVisitWhere(escopo, { situacao: "pending", origem: "all" });
    expect(where.AND).toContainEqual({ status: VISIT_STATUS.CONCLUIDA });
    expect(where.AND).toContainEqual({ posAtendimento: { is: null } });
  });
});

describe("data de conclusão e intercalação das duas origens", () => {
  it("chamado sem data de conclusão usa a última alteração", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    expect(getConcluidoEm({ completedAt: null, updatedAt: d })).toBe(d);
    expect(getConcluidoEm({ finishedAt: d, updatedAt: new Date() })).toBe(d);
  });

  it("intercala do mais recente para o mais antigo e corta a página", () => {
    const a = [
      { id: "a1", concluidoEm: new Date("2026-09-10") },
      { id: "a2", concluidoEm: new Date("2026-09-01") },
    ];
    const b = [
      { id: "b1", concluidoEm: new Date("2026-09-05") },
      { id: "b2", concluidoEm: new Date("2026-08-01") },
    ];
    expect(mergeByConcluidoEm(a, b, 1, 2).map((x) => x.id)).toEqual(["b1", "a2"]);
    expect(mergeByConcluidoEm(a, b, 0, 10).map((x) => x.id)).toEqual(["a1", "b1", "a2", "b2"]);
  });
});

describe("relatório de satisfação", () => {
  const SIARH = { id: "p1", name: "SIARH" };
  const CONTAB = { id: "p2", name: "Contábil" };
  const PREF = { id: "e1", name: "Prefeitura" };

  it("distribui as notas no total, por sistema e por entidade", () => {
    const r = buildSatisfacao([
      { classificacao: 3, expectativa: 4, sistemas: [SIARH], entidade: PREF },
      { classificacao: 3, expectativa: null, sistemas: [SIARH, CONTAB], entidade: PREF },
      { classificacao: 1, expectativa: 2, sistemas: [], entidade: null },
    ]);
    expect(r.total).toBe(3);
    expect(r.classificacao.find((c) => c.codigo === 3)).toMatchObject({ label: "Ótimo", total: 2 });
    expect(r.classificacao.find((c) => c.codigo === 1)).toMatchObject({ label: "Ruim", total: 1 });
    expect(r.expectativa.find((c) => c.codigo === null)).toMatchObject({ label: "Não informado", total: 1 });
    const siarh = r.por_sistema.find((s) => s.id === "p1");
    expect(siarh).toMatchObject({ name: "SIARH", total: 2, notas: { "3": 2 } });
    expect(r.por_sistema.find((s) => s.id === null)).toMatchObject({ name: "Sem sistema", total: 1 });
    expect(r.por_entidade.find((e) => e.id === "e1")).toMatchObject({ total: 2 });
    expect(r.por_entidade.find((e) => e.id === null)).toMatchObject({ name: "Sem entidade", total: 1 });
    // Mais avaliado primeiro.
    expect(r.por_sistema[0].id).toBe("p1");
  });

  it("percentual sobre o total, com uma casa", () => {
    const r = buildSatisfacao([
      { classificacao: 3, expectativa: 4, sistemas: [], entidade: null },
      { classificacao: 2, expectativa: 4, sistemas: [], entidade: null },
      { classificacao: 2, expectativa: 4, sistemas: [], entidade: null },
    ]);
    expect(r.classificacao.find((c) => c.codigo === 2)?.percentual).toBe(66.7);
  });

  it("vazio não divide por zero", () => {
    const r = buildSatisfacao([]);
    expect(r.total).toBe(0);
    expect(r.classificacao.every((c) => c.percentual === 0)).toBe(true);
  });
});
