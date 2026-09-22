/**
 * Admin cria usuário com senha, já com papel e sistemas (sem convite); login
 * por nome de usuário; e a trilha de auditoria dos cadastros de pessoas e de
 * entidades.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { prismaReal } from "@tests/helpers/prisma-real";
import {
  TEST_API_BASE_URL,
  addMember,
  apiClient,
  createApiToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";
import { SENHA, requestSignIn, setPassword, signIn, withBearer } from "@tests/helpers/session";

const prisma = () => prismaReal();

async function waitForAudit(where: Record<string, unknown>, timeoutMs = 5000) {
  const limite = Date.now() + timeoutMs;
  // Espera a gravação assíncrona da trilha: consulta em série de propósito.
  while (Date.now() < limite) {
    // oxlint-disable-next-line no-await-in-loop
    const log = await prisma().auditLog.findFirst({ where, orderBy: { createdAt: "desc" } });
    if (log) return log;
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(75);
  }
  return null;
}

describe("admin cria usuário com senha", () => {
  let admin: ReturnType<typeof apiClient>;
  let adminId: string;
  let slug: string;
  let workspaceId: string;
  let projetoA: string;
  let projetoB: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    adminId = user.id;
    const ws = await createWorkspace(user.id);
    slug = ws.slug;
    workspaceId = ws.id;
    admin = apiClient((await createApiToken(user.id)).token);
    projetoA = (await createProject(ws.id, user.id, { name: "Folha" })).id;
    projetoB = (await createProject(ws.id, user.id, { name: "Tributos" })).id;
  });

  const url = () => `/workspaces/${slug}/members/create/`;

  it("cria a conta, o vínculo com o papel e os sistemas, e a pessoa já entra", async () => {
    const res = await admin.post(url(), {
      email: "Nova.Pessoa@Quality.Test",
      username: "nova.pessoa",
      first_name: "Nova",
      last_name: "Pessoa",
      password: "Senha-Inicial-2026",
      role: 6,
      project_ids: [projetoA, projetoB],
    });
    expect(res.status).toBe(201);
    const criado = (await res.json()) as any;
    expect(criado).toMatchObject({ email: "nova.pessoa@quality.test", username: "nova.pessoa", role: 6 });
    expect(criado.project_ids.toSorted()).toEqual([projetoA, projetoB].toSorted());

    const membro = await prisma().workspaceMember.findFirst({ where: { workspaceId, memberId: criado.id } });
    expect(membro).toMatchObject({ role: 6, isActive: true });
    const vinculos = await prisma().projectMember.findMany({ where: { memberId: criado.id } });
    expect(vinculos.map((v) => v.role)).toEqual([6, 6]);

    await signIn("nova.pessoa@quality.test", "Senha-Inicial-2026");

    const log = await waitForAudit({ entity: "member", entityId: criado.id, action: "create" });
    expect(log?.actorId).toBe(adminId);
  });

  it("e-mail já cadastrado volta para o campo", async () => {
    const existente = await createUser();
    const res = await admin.post(url(), {
      email: existente.email,
      first_name: "X",
      password: "Senha-2026-ok",
      role: 15,
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).errors[0].path).toBe("email");
  });

  it("senha curta, papel inexistente e sistema de outro espaço voltam para o campo", async () => {
    const base = { email: "campos@quality.test", first_name: "Campos", password: "Senha-2026-ok", role: 15 };
    const curta = await admin.post(url(), { ...base, password: "123" });
    expect(((await curta.json()) as any).errors[0].path).toBe("password");

    const papel = await admin.post(url(), { ...base, role: 99 });
    expect(((await papel.json()) as any).errors[0].path).toBe("role");

    const outroDono = await createUser();
    const outroWs = await createWorkspace(outroDono.id);
    const alheio = await createProject(outroWs.id, outroDono.id);
    const sistema = await admin.post(url(), { ...base, project_ids: [alheio.id] });
    expect(((await sistema.json()) as any).errors[0].path).toBe("project_ids");
  });

  it("sem a ação de gerenciar membros não cria", async () => {
    const comum = await createUser();
    await addMember(workspaceId, comum.id, 15);
    const cliente = apiClient((await createApiToken(comum.id)).token);
    const res = await cliente.post(url(), {
      email: "negado@quality.test",
      first_name: "Negado",
      password: "Senha-2026-ok",
      role: 15,
    });
    expect(res.status).toBe(403);
  });
});

describe("login por nome de usuário", () => {
  let username: string;
  let createdInstanceId: string | null = null;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    await createWorkspace(user.id);
    await setPassword(user.id);
    username = user.username;
    // A verificação de e-mail exige instância configurada. Outros testes contam
    // com a ausência dela, então só cria quando falta e apaga no fim.
    const existing = await prisma().instance.findFirst();
    createdInstanceId = existing
      ? null
      : (await prisma().instance.create({ data: { instanceId: `teste-${crypto.randomUUID()}`, isSetupDone: true } }))
          .id;
  });

  afterAll(async () => {
    if (createdInstanceId) await prisma().instance.delete({ where: { id: createdInstanceId } });
  });

  it("entra com o nome de usuário no lugar do e-mail", async () => {
    const token = await signIn(username);
    expect((await withBearer(token, "/api/v1/users/me/")).status).toBe(200);
  });

  it("nome de usuário com a senha errada não entra", async () => {
    expect((await requestSignIn(username, "errada")).status).toBe(403);
  });

  it("a verificação de e-mail aceita o nome de usuário", async () => {
    const res = await fetch(`${TEST_API_BASE_URL}/auth/email-check/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: username }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).existing).toBe(true);
  });
});

describe("trilha de auditoria dos cadastros", () => {
  let admin: ReturnType<typeof apiClient>;
  let slug: string;
  let workspaceId: string;
  let alvo: { id: string; email: string };

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const ws = await createWorkspace(user.id);
    slug = ws.slug;
    workspaceId = ws.id;
    admin = apiClient((await createApiToken(user.id)).token);
    alvo = await createUser();
    await addMember(ws.id, alvo.id, 15);
    await setPassword(alvo.id);
  });

  it("mudança de papel entra na trilha com o papel antigo e o novo", async () => {
    expect((await admin.patch(`/workspaces/${slug}/members/${alvo.id}/`, { role: 6 })).status).toBe(200);
    const log = await waitForAudit({ workspaceId, entity: "member", entityId: alvo.id, action: "permission_change" });
    expect(log?.changes).toEqual({ role: { de: 15, para: 6 } });
  });

  it("redefinição de senha pelo admin entra na trilha sem a senha", async () => {
    await admin.post(`/workspaces/${slug}/members/${alvo.id}/reset-password/`, { password: "Outra-Senha-2026" });
    const log = await waitForAudit({ workspaceId, entity: "user", entityId: alvo.id, action: "password_change" });
    expect(JSON.stringify(log)).not.toContain("Outra-Senha-2026");
    expect((log?.metadata as any)?.por_admin).toBe(true);
  });

  it("troca de senha pela própria pessoa entra na trilha", async () => {
    await setPassword(alvo.id);
    const token = await signIn(alvo.email);
    await withBearer(token, "/auth/change-password/", {
      method: "POST",
      body: JSON.stringify({ old_password: SENHA, new_password: "Mais-Uma-Senha-2026" }),
    });
    const log = await waitForAudit({ entity: "user", entityId: alvo.id, action: "password_change", actorId: alvo.id });
    expect(log).not.toBeNull();
  });

  it("remoção do membro entra na trilha", async () => {
    expect((await admin.delete(`/workspaces/${slug}/members/${alvo.id}/`)).status).toBe(204);
    expect(await waitForAudit({ workspaceId, entity: "member", entityId: alvo.id, action: "delete" })).not.toBeNull();
  });

  it("criação, alteração e exclusão de entidade entram na trilha", async () => {
    const criada = (await (
      await admin.post(`/workspaces/${slug}/entities/`, { name: "Câmara Auditada" })
    ).json()) as any;
    expect(await waitForAudit({ workspaceId, entity: "entity", entityId: criada.id, action: "create" })).not.toBeNull();

    await admin.patch(`/workspaces/${slug}/entities/${criada.id}/`, { city: "Campo Grande" });
    const alteracao = await waitForAudit({ workspaceId, entity: "entity", entityId: criada.id, action: "update" });
    expect(alteracao?.changes).toEqual({ city: { de: null, para: "Campo Grande" } });

    await admin.delete(`/workspaces/${slug}/entities/${criada.id}/`);
    expect(await waitForAudit({ workspaceId, entity: "entity", entityId: criada.id, action: "delete" })).not.toBeNull();
  });
});
