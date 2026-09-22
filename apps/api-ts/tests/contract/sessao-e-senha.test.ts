/**
 * Perfil do usuário, revogação de sessão, "esqueci minha senha" por e-mail,
 * configuração SMTP e congelamento de usuário.
 *
 * O servidor sob teste precisa subir com EMAIL_TRANSPORT=fake e o mesmo
 * EMAIL_OUTBOX_DIR deste processo: é ali que o link de redefinição aparece.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { prismaReal } from "@tests/helpers/prisma-real";
import {
  TEST_API_BASE_URL,
  addMember,
  apiClient,
  createApiToken,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";
import { clearFakeOutbox, readFakeOutbox } from "@utils/email-transport";

const prisma = () => prismaReal();
const SENHA = "Senha-Forte-2026!";

async function setPassword(userId: string, senha = SENHA) {
  const hash = await Bun.password.hash(senha, { algorithm: "bcrypt", cost: 4 });
  await prisma().user.update({ where: { id: userId }, data: { password: hash, isPasswordAutoset: false } });
}

async function signIn(email: string, senha = SENHA): Promise<string> {
  const res = await fetch(`${TEST_API_BASE_URL}/auth/sign-in/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as any).token;
}

const withBearer = (token: string, path: string, init: RequestInit = {}) =>
  fetch(`${TEST_API_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });

const postForm = (path: string, form: Record<string, string>) =>
  fetch(`${TEST_API_BASE_URL}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });

async function findResetLinkInOutbox(to: string) {
  const caixa = await readFakeOutbox();
  const email = caixa.findLast((m) => m.to === to);
  if (!email) throw new Error(`Nenhum e-mail para ${to} na caixa de saída.`);
  const url = new URL(email.text.match(/https?:\/\/\S+reset-password\S+/)![0]);
  return { uidb64: url.searchParams.get("uidb64")!, token: url.searchParams.get("token")! };
}

describe("perfil do usuário", () => {
  let client: ReturnType<typeof apiClient>;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    client = apiClient((await createApiToken(user.id)).token);
  });

  it("grava e devolve telefone, celular, aniversário e apelido", async () => {
    const res = await client.patch("/users/me/", {
      phone: "(67) 3333-4444",
      mobile_phone: "(67) 99999-0000",
      birth_date: "1990-05-17",
      nickname: "Zé",
    });
    expect(res.status).toBe(200);
    const me = (await (await client.get("/users/me/")).json()) as any;
    expect(me).toMatchObject({
      phone: "(67) 3333-4444",
      mobile_phone: "(67) 99999-0000",
      mobile_number: "(67) 99999-0000",
      birth_date: "1990-05-17",
      nickname: "Zé",
    });
  });

  it("data de aniversário inválida volta para o campo", async () => {
    const res = await client.patch("/users/me/", { birth_date: "31/02/1990" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors).toEqual([{ path: "birth_date", message: expect.any(String) }]);
  });

  it("limpar o campo grava nulo", async () => {
    await client.patch("/users/me/", { nickname: "" });
    const me = (await (await client.get("/users/me/")).json()) as any;
    expect(me.nickname).toBeNull();
  });
});

describe("revogação de sessão", () => {
  let email: string;
  let userId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    await createWorkspace(user.id);
    email = user.email;
    userId = user.id;
    await setPassword(user.id);
  });

  it("trocar a senha derruba as outras sessões e mantém a atual", async () => {
    const outraSessao = await signIn(email);
    const atual = await signIn(email);
    const res = await withBearer(atual, "/auth/change-password/", {
      method: "POST",
      body: JSON.stringify({ old_password: SENHA, new_password: "Outra-Senha-2026!" }),
    });
    expect(res.status).toBe(200);
    const novoCookie = res.headers.get("set-cookie") ?? "";
    const novoToken = decodeURIComponent(novoCookie.match(/plane_auth=([^;]+)/)![1]);

    expect((await withBearer(outraSessao, "/api/v1/users/me/")).status).toBe(401);
    expect((await withBearer(novoToken, "/api/v1/users/me/")).status).toBe(200);
    await setPassword(userId);
  });

  it("sair de todos os lugares revoga a sessão atual também", async () => {
    const token = await signIn(email);
    const res = await withBearer(token, "/auth/sign-out-everywhere/", { method: "POST" });
    expect(res.status).toBe(204);
    expect((await withBearer(token, "/api/v1/users/me/")).status).toBe(401);
  });
});

describe("esqueci minha senha", () => {
  let email: string;
  let userId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    await createWorkspace(user.id);
    email = user.email;
    userId = user.id;
  });

  beforeEach(async () => {
    await setPassword(userId);
    await clearFakeOutbox();
    await prisma().passwordResetToken.deleteMany({});
  });

  afterAll(() => prisma().passwordResetToken.deleteMany({}));

  const askReset = (alvo: string) =>
    fetch(`${TEST_API_BASE_URL}/auth/forgot-password/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: alvo }),
    });

  it("envia o link e o link troca a senha uma única vez", async () => {
    const sessaoAntiga = await signIn(email);
    expect((await askReset(email.toUpperCase())).status).toBe(200);

    const { uidb64, token } = await findResetLinkInOutbox(email);
    expect(token).toBeTruthy();
    const gravado = await prisma().passwordResetToken.findFirst({ where: { subjectId: userId } });
    expect(gravado?.tokenHash).not.toBe(token);

    const res = await postForm(`/auth/reset-password/${uidb64}/${token}/`, { password: "Nova-Senha-2026!" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/?success=true");
    await signIn(email, "Nova-Senha-2026!");
    expect((await withBearer(sessaoAntiga, "/api/v1/users/me/")).status).toBe(401);

    const denovo = await postForm(`/auth/reset-password/${uidb64}/${token}/`, { password: "Outra-2026!!" });
    expect(denovo.headers.get("location")).toContain("error_code=5125");
  });

  it("e-mail desconhecido responde igual e não envia nada", async () => {
    const res = await askReset("ninguem@plane.test");
    expect(res.status).toBe(200);
    expect(await readFakeOutbox()).toHaveLength(0);
  });

  it("token vencido é recusado com o código de expiração", async () => {
    await askReset(email);
    const { uidb64, token } = await findResetLinkInOutbox(email);
    await prisma().passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await postForm(`/auth/reset-password/${uidb64}/${token}/`, { password: "Nova-Senha-2026!" });
    expect(res.headers.get("location")).toContain("error_code=5130");
  });

  it("senha curta volta para a tela com o código de senha fraca", async () => {
    await askReset(email);
    const { uidb64, token } = await findResetLinkInOutbox(email);
    const res = await postForm(`/auth/reset-password/${uidb64}/${token}/`, { password: "123" });
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("error_code=5021");
    expect(location).toContain(`uidb64=${uidb64}`);
    // O token continua valendo: a pessoa só precisa escolher uma senha melhor.
    const ok = await postForm(`/auth/reset-password/${uidb64}/${token}/`, { password: "Nova-Senha-2026!" });
    expect(ok.headers.get("location")).toBe("/?success=true");
  });

  it("token de outro usuário não serve", async () => {
    await askReset(email);
    const { token } = await findResetLinkInOutbox(email);
    const outro = await createUser();
    const uidOutro = Buffer.from(outro.id).toString("base64url");
    const res = await postForm(`/auth/reset-password/${uidOutro}/${token}/`, { password: "Nova-Senha-2026!" });
    expect(res.headers.get("location")).toContain("error_code=5125");
  });
});

describe("configuração de e-mail", () => {
  let admin: ReturnType<typeof apiClient>;
  let membro: ReturnType<typeof apiClient>;
  let slug: string;
  let adminEmail: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    adminEmail = user.email;
    const ws = await createWorkspace(user.id);
    slug = ws.slug;
    admin = apiClient((await createApiToken(user.id)).token);
    const comum = await createUser();
    await addMember(ws.id, comum.id, 15);
    membro = apiClient((await createApiToken(comum.id)).token);
    await clearFakeOutbox();
    // A configuração SMTP mora no registro da instância. Quando o banco de teste
    // não tem uma, o teste cria e apaga no fim (outros testes contam com a ausência).
    const existing = await prisma().instance.findFirst();
    createdInstanceId = existing
      ? null
      : (await prisma().instance.create({ data: { instanceId: `teste-${crypto.randomUUID()}`, isSetupDone: true } }))
          .id;
  });

  let createdInstanceId: string | null = null;

  afterAll(async () => {
    if (createdInstanceId) {
      await prisma().instance.delete({ where: { id: createdInstanceId } });
      return;
    }
    const instance = await prisma().instance.findFirst();
    if (!instance) return;
    const { smtp: _smtp, ...resto } = (instance.configurations as any) ?? {};
    await prisma().instance.update({ where: { id: instance.id }, data: { configurations: resto } });
  });

  it("só administrador vê e altera", async () => {
    expect((await membro.get(`/workspaces/${slug}/email-config/`)).status).toBe(403);
    expect((await membro.patch(`/workspaces/${slug}/email-config/`, { host: "x" })).status).toBe(403);
  });

  it("grava sem devolver a senha e mantém a senha quando ela vem vazia", async () => {
    const res = await admin.patch(`/workspaces/${slug}/email-config/`, {
      host: "smtp.teste.local",
      port: 2525,
      username: "usuario",
      password: "segredo",
      from_address: "suporte@teste.local",
      from_name: "Suporte",
      security: "starttls",
    });
    expect(res.status).toBe(200);
    await admin.patch(`/workspaces/${slug}/email-config/`, { host: "smtp2.teste.local", password: "" });
    const cfg = (await (await admin.get(`/workspaces/${slug}/email-config/`)).json()) as any;
    expect(cfg).toMatchObject({
      host: "smtp2.teste.local",
      port: 2525,
      has_password: true,
      origin: "instance",
      is_configured: true,
    });
    expect(cfg.password).toBeUndefined();
  });

  it("remetente inválido volta para o campo", async () => {
    const res = await admin.patch(`/workspaces/${slug}/email-config/`, { host: "h", from_address: "nao-e-email" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors[0].path).toBe("from_address");
  });

  it("o teste manda um e-mail para quem pediu", async () => {
    const res = await admin.post(`/workspaces/${slug}/email-config/test/`, {});
    expect(res.status).toBe(200);
    const caixa = await readFakeOutbox();
    expect(caixa.at(-1)).toMatchObject({ to: adminEmail, from: "suporte@teste.local" });
  });
});

describe("congelamento de usuário", () => {
  let admin: ReturnType<typeof apiClient>;
  let slug: string;
  let adminId: string;
  let alvo: { id: string; email: string };

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    adminId = user.id;
    const ws = await createWorkspace(user.id);
    slug = ws.slug;
    admin = apiClient((await createApiToken(user.id)).token);
    alvo = await createUser();
    await addMember(ws.id, alvo.id, 15);
    await setPassword(alvo.id);
  });

  it("exige motivo", async () => {
    const res = await admin.post(`/workspaces/${slug}/members/${alvo.id}/freeze/`, { reason: " " });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors[0].path).toBe("reason");
  });

  it("não deixa congelar a si mesmo", async () => {
    const res = await admin.post(`/workspaces/${slug}/members/${adminId}/freeze/`, { reason: "teste" });
    expect(res.status).toBe(400);
  });

  it("congela, derruba a sessão e impede o login; descongelar devolve o acesso", async () => {
    const sessao = await signIn(alvo.email);
    const res = await admin.post(`/workspaces/${slug}/members/${alvo.id}/freeze/`, { reason: "Saiu da empresa" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).frozen_at).toBeTruthy();

    expect((await withBearer(sessao, "/api/v1/users/me/")).status).toBe(401);
    const login = await fetch(`${TEST_API_BASE_URL}/auth/sign-in/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: alvo.email, password: SENHA }),
    });
    expect(login.status).toBe(403);

    expect((await admin.post(`/workspaces/${slug}/members/${alvo.id}/freeze/`, { reason: "de novo" })).status).toBe(
      409
    );

    const volta = await admin.post(`/workspaces/${slug}/members/${alvo.id}/unfreeze/`, { reason: "Voltou" });
    expect(volta.status).toBe(200);
    await signIn(alvo.email);

    const historico = (await (
      await admin.get(`/workspaces/${slug}/members/${alvo.id}/freeze-events/`)
    ).json()) as any[];
    expect(historico.map((e) => [e.action, e.reason])).toEqual([
      ["unfreeze", "Voltou"],
      ["freeze", "Saiu da empresa"],
    ]);
  });

  it("congelado sai da lista de membros e aparece na lista de congelados", async () => {
    await admin.post(`/workspaces/${slug}/members/${alvo.id}/freeze/`, { reason: "Férias longas" });
    const membros = (await (await admin.get(`/workspaces/${slug}/members/`)).json()) as any[];
    expect(membros.some((m) => m.member.id === alvo.id)).toBe(false);

    const congelados = (await (await admin.get(`/workspaces/${slug}/frozen-members/`)).json()) as any[];
    expect(congelados).toEqual([
      expect.objectContaining({ id: alvo.id, email: alvo.email, is_frozen: true, frozen_reason: "Férias longas" }),
    ]);
    await admin.post(`/workspaces/${slug}/members/${alvo.id}/unfreeze/`, {});
    expect(await (await admin.get(`/workspaces/${slug}/frozen-members/`)).json()).toEqual([]);
  });
});
