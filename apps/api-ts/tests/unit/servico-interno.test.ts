/**
 * Autenticação de serviço (chat → api-ts): o token compartilhado em
 * `CHAT_SERVICE_TOKEN`, comparado em tempo constante. Sem banco.
 */
import { describe, expect, it } from "bun:test";
import { isServiceTokenValid, readServiceToken, requireServiceToken, SERVICE_TOKEN_HEADER } from "@utils/servico-interno";

describe("readServiceToken", () => {
  it("lê CHAT_SERVICE_TOKEN do ambiente dado", () => {
    expect(readServiceToken({ CHAT_SERVICE_TOKEN: "abc" })).toBe("abc");
  });

  it("variável ausente ou em branco é ausência de token", () => {
    expect(readServiceToken({})).toBeUndefined();
    expect(readServiceToken({ CHAT_SERVICE_TOKEN: "   " })).toBeUndefined();
  });
});

describe("isServiceTokenValid", () => {
  it("aceita o token igual ao configurado", () => {
    expect(isServiceTokenValid("segredo-longo-123", "segredo-longo-123")).toBe(true);
  });

  it("recusa token diferente, vazio ou ausente", () => {
    expect(isServiceTokenValid("segredo-longo-124", "segredo-longo-123")).toBe(false);
    expect(isServiceTokenValid("", "segredo-longo-123")).toBe(false);
    expect(isServiceTokenValid(undefined, "segredo-longo-123")).toBe(false);
    expect(isServiceTokenValid("segredo", "segredo-longo-123")).toBe(false);
  });

  it("sem token configurado, nada passa (nem vazio com vazio)", () => {
    expect(isServiceTokenValid("", "")).toBe(false);
    expect(isServiceTokenValid(undefined, undefined)).toBe(false);
  });
});

describe("requireServiceToken", () => {
  it("rota desligada quando o servidor não tem token: 503", () => {
    expect(() => requireServiceToken({ [SERVICE_TOKEN_HEADER]: "x" }, undefined)).toThrow(
      expect.objectContaining({ status: 503 })
    );
  });

  it("token errado: 401", () => {
    expect(() => requireServiceToken({ [SERVICE_TOKEN_HEADER]: "x" }, "y")).toThrow(
      expect.objectContaining({ status: 401 })
    );
  });

  it("token certo passa", () => {
    expect(() => requireServiceToken({ [SERVICE_TOKEN_HEADER]: "y" }, "y")).not.toThrow();
  });
});
