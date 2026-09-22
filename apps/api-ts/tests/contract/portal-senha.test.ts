/**
 * "Esqueci minha senha" do portal do cliente e a revogação da sessão do portal.
 *
 * O servidor sob teste precisa subir com EMAIL_TRANSPORT=fake, SMTP_* e o mesmo
 * EMAIL_OUTBOX_DIR deste processo: é ali que o link aparece.
 */
import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { prismaReal } from "@tests/helpers/prisma-real";
import {
  TEST_API_BASE_URL,
  apiClient,
  createApiToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";
import { clearFakeOutbox, readFakeOutbox } from "@utils/email-transport";

const SENHA = "portal-secreto-123";
const EMAIL = "cliente@prefeitura.test";
const prisma = () => prismaReal();

const portalPost = (caminho: string, body: unknown, token = "") =>
  fetch(`${TEST_API_BASE_URL}/portal/api${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const portalGet = (caminho: string, token: string) =>
  fetch(`${TEST_API_BASE_URL}/portal/api${caminho}`, { headers: { Authorization: `Bearer ${token}` } });

async function findPortalLink(to: string) {
  const email = (await readFakeOutbox()).findLast((m) => m.to === to);
  if (!email) throw new Error(`Nenhum e-mail para ${to}.`);
  const url = new URL(email.text.match(/https?:\/\/\S+\/portal\/?\?\S+/)![0]);
  return {
    workspace: url.searchParams.get("workspace")!,
    conta: url.searchParams.get("conta")!,
    token: url.searchParams.get("redefinir")!,
  };
}

describe("esqueci minha senha do portal", () => {
  let admin: ReturnType<typeof apiClient>;
  let slug: string;
  let contaId: string;

  const entrar = async (senha = SENHA) => {
    const res = await portalPost("/entrar", { workspace: slug, email: EMAIL, senha });
    return { status: res.status, token: ((await res.json()) as any).token as string };
  };

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    admin = apiClient((await createApiToken(user.id)).token);
    const ws = await createWorkspace(user.id);
    slug = ws.slug;
    const projeto = await createProject(ws.id, user.id, { name: "SIART", identifier: "SIART" });
    const criada = await admin.post(`/workspaces/${slug}/portal-accounts/`, {
      name: "Prefeitura de Teste",
      email: EMAIL,
      password: SENHA,
      project_ids: [projeto.id],
    });
    contaId = ((await criada.json()) as any).id;
  });

  beforeEach(async () => {
    await clearFakeOutbox();
    await prisma().passwordResetToken.deleteMany({});
    const hash = await Bun.password.hash(SENHA, { algorithm: "bcrypt", cost: 4 });
    await prisma().portalAccount.update({ where: { id: contaId }, data: { password: hash } });
  });

  it("manda o link, a senha nova vale, o link não serve de novo e a sessão antiga cai", async () => {
    const antiga = (await entrar()).token;
    expect((await portalPost("/esqueci-senha", { workspace: slug, email: EMAIL.toUpperCase() })).status).toBe(200);

    const link = await findPortalLink(EMAIL);
    expect(link.workspace).toBe(slug);
    const res = await portalPost("/redefinir-senha", { ...link, senha: "senha-nova-2026" });
    expect(res.status).toBe(200);

    expect((await entrar("senha-nova-2026")).status).toBe(200);
    expect((await portalGet("/eu", antiga)).status).toBe(401);

    const denovo = await portalPost("/redefinir-senha", { ...link, senha: "outra-senha-2026" });
    expect(denovo.status).toBe(400);
    expect(((await denovo.json()) as any).errors[0].path).toBe("token");
  });

  it("e-mail desconhecido responde igual e não envia nada", async () => {
    expect((await portalPost("/esqueci-senha", { workspace: slug, email: "ninguem@x.test" })).status).toBe(200);
    expect(await readFakeOutbox()).toHaveLength(0);
  });

  it("senha curta volta para o campo e o link continua valendo", async () => {
    await portalPost("/esqueci-senha", { workspace: slug, email: EMAIL });
    const link = await findPortalLink(EMAIL);
    const curta = await portalPost("/redefinir-senha", { ...link, senha: "123" });
    expect(curta.status).toBe(400);
    expect(((await curta.json()) as any).errors[0].path).toBe("senha");
    expect((await portalPost("/redefinir-senha", { ...link, senha: "senha-nova-2026" })).status).toBe(200);
  });

  it("token do Plane não serve no portal", async () => {
    const user = await createUser();
    const doPlane = await fetch(`${TEST_API_BASE_URL}/auth/forgot-password/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email }),
    });
    expect(doPlane.status).toBe(200);
    const email = (await readFakeOutbox()).findLast((m) => m.to === user.email)!;
    const url = new URL(email.text.match(/https?:\/\/\S+reset-password\S+/)![0]);
    const res = await portalPost("/redefinir-senha", {
      workspace: slug,
      conta: url.searchParams.get("uidb64"),
      token: url.searchParams.get("token"),
      senha: "senha-nova-2026",
    });
    expect(res.status).toBe(400);
  });

  it("senha trocada pelo admin derruba a sessão do portal", async () => {
    const antiga = (await entrar()).token;
    await admin.patch(`/workspaces/${slug}/portal-accounts/${contaId}`, { password: "trocada-pelo-admin" });
    expect((await portalGet("/eu", antiga)).status).toBe(401);
    expect((await entrar("trocada-pelo-admin")).status).toBe(200);
  });
});
