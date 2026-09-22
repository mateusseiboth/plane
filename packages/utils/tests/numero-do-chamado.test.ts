/**
 * Número anual do chamado ("12-2026") na tela e o filtro "Somente não lidos".
 *
 * O número legado do SAC já aparecia num selo próprio. Chamado migrado com
 * legado N-AAAA recebe o MESMO número como número anual; mostrar os dois seria
 * o mesmo número duas vezes. O selo legado só sobra quando ele é diferente.
 */
import { describe, expect, it } from "bun:test";
import { EIssueLayoutTypes } from "@plane/types";
import { getComputedDisplayFilters, getNumerosDoChamado, handleIssueQueryParamsByLayout } from "../src/work-item/base";

describe("getNumerosDoChamado", () => {
  it("mostra o número anual", () => {
    expect(getNumerosDoChamado({ ticket_number: "12-2026", legacy_ticket_number: null })).toEqual({
      numero: "12-2026",
      legado: null,
    });
  });

  it("não repete o número legado quando ele é o próprio número anual", () => {
    expect(getNumerosDoChamado({ ticket_number: "500-2023", legacy_ticket_number: "500-2023" })).toEqual({
      numero: "500-2023",
      legado: null,
    });
  });

  it("mantém o legado quando ele é outro número", () => {
    expect(getNumerosDoChamado({ ticket_number: "7-2026", legacy_ticket_number: "458325" })).toEqual({
      numero: "7-2026",
      legado: "458325",
    });
  });

  it("chamado ainda sem número não mostra nada", () => {
    expect(getNumerosDoChamado({})).toEqual({ numero: null, legado: null });
  });
});

describe("filtro de não lidos", () => {
  it("sobrevive ao cálculo dos filtros de exibição", () => {
    expect(getComputedDisplayFilters({ unread: true }).unread).toBe(true);
    expect(getComputedDisplayFilters({ layout: EIssueLayoutTypes.LIST }).unread).toBe(false);
  });

  it("vai no pedido das listas de chamados e de Meus chamados", () => {
    for (const layout of [EIssueLayoutTypes.LIST, EIssueLayoutTypes.KANBAN, EIssueLayoutTypes.SPREADSHEET]) {
      expect(handleIssueQueryParamsByLayout(layout, "issues")).toContain("unread");
      expect(handleIssueQueryParamsByLayout(layout, "my_issues")).toContain("unread");
    }
  });
});
