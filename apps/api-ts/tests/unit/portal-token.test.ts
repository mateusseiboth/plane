/**
 * O crachá do portal do cliente.
 *
 * É outro crachá, de propósito: a conta do portal NÃO é usuário do Plane e o
 * token dela não pode abrir nenhuma rota autenticada do produto. O papel
 * gravado dentro do token é o que separa os dois mundos.
 */
import { describe, expect, it } from "bun:test";
import { SignJWT } from "jose";
import { signTokenDoPortal, readTokenDoPortal } from "@modules/portal/token";

const CONTA = "3b0f4d2e-1c2a-4b5c-8d9e-0f1a2b3c4d5e";
const ESPACO = "9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d";

describe("token do portal", () => {
  it("volta a dizer de quem é, de que espaço e de que versão da sessão", async () => {
    const lido = await readTokenDoPortal(await signTokenDoPortal(CONTA, ESPACO, 1_700_000_000_000));
    expect(lido).toEqual({ contaId: CONTA, workspaceId: ESPACO, versao: 1_700_000_000_000 });
  });

  it("conta que nunca trocou a senha sai com versão 0", async () => {
    const lido = await readTokenDoPortal(await signTokenDoPortal(CONTA, ESPACO, null));
    expect(lido?.versao).toBe(0);
  });

  it("recusa token do Plane, que não traz o papel do portal", async () => {
    const doPlane = await new SignJWT({ email: "cliente@exemplo.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(CONTA)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET ?? "plane-jwt-secret-change-in-production"));
    expect(await readTokenDoPortal(doPlane)).toBeNull();
  });

  it("recusa token adulterado, vazio ou ausente", async () => {
    expect(await readTokenDoPortal("nada disso")).toBeNull();
    expect(await readTokenDoPortal("")).toBeNull();
    expect(await readTokenDoPortal(null)).toBeNull();
  });
});
