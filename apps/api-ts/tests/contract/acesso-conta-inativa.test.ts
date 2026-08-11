/**
 * Conta desativada não entra no sistema.
 *
 * A base tem centenas de contas que existem só para o histórico ter autor:
 * gente desligada e, principalmente, contato externo — cliente, representante,
 * candidato a vaga. Elas eram importadas ativas e com a senha padrão, então
 * qualquer cliente migrado logava e recebia token.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import { TEST_API_BASE_URL, createUser } from "@tests/helpers/factory";

const SENHA = "teste-acesso-123";

const entrar = (email: string, senha: string) =>
  fetch(`${TEST_API_BASE_URL}/auth/sign-in/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });

describe("TestAcessoDeContaInativa", () => {
  let ativoEmail: string;
  let inativoEmail: string;

  beforeAll(async () => {
    await cleanDb();
    const hash = await Bun.password.hash(SENHA, { algorithm: "bcrypt", cost: 4 });

    const ativo = await createUser({ email: "da-casa@plane.test" });
    ativoEmail = ativo.email!;
    await prisma.user.update({ where: { id: ativo.id }, data: { password: hash, isActive: true } });

    const inativo = await createUser({ email: "cliente-migrado@plane.test" });
    inativoEmail = inativo.email!;
    await prisma.user.update({ where: { id: inativo.id }, data: { password: hash, isActive: false } });
  });

  afterAll(() => cleanDb());

  it("conta ativa entra e recebe token", async () => {
    const res = await entrar(ativoEmail, SENHA);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).token).toBeTruthy();
  });

  it("conta inativa é recusada mesmo com a senha certa", async () => {
    const res = await entrar(inativoEmail, SENHA);
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).token).toBeUndefined();
  });

  it("a recusa não revela que a conta existe", async () => {
    const inativa = await (await entrar(inativoEmail, SENHA)).json() as any;
    const inexistente = await (await entrar("ninguem@plane.test", SENHA)).json() as any;
    expect(inativa.detail).toBe(inexistente.detail);
  });
});
