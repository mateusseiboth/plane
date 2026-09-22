/**
 * Revogação de sessão por `users.token_updated_at`: o JWT carrega a versão da
 * sessão (`tv`) e deixa de valer quando a versão do usuário muda. Sem banco.
 */
import { describe, expect, it } from "bun:test";
import { decodeJwt } from "jose";
import { isSessionRevoked, readSessionVersion, signSessionToken } from "@utils/session";

describe("isSessionRevoked", () => {
  const MARCO = new Date("2026-09-22T12:00:00.123Z");

  it("usuário nunca revogado aceita token sem versão (sessões anteriores ao recurso)", () => {
    expect(isSessionRevoked(undefined, null)).toBe(false);
    expect(isSessionRevoked(0, null)).toBe(false);
  });

  it("token sem versão cai quando o usuário é revogado", () => {
    expect(isSessionRevoked(undefined, MARCO)).toBe(true);
  });

  it("token da versão atual vale; de versão anterior, não", () => {
    expect(isSessionRevoked(MARCO.getTime(), MARCO)).toBe(false);
    expect(isSessionRevoked(MARCO.getTime() - 1, MARCO)).toBe(true);
  });

  it("versão que não é número é tratada como revogada quando há marco", () => {
    expect(isSessionRevoked("abc", MARCO)).toBe(true);
  });
});

describe("signSessionToken", () => {
  it("grava sub, email e a versão da sessão", async () => {
    const marco = new Date("2026-09-22T12:00:00.500Z");
    const token = await signSessionToken({ id: "u1", email: "a@a.test", tokenUpdatedAt: marco });
    const payload = decodeJwt(token);
    expect(payload.sub).toBe("u1");
    expect(payload.email).toBe("a@a.test");
    expect(readSessionVersion(payload)).toBe(marco.getTime());
  });

  it("usuário sem marco recebe versão 0", async () => {
    const token = await signSessionToken({ id: "u1", email: "a@a.test", tokenUpdatedAt: null });
    expect(readSessionVersion(decodeJwt(token))).toBe(0);
  });
});
