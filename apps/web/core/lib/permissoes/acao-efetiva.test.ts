/**
 * A ação vale para quem está logado? Função do sistema + exceções por pessoa
 * (as mesmas do backend: a negação vence a concessão e a função). Puro.
 * Rodar com `bun test core/lib/permissoes`.
 */
import { describe, expect, it } from "bun:test";
import { isActionAllowed } from "./acao-efetiva";

describe("isActionAllowed", () => {
  it("segue a função quando não há exceção", () => {
    expect(isActionAllowed("issue.view", ["issue.view"], undefined)).toBe(true);
    expect(isActionAllowed("issue.priority", ["issue.view"], undefined)).toBe(false);
  });

  it("concessão por pessoa libera", () => {
    expect(isActionAllowed("issue.priority", [], { granted: ["issue.priority"], revoked: [] })).toBe(true);
  });

  it("negação por pessoa vence a função e a concessão", () => {
    expect(
      isActionAllowed("chat.atender", ["chat.atender"], { granted: ["chat.atender"], revoked: ["chat.atender"] })
    ).toBe(false);
  });
});
