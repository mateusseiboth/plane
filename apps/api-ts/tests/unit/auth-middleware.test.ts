/**
 * Middleware de autenticação.
 *
 * O ponto sensível é a diferença entre "credencial inválida" e "não consegui
 * verificar a credencial". Um `catch` genérico em volta da consulta ao banco
 * transformava indisponibilidade em 401 — para o usuário isso aparecia como
 * logout aleatório no meio do trabalho, e o front ainda descartava a sessão.
 * Token ruim é 401; banco fora do ar é 503, que o front trata como falha
 * temporária.
 */
import {afterEach, describe, expect, it, mock} from "bun:test";
import Elysia from "elysia";
import {SignJWT} from "jose";

const SEGREDO = new TextEncoder().encode(process.env.JWT_SECRET ?? "plane-jwt-secret-change-in-production");

const USUARIO = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "auth@plane.test",
  displayName: "Auth",
  isInstanceAdmin: false,
  isSuperuser: false,
};

/** Troca o `@db` por um dublê e devolve o app já montado com o middleware. */
async function montar(dubleUser: () => Promise<unknown>, dubleToken: () => Promise<unknown> = async () => null) {
  mock.module("@db", () => ({
    default: {
      user: {findUnique: dubleUser},
      apiToken: {findUnique: dubleToken, update: () => ({catch: () => {}})},
    },
  }));
  // Import dinâmico DEPOIS do mock: o módulo captura `prisma` na avaliação.
  const {authPlugin} = await import("@middleware/auth?" + Math.random());
  return new Elysia().use(authPlugin).get("/quem-sou", ({user}: any) => ({id: user.id}));
}

const assinar = (sub: string) =>
  new SignJWT({}).setProtectedHeader({alg: "HS256"}).setSubject(sub).setExpirationTime("1h").sign(SEGREDO);

const chamar = (app: Elysia, headers: Record<string, string>) =>
  app.handle(new Request("http://local/quem-sou", {headers}));

describe("authPlugin", () => {
  afterEach(() => mock.restore());

  it("aceita um JWT válido de usuário existente", async () => {
    const app = await montar(async () => USUARIO);
    const res = await chamar(app, {authorization: `Bearer ${await assinar(USUARIO.id)}`});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({id: USUARIO.id});
  });

  it("lê o JWT também do cookie plane_auth", async () => {
    const app = await montar(async () => USUARIO);
    const res = await chamar(app, {cookie: `plane_auth=${await assinar(USUARIO.id)}`});
    expect(res.status).toBe(200);
  });

  it("sem credencial nenhuma responde 401", async () => {
    const app = await montar(async () => USUARIO);
    expect((await chamar(app, {})).status).toBe(401);
  });

  it("token adulterado responde 401 sem sequer consultar o banco", async () => {
    let consultou = false;
    const app = await montar(async () => {
      consultou = true;
      return USUARIO;
    });
    const res = await chamar(app, {authorization: "Bearer nao.eh.jwt"});
    expect(res.status).toBe(401);
    expect(consultou).toBe(false);
  });

  it("usuário inexistente (ou inativo) responde 401", async () => {
    const app = await montar(async () => null);
    const res = await chamar(app, {authorization: `Bearer ${await assinar(USUARIO.id)}`});
    expect(res.status).toBe(401);
  });

  it("banco fora do ar responde 503, não 401", async () => {
    const app = await montar(async () => {
      throw new Error("Can't reach database server at plane-db:5432");
    });
    const res = await chamar(app, {authorization: `Bearer ${await assinar(USUARIO.id)}`});
    expect(res.status).toBe(503);
  });

  it("banco fora do ar também vira 503 na autenticação por X-Api-Key", async () => {
    const app = await montar(
      async () => USUARIO,
      async () => {
        throw new Error("connection pool timeout");
      },
    );
    const res = await chamar(app, {"x-api-key": "plane_api_qualquer"});
    expect(res.status).toBe(503);
  });
});
