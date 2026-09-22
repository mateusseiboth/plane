/**
 * Token de redefinição de senha: só o hash é guardado, vale uma vez e expira.
 * Regras puras, sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  buildResetExpiry,
  decodeUid,
  encodeUid,
  generateResetToken,
  hashResetToken,
  readResetTokenState,
} from "@utils/password-reset";

const AGORA = new Date("2026-09-22T12:00:00Z");

describe("hashResetToken", () => {
  it("é determinístico e nunca devolve o token em claro", () => {
    const token = generateResetToken();
    expect(hashResetToken(token)).toBe(hashResetToken(token));
    expect(hashResetToken(token)).not.toContain(token);
    expect(hashResetToken(token)).toHaveLength(64);
  });

  it("tokens gerados não se repetem e servem em URL", () => {
    const a = generateResetToken();
    expect(a).not.toBe(generateResetToken());
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });
});

describe("buildResetExpiry", () => {
  it("soma os minutos de validade", () => {
    expect(buildResetExpiry(AGORA, 60).toISOString()).toBe("2026-09-22T13:00:00.000Z");
  });
});

describe("readResetTokenState", () => {
  const valido = { expiresAt: new Date("2026-09-22T12:30:00Z"), usedAt: null };

  it("token inexistente é inválido", () => {
    expect(readResetTokenState(null, AGORA)).toBe("invalid");
  });

  it("token já usado não vale de novo", () => {
    expect(readResetTokenState({ ...valido, usedAt: new Date("2026-09-22T11:00:00Z") }, AGORA)).toBe("used");
  });

  it("token vencido é expirado", () => {
    expect(readResetTokenState({ ...valido, expiresAt: new Date("2026-09-22T11:59:59Z") }, AGORA)).toBe("expired");
  });

  it("dentro do prazo e sem uso é válido", () => {
    expect(readResetTokenState(valido, AGORA)).toBe("valid");
  });
});

describe("encodeUid / decodeUid", () => {
  it("ida e volta do id", () => {
    const id = "019ffadb-aa94-7138-888a-d4ceabd3c2c1";
    expect(decodeUid(encodeUid(id))).toBe(id);
  });

  it("lixo decodifica para null", () => {
    expect(decodeUid("%%%")).toBeNull();
    expect(decodeUid(encodeUid("nao-e-uuid"))).toBeNull();
  });
});
