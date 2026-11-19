/**
 * "Recursos Humanos · RECUR1-7": o número do chamado no sistema sempre com o
 * nome do sistema, porque a sigla gerada na importação não diz qual é.
 * Rodar com `bun test helpers/numero-no-sistema.helper.test.ts`.
 */
import { describe, expect, it } from "bun:test";
import { formatNumeroNoSistema } from "@/helpers/numero-no-sistema.helper";

describe("formatNumeroNoSistema", () => {
  it("junta o nome do sistema e o número", () => {
    expect(formatNumeroNoSistema({ name: "Recursos Humanos", identifier: "RECUR1" }, 7)).toBe(
      "Recursos Humanos · RECUR1-7"
    );
  });

  it("aceita o número pronto do sistema", () => {
    expect(formatNumeroNoSistema({ name: "Recursos Humanos" }, "RECUR1-7")).toBe("Recursos Humanos · RECUR1-7");
  });

  it("sem o nome, fica só o número", () => {
    expect(formatNumeroNoSistema({ identifier: "RECUR1" }, 7)).toBe("RECUR1-7");
    expect(formatNumeroNoSistema({ name: null }, "RECUR1-7")).toBe("RECUR1-7");
  });

  it("sem sistema nem número, não há o que mostrar", () => {
    expect(formatNumeroNoSistema(null, 7)).toBeNull();
    expect(formatNumeroNoSistema({ name: "RH" }, null)).toBeNull();
  });
});
