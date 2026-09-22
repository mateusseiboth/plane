/**
 * `hasChatAction` e `listAtendentes` contra o banco compartilhado: função
 * vinculada, função pelo nível, exceção por pessoa e espaço sem função gravada.
 * Cria um espaço próprio (slug aleatório) e apaga no fim.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { CHAT_ACTION, hasChatAction, listAtendentes } from "@/permissoes";
import { uniqueWorkspace } from "@tests/helpers/harness";

const slug = uniqueWorkspace("wsperm");
const semFuncoes = uniqueWorkspace("wssemfuncao");
const ids = { atendente: "", visitante: "", negado: "", concedido: "" };

const createUser = async (nome: string): Promise<string> => {
  const [linha] = (await prisma.$queryRaw`
    INSERT INTO users (id, created_at, updated_at, email, username, display_name, first_name, last_name, password,
                       is_active, is_email_verified, is_password_autoset, is_instance_admin, is_superuser, is_staff)
    VALUES (gen_random_uuid(), now(), now(), ${`${nome}-${slug}@teste.local`}, ${`${nome}-${slug}`}, ${nome}, ${nome}, '', 'x',
            true, true, false, false, false, false)
    RETURNING id::text AS id`) as Array<{ id: string }>;
  return linha.id;
};

const createWorkspace = async (s: string) =>
  prisma.$executeRaw`INSERT INTO workspaces (id, created_at, updated_at, name, slug, timezone)
                     VALUES (gen_random_uuid(), now(), now(), ${s}, ${s}, 'UTC')`;

const createRole = async (s: string, key: string, level: number, permissions: string[]) =>
  prisma.$executeRaw`
    INSERT INTO workflow_roles (id, created_at, updated_at, workspace_id, name, key, level, is_system, permissions)
    SELECT gen_random_uuid(), now(), now(), w.id, ${key}, ${key}, ${level}, true, ${JSON.stringify(permissions)}::jsonb
    FROM workspaces w WHERE w.slug = ${s}`;

const addMember = async (s: string, userId: string, role: number, granted: string[] = [], revoked: string[] = []) =>
  prisma.$executeRaw`
    INSERT INTO workspace_members (id, created_at, updated_at, workspace_id, member_id, role, is_active, granted_actions, revoked_actions)
    SELECT gen_random_uuid(), now(), now(), w.id, ${userId}::uuid, ${role}, true,
           ${JSON.stringify(granted)}::jsonb, ${JSON.stringify(revoked)}::jsonb
    FROM workspaces w WHERE w.slug = ${s}`;

beforeAll(async () => {
  await createWorkspace(slug);
  await createWorkspace(semFuncoes);
  await createRole(slug, "atendimento", 6, ["chat.atender"]);
  await createRole(slug, "guest", 5, []);
  ids.atendente = await createUser("atendente");
  ids.visitante = await createUser("visitante");
  ids.negado = await createUser("negado");
  ids.concedido = await createUser("concedido");
  await addMember(slug, ids.atendente, 6);
  await addMember(slug, ids.visitante, 5);
  await addMember(slug, ids.negado, 6, [], ["chat.atender"]);
  await addMember(slug, ids.concedido, 5, ["chat.atender", "chat.gerenciar"]);
  await addMember(semFuncoes, ids.atendente, 20);
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM workspaces WHERE slug IN (${slug}, ${semFuncoes})`;
  await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%-${slug}@teste.local`}`;
});

describe("hasChatAction", () => {
  it("função pelo nível dá o que ela tem", async () => {
    expect(await hasChatAction(slug, ids.atendente, CHAT_ACTION.ATENDER)).toBe(true);
    expect(await hasChatAction(slug, ids.atendente, CHAT_ACTION.GERENCIAR)).toBe(false);
  });

  it("exceção por pessoa soma e tira", async () => {
    expect(await hasChatAction(slug, ids.negado, CHAT_ACTION.ATENDER)).toBe(false);
    expect(await hasChatAction(slug, ids.concedido, CHAT_ACTION.GERENCIAR)).toBe(true);
  });

  it("espaço sem função gravada nega, mesmo para quem tem papel 20", async () => {
    expect(await hasChatAction(semFuncoes, ids.atendente, CHAT_ACTION.ADMINISTRAR)).toBe(false);
  });

  it("quem não é do espaço não tem nada", async () => {
    expect(await hasChatAction(slug, crypto.randomUUID(), CHAT_ACTION.ATENDER)).toBe(false);
  });
});

describe("listAtendentes", () => {
  it("lista quem tem chat.atender, pela função ou por concessão", async () => {
    const nomes = (await listAtendentes(slug)).map((a) => a.id).sort();
    expect(nomes).toEqual([ids.atendente, ids.concedido].sort());
  });
});
