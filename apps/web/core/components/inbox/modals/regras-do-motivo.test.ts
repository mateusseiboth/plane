/**
 * O motivo do "Não atendido": a tela pede o mesmo mínimo que o servidor
 * (`modules/solicitacao/atendimento-da-solicitacao.rules.ts`) e mostra no campo
 * o erro que ele devolver. Mesma fábrica do motivo da recusa.
 * Rodar com `bun test core/components/inbox/modals`.
 */
import { describe, expect, it } from "bun:test";
import { REGRAS_DO_NAO_ATENDIDO } from "@/components/inbox/modals/regras-do-motivo";

describe("REGRAS_DO_NAO_ATENDIDO", () => {
  it("vazio ou curto pede o que faltou com o mínimo de caracteres", () => {
    expect(REGRAS_DO_NAO_ATENDIDO.findPendencia("faltou")).toBe("Escreva o que faltou com pelo menos 10 caracteres.");
  });

  it("com o mínimo, nada falta", () => {
    expect(REGRAS_DO_NAO_ATENDIDO.findPendencia("O cliente ainda não emite a guia.")).toBeUndefined();
  });

  it("sem resposta do servidor, avisa que não devolveu", () => {
    expect(REGRAS_DO_NAO_ATENDIDO.readErro(undefined)).toBe("Não foi possível devolver para a triagem. Tente de novo.");
    expect(REGRAS_DO_NAO_ATENDIDO.readErro({ errors: [{ path: "motivo", message: "Curto." }] })).toBe("Curto.");
  });
});
