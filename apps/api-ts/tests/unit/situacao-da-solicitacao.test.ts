/**
 * A aba "Concluído" das Solicitações globais: a solicitação cujo chamado já
 * terminou. Concluir o chamado hoje marca a solicitação como atendida (3); a
 * aceita (1) cujo chamado está numa etapa concluída é o mesmo caso, de antes
 * dessa marcação automática. "Aceito" fica só com o que ainda está em curso.
 */
import { describe, expect, it } from "bun:test";
import { SITUACAO_CONCLUIDA, buildFiltroDaSituacao, readSituacao } from "@utils/situacao-da-solicitacao";

const CHAMADO_CONCLUIDO = { issue: { state: { group: "completed" } } };

describe("readSituacao", () => {
  it("atendida é concluída", () => {
    expect(readSituacao(3, "completed")).toBe(SITUACAO_CONCLUIDA);
  });

  it("aceita com o chamado concluído é concluída", () => {
    expect(readSituacao(1, "completed")).toBe(SITUACAO_CONCLUIDA);
  });

  it("aceita com o chamado em curso continua aceita", () => {
    expect(readSituacao(1, "started")).toBe("1");
    expect(readSituacao(1, null)).toBe("1");
  });

  it("as demais ficam com o próprio status", () => {
    expect(readSituacao(-2, "triage")).toBe("-2");
    expect(readSituacao(-1, "completed")).toBe("-1");
    expect(readSituacao(2, "completed")).toBe("2");
  });
});

describe("buildFiltroDaSituacao", () => {
  it("concluido junta as atendidas e as aceitas de chamado concluído", () => {
    expect(buildFiltroDaSituacao(["concluido"])).toEqual({
      OR: [{ OR: [{ status: 3 }, { status: 1, ...CHAMADO_CONCLUIDO }] }],
    });
  });

  it("1 deixa de fora as aceitas de chamado concluído", () => {
    expect(buildFiltroDaSituacao(["1"])).toEqual({ OR: [{ status: 1, NOT: CHAMADO_CONCLUIDO }] });
  });

  it("os demais status filtram pelo número", () => {
    expect(buildFiltroDaSituacao(["-2", "0"])).toEqual({ OR: [{ status: -2 }, { status: 0 }] });
  });

  it("valor que não é status nem concluido é ignorado", () => {
    expect(buildFiltroDaSituacao(["abc", "-1"])).toEqual({ OR: [{ status: -1 }] });
  });
});
