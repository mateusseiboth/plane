/**
 * Situação da visita técnica: a tabela de status do Plane e a tradução do SAC legado.
 *
 * O importador antigo gravava `visita_situacao === 1 ? 1 : 0` e trazia só as visitas
 * com `visita_status = 1`. No Plane o 1 é "Em Andamento": toda visita já concluída
 * no SAC aparecia como em andamento, e as canceladas nem chegavam. Funções puras, sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  getLegacyImportStatusV1,
  LEGACY_VISITA_STATUS_SQL,
  mapLegacyVisitStatus,
  planVisitStatusCorrections,
} from "@modules/technical-visit/legacy-visit-status";
import { getVisitStatusLabel, VISIT_STATUS } from "@modules/technical-visit/visit-status";

describe("VISIT_STATUS", () => {
  it("mantém os códigos gravados no banco", () => {
    expect(VISIT_STATUS).toEqual({
      AGENDADA: 0,
      EM_ANDAMENTO: 1,
      RELATORIO: 2,
      AGUARDANDO_ASSINATURA: 3,
      CONCLUIDA: 4,
      CANCELADA: 5,
    });
  });

  it("traduz o código para o rótulo da tela", () => {
    expect(getVisitStatusLabel(VISIT_STATUS.CONCLUIDA)).toBe("Concluída");
    expect(getVisitStatusLabel(VISIT_STATUS.CANCELADA)).toBe("Cancelada");
    expect(getVisitStatusLabel(99)).toBe("Desconhecido");
  });
});

describe("mapLegacyVisitStatus", () => {
  it("situação 0 é visita agendada", () => {
    expect(mapLegacyVisitStatus({ visita_situacao: 0, visita_status: 1 })).toBe(VISIT_STATUS.AGENDADA);
  });

  it("situação 1 é visita concluída, não em andamento", () => {
    expect(mapLegacyVisitStatus({ visita_situacao: 1, visita_status: 1 })).toBe(VISIT_STATUS.CONCLUIDA);
  });

  it("status 0 é visita cancelada, qualquer que seja a situação", () => {
    expect(mapLegacyVisitStatus({ visita_situacao: 0, visita_status: 0 })).toBe(VISIT_STATUS.CANCELADA);
    expect(mapLegacyVisitStatus({ visita_situacao: 1, visita_status: 0 })).toBe(VISIT_STATUS.CANCELADA);
  });

  it("aceita o número em texto", () => {
    expect(mapLegacyVisitStatus({ visita_situacao: "1", visita_status: "1" })).toBe(VISIT_STATUS.CONCLUIDA);
    expect(mapLegacyVisitStatus({ visita_situacao: "0", visita_status: "0" })).toBe(VISIT_STATUS.CANCELADA);
  });

  it("status nulo NÃO vira cancelada (Number(null) seria 0)", () => {
    expect(mapLegacyVisitStatus({ visita_situacao: 1, visita_status: null })).toBe(VISIT_STATUS.CONCLUIDA);
  });

  it("situação desconhecida cai em agendada", () => {
    expect(mapLegacyVisitStatus({ visita_situacao: 7, visita_status: 1 })).toBe(VISIT_STATUS.AGENDADA);
    expect(mapLegacyVisitStatus({ visita_situacao: null, visita_status: 1 })).toBe(VISIT_STATUS.AGENDADA);
  });
});

describe("getLegacyImportStatusV1", () => {
  it("reproduz o que o importador antigo gravou", () => {
    expect(getLegacyImportStatusV1({ visita_situacao: 1, visita_status: 1 })).toBe(1);
    expect(getLegacyImportStatusV1({ visita_situacao: 0, visita_status: 1 })).toBe(0);
    expect(getLegacyImportStatusV1({ visita_situacao: "1", visita_status: 0 })).toBe(1);
  });
});

describe("LEGACY_VISITA_STATUS_SQL", () => {
  it("traz as ativas e as canceladas", () => {
    expect(LEGACY_VISITA_STATUS_SQL).toBe("v.visita_status IN (0, 1)");
  });
});

describe("planVisitStatusCorrections", () => {
  it("agrupa por (de, para) e só lista o que muda", () => {
    const plano = planVisitStatusCorrections([
      { visita_id: 10, visita_situacao: 1, visita_status: 1 },
      { visita_id: 11, visita_situacao: 1, visita_status: 1 },
      { visita_id: 12, visita_situacao: 0, visita_status: 1 },
      { visita_id: 13, visita_situacao: 0, visita_status: 0 },
      { visita_id: 14, visita_situacao: 1, visita_status: 0 },
    ]);

    expect(plano).toEqual([
      { from: 1, to: VISIT_STATUS.CONCLUIDA, legacyIds: [10, 11] },
      { from: 0, to: VISIT_STATUS.CANCELADA, legacyIds: [13] },
      { from: 1, to: VISIT_STATUS.CANCELADA, legacyIds: [14] },
    ]);
  });

  it("visita agendada no legado não gera correção (já estava certa)", () => {
    expect(planVisitStatusCorrections([{ visita_id: 1, visita_situacao: 0, visita_status: 1 }])).toEqual([]);
  });

  it("ignora linha sem id", () => {
    expect(planVisitStatusCorrections([{ visita_id: null, visita_situacao: 1, visita_status: 1 }])).toEqual([]);
  });
});
