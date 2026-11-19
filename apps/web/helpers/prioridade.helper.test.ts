/**
 * Chamado urgente (cliente parado): a regra única que o quadro, a lista, a
 * faixa de urgentes e o painel de TV usam para destacar o card.
 * Rodar com `bun test helpers/prioridade.helper.test.ts`.
 */
import { describe, expect, it } from "bun:test";
import { isPrioridadeUrgente } from "@/helpers/prioridade.helper";

describe("isPrioridadeUrgente", () => {
  it("só a prioridade urgente conta", () => {
    expect(isPrioridadeUrgente("urgent")).toBe(true);
    expect(isPrioridadeUrgente("high")).toBe(false);
    expect(isPrioridadeUrgente("none")).toBe(false);
  });

  it("sem prioridade não é urgente", () => {
    expect(isPrioridadeUrgente(null)).toBe(false);
    expect(isPrioridadeUrgente(undefined)).toBe(false);
  });
});
