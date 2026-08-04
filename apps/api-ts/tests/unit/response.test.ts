/**
 * Helpers de resposta HTTP — todo erro do backend passa por httpError, então o
 * status e o campo `detail` são o contrato que o frontend lê nos toasts.
 */
import {describe, expect, it} from "bun:test";
import {httpError, ok} from "@utils/response";

describe("httpError", () => {
  it("devolve o status e o detail em JSON", async () => {
    const res = httpError(404, "Projeto não encontrado.");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({detail: "Projeto não encontrado."});
  });

  it("preserva qualquer status informado", () => {
    expect(httpError(403, "x").status).toBe(403);
    expect(httpError(400, "x").status).toBe(400);
    expect(httpError(409, "x").status).toBe(409);
  });
});

describe("ok", () => {
  it("responde 200 por padrão", async () => {
    const res = ok({id: "1"});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({id: "1"});
  });

  it("aceita status customizado (201 em criações)", async () => {
    const res = ok([1, 2, 3], 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual([1, 2, 3]);
  });
});
