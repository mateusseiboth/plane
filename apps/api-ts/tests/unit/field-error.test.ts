/**
 * Erro de validação que volta para o campo do formulário: `errors: [{ path, message }]`.
 */
import { describe, expect, it } from "bun:test";
import { buildErrorBody, createFieldError } from "@utils/field-error";

describe("createFieldError", () => {
  it("vira 400 com o caminho do campo", () => {
    expect(createFieldError("zip_code", "Informe o CEP com 8 dígitos.")).toEqual({
      status: 400,
      message: "Informe o CEP com 8 dígitos.",
      path: "zip_code",
    });
  });
});

describe("buildErrorBody", () => {
  it("erro de campo leva `errors` além do `detail`", () => {
    expect(buildErrorBody(createFieldError("reason", "Informe o motivo."))).toEqual({
      detail: "Informe o motivo.",
      errors: [{ path: "reason", message: "Informe o motivo." }],
    });
  });

  it("erro com vários campos (ex.: encerramento da visita) repassa a lista inteira", () => {
    const errors = [
      { path: "summary", message: "Informe o resumo." },
      { path: "conclusion", message: "Informe a conclusão." },
    ];
    expect(buildErrorBody({ status: 422, message: "Complete o relatório.", errors })).toEqual({
      detail: "Complete o relatório.",
      errors,
    });
  });

  it("erro comum continua só com `detail`", () => {
    expect(buildErrorBody({ status: 403, message: "Sem permissão." })).toEqual({ detail: "Sem permissão." });
  });
});
