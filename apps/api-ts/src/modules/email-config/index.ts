// Configuração do servidor de e-mail (SMTP), da instância inteira. Fica no
// registro da instância (`configurations.smtp`), no mesmo padrão do S3. A senha
// nunca volta: a leitura só diz se há uma gravada.

import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { isSmtpSecurity, readDefaultSecurity, resolveSmtpConfig, type SmtpConfig } from "@utils/email-config";
import { sendEmail } from "@utils/email";
import { createFieldError } from "@utils/field-error";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { getWorkspaceOrFail } from "@utils/workspace";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readInstanceOrFail() {
  const instance = await prisma.instance.findFirst();
  if (!instance) throw { status: 400, message: "Conclua a configuração inicial da instância antes." };
  return instance;
}

function buildEmailConfigDto(configurations: any) {
  const saved = (configurations?.smtp ?? {}) as SmtpConfig;
  const resolved = resolveSmtpConfig(saved, process.env);
  return {
    host: saved.host ?? "",
    port: saved.port ?? 587,
    username: saved.username ?? "",
    has_password: Boolean(saved.password),
    from_address: saved.from_address ?? "",
    from_name: saved.from_name ?? "",
    security: saved.security ?? "starttls",
    origin: resolved.origin,
    is_configured: resolved.origin !== "none",
  };
}

function readText(value: unknown, fallback: string | undefined): string {
  return String(value ?? fallback ?? "").trim();
}

function readPort(value: unknown, fallback: number | undefined): number {
  if (value === undefined || value === null || value === "") return fallback ?? 587;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw createFieldError("port", "Informe uma porta entre 1 e 65535.");
  }
  return port;
}

/** Senha vazia ou ausente mantém a gravada: o administrador não precisa redigitar. */
function readPassword(value: unknown, current: string | undefined): string {
  return typeof value === "string" && value.trim() ? value : (current ?? "");
}

function buildNextSmtp(body: any, current: SmtpConfig): SmtpConfig {
  const port = readPort(body.port, current.port);
  const next: SmtpConfig = {
    host: readText(body.host, current.host),
    port,
    username: readText(body.username, current.username),
    password: readPassword(body.password, current.password),
    from_address: readText(body.from_address, current.from_address).toLowerCase(),
    from_name: readText(body.from_name, current.from_name),
    security: isSmtpSecurity(body.security) ? body.security : (current.security ?? readDefaultSecurity(port)),
  };
  if (!next.host) throw createFieldError("host", "Informe o servidor SMTP.");
  if (!EMAIL_RE.test(next.from_address ?? ""))
    throw createFieldError("from_address", "Informe um e-mail de remetente válido.");
  return next;
}

export const emailConfigModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  .get("/email-config/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAction(ws.id, user.id, EProjectAction.WORKSPACE_SETTINGS);
    const instance = await prisma.instance.findFirst({ select: { configurations: true } });
    return buildEmailConfigDto(instance?.configurations);
  })

  .patch("/email-config/", async ({ params: { slug }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAction(ws.id, user.id, EProjectAction.WORKSPACE_SETTINGS);
    const instance = await readInstanceOrFail();
    const configurations = (instance.configurations as any) ?? {};
    const b = (body as any) ?? {};
    // `enabled: false` apaga a configuração da tela; as variáveis SMTP_* voltam a valer.
    const smtp = b.enabled === false ? {} : buildNextSmtp(b, configurations.smtp ?? {});
    const next = { ...configurations, smtp };
    await prisma.instance.update({ where: { id: instance.id }, data: { configurations: next } });
    return buildEmailConfigDto(next);
  })

  .post("/email-config/test/", async ({ params: { slug }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAction(ws.id, user.id, EProjectAction.WORKSPACE_SETTINGS);
    try {
      await sendEmail(user.email, {
        subject: "Teste de envio de e-mail",
        title: "O envio de e-mail está funcionando",
        paragraphs: ["Esta é uma mensagem de teste enviada pela tela de configuração de e-mail."],
      });
    } catch (e: any) {
      console.error("[email-config] teste falhou:", e);
      set.status = 502;
      return { detail: `Não foi possível enviar: ${e?.message ?? "erro desconhecido"}. Confira os dados do servidor.` };
    }
    return { detail: `E-mail de teste enviado para ${user.email}.` };
  });
