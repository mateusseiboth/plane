// Transportes de e-mail. `smtp` envia de verdade (nodemailer); `fake` grava a
// mensagem numa pasta local, para teste e para ambiente sem SMTP. A escolha vem
// de EMAIL_TRANSPORT; qualquer valor desconhecido cai no SMTP.

import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { createTransport } from "nodemailer";
import type { SmtpConfig } from "@utils/email-config";

export type OutgoingEmail = { to: string; subject: string; html: string; text: string };

export type EmailTransportKind = "smtp" | "fake";

export type EmailTransport = {
  kind: EmailTransportKind;
  send: (email: OutgoingEmail, config: SmtpConfig) => Promise<void>;
};

export type FakeOutboxEntry = OutgoingEmail & { from: string; sentAt: string };

function readOutboxDir(): string {
  return process.env.EMAIL_OUTBOX_DIR || path.join(tmpdir(), "plane-email-outbox");
}

function buildFrom(config: SmtpConfig): string {
  if (!config.from_name) return config.from_address ?? "";
  return `"${config.from_name.replace(/"/g, "")}" <${config.from_address}>`;
}

async function sendViaSmtp(email: OutgoingEmail, config: SmtpConfig): Promise<void> {
  const transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === "ssl",
    requireTLS: config.security === "starttls",
    ignoreTLS: config.security === "none",
    auth: config.username ? { user: config.username, pass: config.password ?? "" } : undefined,
  });
  await transporter.sendMail({ from: buildFrom(config), ...email });
}

async function sendToFakeOutbox(email: OutgoingEmail, config: SmtpConfig): Promise<void> {
  const dir = readOutboxDir();
  await mkdir(dir, { recursive: true });
  const entry: FakeOutboxEntry = { ...email, from: config.from_address ?? "", sentAt: new Date().toISOString() };
  await writeFile(path.join(dir, `${Date.now()}-${crypto.randomUUID()}.json`), JSON.stringify(entry));
}

const TRANSPORTS: Record<EmailTransportKind, EmailTransport> = {
  smtp: { kind: "smtp", send: sendViaSmtp },
  fake: { kind: "fake", send: sendToFakeOutbox },
};

export function createEmailTransport(kind: string | undefined): EmailTransport {
  return TRANSPORTS[kind as EmailTransportKind] ?? TRANSPORTS.smtp;
}

/** Mensagens gravadas pelo transporte falso, da mais antiga para a mais nova. */
export async function readFakeOutbox(): Promise<FakeOutboxEntry[]> {
  const dir = readOutboxDir();
  const files = await readdir(dir).catch(() => [] as string[]);
  const sorted = files.filter((f) => f.endsWith(".json")).toSorted();
  return Promise.all(sorted.map(async (f) => JSON.parse(await readFile(path.join(dir, f), "utf8"))));
}

export async function clearFakeOutbox(): Promise<void> {
  await rm(readOutboxDir(), { recursive: true, force: true });
}
