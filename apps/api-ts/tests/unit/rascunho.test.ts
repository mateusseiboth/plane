/**
 * Corpo do rascunho: o formulário manda snake_case (`state_id`, `start_date`) e
 * o Prisma grava camelCase. Sem banco.
 */
import { describe, expect, it } from "bun:test";
import { buildDraftData } from "@modules/workspace/rascunho";

describe("buildDraftData", () => {
  it("traduz os campos que o formulário manda", () => {
    const data = buildDraftData({
      name: "Rascunho",
      priority: "high",
      state_id: "s1",
      project_id: "p1",
      description_html: "<p>x</p>",
    });
    expect(data).toEqual({
      name: "Rascunho",
      priority: "high",
      stateId: "s1",
      projectId: "p1",
      descriptionHtml: "<p>x</p>",
    });
  });

  it("aceita `state`, o nome legado da etapa", () => {
    expect(buildDraftData({ state: "s2" })).toEqual({ stateId: "s2" });
  });

  it("etapa vazia vira null em vez de uuid inválido", () => {
    expect(buildDraftData({ state_id: "" })).toEqual({ stateId: null });
  });

  it("datas puras ganham a borda do dia", () => {
    const data = buildDraftData({ start_date: "2026-10-01", target_date: "2026-10-09" });
    expect(data.startDate).toBeInstanceOf(Date);
    expect(data.targetDate).toBeInstanceOf(Date);
  });

  it("ignora o que não foi mandado e o que o rascunho não guarda", () => {
    expect(buildDraftData({ label_ids: ["l1"], assignee_ids: ["u1"] })).toEqual({});
  });
});
