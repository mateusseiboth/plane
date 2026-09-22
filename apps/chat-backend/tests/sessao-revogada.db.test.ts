/**
 * O chat respeita a revogação de sessão do Plane: token emitido antes da troca
 * de senha, do congelamento ou do "sair de todos os lugares" não abre o chat.
 * Usa o banco compartilhado e apaga o que criou.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { SignJWT } from "jose";
import prisma from "@db";
import { verifyPlaneJwt } from "@/auth";
import { uniqueWorkspace } from "@tests/helpers/harness";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "plane-jwt-secret-change-in-production");
const marca = uniqueWorkspace("sessao");
const MARCO = new Date("2026-09-22T12:00:00.500Z");

const signToken = (userId: string, tv?: number) =>
  new SignJWT(tv === undefined ? {} : { tv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setExpirationTime("1h")
    .sign(SECRET);

const createUser = async (nome: string, tokenUpdatedAt: Date | null, isActive = true): Promise<string> => {
  const [linha] = (await prisma.$queryRaw`
    INSERT INTO users (id, created_at, updated_at, email, username, display_name, first_name, last_name, password,
                       is_active, is_email_verified, is_password_autoset, is_instance_admin, is_superuser, is_staff,
                       token_updated_at)
    VALUES (gen_random_uuid(), now(), now(), ${`${nome}-${marca}@teste.local`}, ${`${nome}-${marca}`}, ${nome}, ${nome},
            '', 'x', ${isActive}, true, false, false, false, false, ${tokenUpdatedAt})
    RETURNING id::text AS id`) as Array<{ id: string }>;
  return linha.id;
};

const ids = { nunca: "", revogado: "", inativo: "" };

beforeAll(async () => {
  ids.nunca = await createUser("nunca", null);
  ids.revogado = await createUser("revogado", MARCO);
  ids.inativo = await createUser("inativo", null, false);
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%-${marca}@teste.local`}`;
});

describe("verifyPlaneJwt", () => {
  it("usuário nunca revogado entra com token antigo, sem versão", async () => {
    expect((await verifyPlaneJwt(await signToken(ids.nunca)))?.id).toBe(ids.nunca);
  });

  it("token de antes da revogação não entra", async () => {
    expect(await verifyPlaneJwt(await signToken(ids.revogado))).toBeNull();
    expect(await verifyPlaneJwt(await signToken(ids.revogado, MARCO.getTime() - 1))).toBeNull();
  });

  it("token da versão atual entra", async () => {
    expect((await verifyPlaneJwt(await signToken(ids.revogado, MARCO.getTime())))?.id).toBe(ids.revogado);
  });

  it("conta desativada ou congelada não entra", async () => {
    expect(await verifyPlaneJwt(await signToken(ids.inativo))).toBeNull();
  });
});
