/**
 * Quando o pedido MUDA a prioridade do chamado. Só a mudança exige a ação
 * `issue.priority`: reenviar o mesmo valor (o formulário manda tudo) não é
 * alterar prioridade. Função pura, sem banco.
 */
import { describe, expect, it } from "bun:test";
import { isPriorityChange } from "@utils/prioridade";

describe("isPriorityChange", () => {
  it("campo ausente não muda nada", () => {
    expect(isPriorityChange("high", undefined)).toBe(false);
  });

  it("mesmo valor não é mudança", () => {
    expect(isPriorityChange("high", "high")).toBe(false);
  });

  it("valor diferente é mudança", () => {
    expect(isPriorityChange("none", "urgent")).toBe(true);
  });

  it("chamado sem prioridade gravada recebendo uma é mudança", () => {
    expect(isPriorityChange(null, "low")).toBe(true);
    expect(isPriorityChange(null, "none")).toBe(false);
  });
});
