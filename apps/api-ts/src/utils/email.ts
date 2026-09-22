// Ponto único de envio de e-mail. Lê a configuração SMTP da instância (ou das
// variáveis SMTP_*), monta a mensagem pelo modelo padrão e entrega pelo
// transporte escolhido em EMAIL_TRANSPORT.

import prisma from "@db";
import { resolveSmtpConfig, type ResolvedSmtp, type SmtpConfig } from "@utils/email-config";
import { buildEmail, type EmailContent } from "@utils/email-template";
import { createEmailTransport } from "@utils/email-transport";

export class SmtpNotConfiguredError extends Error {
  constructor() {
    super("O envio de e-mail não está configurado.");
  }
}

export async function readInstanceSmtp(): Promise<SmtpConfig | null> {
  const instance = await prisma.instance.findFirst({ select: { configurations: true } });
  return ((instance?.configurations as any)?.smtp ?? null) as SmtpConfig | null;
}

export async function resolveCurrentSmtp(): Promise<ResolvedSmtp> {
  return resolveSmtpConfig(await readInstanceSmtp(), process.env);
}

export async function isEmailEnabled(): Promise<boolean> {
  return (await resolveCurrentSmtp()).origin !== "none";
}

/** Envia, ou lança `SmtpNotConfiguredError` quando não há SMTP. */
export async function sendEmail(to: string, content: EmailContent): Promise<void> {
  const { origin, config } = await resolveCurrentSmtp();
  if (origin === "none") throw new SmtpNotConfiguredError();
  const email = buildEmail(content);
  await createEmailTransport(process.env.EMAIL_TRANSPORT).send({ to, ...email }, config);
}

/** Endereço público do app web, usado nos links dos e-mails. */
export function readAppBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? process.env.WEB_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
