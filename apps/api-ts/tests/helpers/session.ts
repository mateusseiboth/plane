/**
 * Helpers de sessão para os testes de contrato: senha conhecida, login por
 * e-mail (ou usuário) e chamada com o token de sessão.
 */
import { expect } from "bun:test";
import { prismaReal } from "@tests/helpers/prisma-real";
import { TEST_API_BASE_URL } from "@tests/helpers/factory";

export const SENHA = "Senha-Forte-2026!";

export async function setPassword(userId: string, senha = SENHA) {
  const hash = await Bun.password.hash(senha, { algorithm: "bcrypt", cost: 4 });
  await prismaReal().user.update({ where: { id: userId }, data: { password: hash, isPasswordAutoset: false } });
}

export function requestSignIn(identifier: string, senha = SENHA) {
  return fetch(`${TEST_API_BASE_URL}/auth/sign-in/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: identifier, password: senha }),
  });
}

export async function signIn(identifier: string, senha = SENHA): Promise<string> {
  const res = await requestSignIn(identifier, senha);
  expect(res.status).toBe(200);
  return ((await res.json()) as any).token;
}

export const withBearer = (token: string, path: string, init: RequestInit = {}) =>
  fetch(`${TEST_API_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });

export const postForm = (path: string, form: Record<string, string>) =>
  fetch(`${TEST_API_BASE_URL}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
