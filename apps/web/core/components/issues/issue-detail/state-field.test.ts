/**
 * Seletor de etapa na tela do chamado: a recusa da API (`errors: [{path, message}]`)
 * volta para junto do campo. Rodar com `bun test core/components/issues/issue-detail`.
 */
import { describe, expect, it } from "bun:test";
import { applyApiFieldErrors } from "@/helpers/api-field-errors.helper";
import { buildStateFieldErrorHandler } from "@/components/issues/issue-detail/state-field.rules";

const RECUSA = {
  detail: "Comente no chamado antes de mudar a etapa.",
  errors: [{ path: "state_id", message: "Comente no chamado antes de mudar a etapa." }],
};

describe("buildStateFieldErrorHandler", () => {
  it("leva a mensagem do campo state_id para junto do seletor", () => {
    let mensagem: string | undefined;
    const aviso = applyApiFieldErrors(
      RECUSA,
      buildStateFieldErrorHandler((m) => (mensagem = m)),
      "Falha"
    );
    expect(mensagem).toBe("Comente no chamado antes de mudar a etapa.");
    expect(aviso).toBe("Comente no chamado antes de mudar a etapa.");
  });

  it("ignora erro de outro campo", () => {
    let mensagem: string | undefined;
    applyApiFieldErrors(
      { detail: "x", errors: [{ path: "name", message: "Informe o título." }] },
      buildStateFieldErrorHandler((m) => (mensagem = m)),
      "Falha"
    );
    expect(mensagem).toBeUndefined();
  });

  it("recusa sem campo (transição proibida) fica só no aviso", () => {
    let mensagem: string | undefined;
    const aviso = applyApiFieldErrors(
      { detail: "Sua função não permite esta transição de estado." },
      buildStateFieldErrorHandler((m) => (mensagem = m)),
      "Falha"
    );
    expect(mensagem).toBeUndefined();
    expect(aviso).toBe("Sua função não permite esta transição de estado.");
  });
});
