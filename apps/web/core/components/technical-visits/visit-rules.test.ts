/**
 * Regras de tela da visita técnica: erro da API por campo, folhas da lista de
 * presença, parâmetros da lista e o que a pessoa pode editar. Puro.
 * Rodar com `bun test core/components/technical-visits`.
 */
import { describe, expect, it } from "bun:test";
import {
  buildTechnicianNames,
  buildTrainingSheets,
  buildVisitListParams,
  getVisitEditMode,
  mapVisitErrors,
} from "./visit-rules";

describe("mapVisitErrors", () => {
  it("indexa as mensagens da API pelo campo, a primeira vence", () => {
    const erros = mapVisitErrors({
      detail: "A visita ainda não pode ser encerrada.",
      errors: [
        { path: "summary", message: "Informe o resumo da visita." },
        { path: "finished_at", message: "Informe a data e a hora de fim." },
        { path: "finished_at", message: "O fim deve ser depois do início." },
      ],
    });
    expect(erros).toEqual({ summary: "Informe o resumo da visita.", finished_at: "Informe a data e a hora de fim." });
  });

  it("resposta sem erros por campo vira objeto vazio", () => {
    expect(mapVisitErrors({ detail: "Sua função não permite esta ação." })).toEqual({});
    expect(mapVisitErrors(undefined)).toEqual({});
  });
});

describe("buildTrainingSheets", () => {
  const visita = {
    projects: [
      { id: "p2", name: "Folha", identifier: "FOLHA" },
      { id: "p1", name: "Contábil", identifier: "CONTAB" },
    ],
    modules: [
      { id: "m1", name: "Cálculo", project_id: "p2" },
      { id: "m2", name: "Empenho", project_id: "p1" },
      { id: "m3", name: "eSocial", project_id: "p2" },
    ],
    contact_records: [
      { id: "c1", name: "Maria" },
      { id: "c2", name: "João" },
    ],
  };

  it("uma folha por sistema, com as funcionalidades dele e quem recebeu o técnico", () => {
    const folhas = buildTrainingSheets(visita, 5);
    expect(folhas.map((f) => f.sistema)).toEqual(["Folha", "Contábil"]);
    expect(folhas[0].funcionalidades).toEqual(["Cálculo", "eSocial"]);
    expect(folhas[1].funcionalidades).toEqual(["Empenho"]);
    expect(folhas[0].participantes).toEqual(["Maria", "João", "", "", ""]);
  });

  it("mais participantes que linhas não corta ninguém", () => {
    expect(buildTrainingSheets(visita, 1)[0].participantes).toEqual(["Maria", "João"]);
  });

  it("visita sem sistema ainda imprime uma folha", () => {
    const folhas = buildTrainingSheets({ projects: [], modules: [], contact_records: [] }, 2);
    expect(folhas).toHaveLength(1);
    expect(folhas[0].sistema).toBeNull();
    expect(folhas[0].participantes).toEqual(["", ""]);
  });
});

describe("buildVisitListParams", () => {
  it("manda só os filtros preenchidos e a página no cursor", () => {
    expect(
      buildVisitListParams(
        { status: null, technicianId: "u1", entityId: null, dateFrom: "2026-01-01", dateTo: "", overdue: true },
        2,
        25
      )
    ).toEqual({ technician_id: "u1", date_from: "2026-01-01", overdue: "true", cursor: "25:2:0" });
  });

  it("situação zero (agendada) é filtro, não ausência de filtro", () => {
    expect(buildVisitListParams({ status: 0 }, 0, 25)).toEqual({ status: "0", cursor: "25:0:0" });
  });
});

describe("getVisitEditMode", () => {
  const visita = { technician_id: "dono", status: 1 };

  it("quem gerencia edita tudo, até visita encerrada", () => {
    expect(getVisitEditMode(visita, "outro", { canRegister: true, canManageAll: true })).toBe("tudo");
    expect(getVisitEditMode({ ...visita, status: 4 }, "outro", { canRegister: true, canManageAll: true })).toBe("tudo");
  });

  it("o técnico dono edita o relatório, não a agenda", () => {
    expect(getVisitEditMode(visita, "dono", { canRegister: true, canManageAll: false })).toBe("relatorio");
  });

  it("colega, visitante e visita encerrada ficam só leitura", () => {
    expect(getVisitEditMode(visita, "outro", { canRegister: true, canManageAll: false })).toBe("leitura");
    expect(getVisitEditMode(visita, "dono", { canRegister: false, canManageAll: false })).toBe("leitura");
    expect(getVisitEditMode({ ...visita, status: 5 }, "dono", { canRegister: true, canManageAll: false })).toBe(
      "leitura"
    );
  });
});

describe("buildTechnicianNames", () => {
  it("junta técnico e 2º técnico", () => {
    expect(buildTechnicianNames({ technician: { display_name: "Ana" }, technician2: { display_name: "Rui" } })).toBe(
      "Ana e Rui"
    );
    expect(buildTechnicianNames({ technician: { display_name: "Ana" }, technician2: null })).toBe("Ana");
    expect(buildTechnicianNames({ technician: null, technician2: null })).toBe("");
  });
});
