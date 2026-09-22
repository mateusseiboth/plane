/**
 * Campo da trilha → frase da tela. Puro.
 * Rodar com `bun test core/components/core`.
 */
import { describe, expect, it } from "bun:test";
import { hasFraseDoCampo, readActivityField } from "@/components/core/activity-fields";

const CAMPOS_NARRADOS = new Set(["issue", "state", "estimate_point", "target_date"]);

describe("readActivityField", () => {
  it("sem campo, a linha é a criação do chamado", () => {
    expect(readActivityField(null)).toBe("issue");
    expect(readActivityField(undefined)).toBe("issue");
    expect(readActivityField("")).toBe("issue");
  });

  it("a estimativa é gravada com o tipo no nome e conta a mesma história", () => {
    expect(readActivityField("estimate_points")).toBe("estimate_point");
    expect(readActivityField("estimate_categories")).toBe("estimate_point");
  });

  it("os demais campos passam intactos", () => {
    expect(readActivityField("state")).toBe("state");
  });
});

describe("hasFraseDoCampo", () => {
  it("aceita o campo que a tela sabe contar", () => {
    expect(hasFraseDoCampo("state", CAMPOS_NARRADOS)).toBe(true);
    expect(hasFraseDoCampo(null, CAMPOS_NARRADOS)).toBe(true);
    expect(hasFraseDoCampo("estimate_points", CAMPOS_NARRADOS)).toBe(true);
  });

  it("recusa o campo sem frase, que sairia como uma linha só com o avatar", () => {
    expect(hasFraseDoCampo("portal_resposta", CAMPOS_NARRADOS)).toBe(false);
    expect(hasFraseDoCampo("campo_que_ninguem_conhece", CAMPOS_NARRADOS)).toBe(false);
  });
});
