// Configuração SMTP. Fica no registro da instância (`configurations.smtp`), no
// mesmo padrão do S3; as variáveis SMTP_* servem de reserva para quem sobe o
// sistema sem passar pela tela de configuração.

export type SmtpSecurity = "none" | "starttls" | "ssl";

export type SmtpConfig = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  from_address?: string;
  from_name?: string;
  security?: SmtpSecurity;
};

export type SmtpOrigin = "instance" | "env" | "none";

export type ResolvedSmtp = { origin: SmtpOrigin; config: SmtpConfig };

type Env = Record<string, string | undefined>;

const SSL_PORT = 465;
const DEFAULT_PORT = 587;
const SECURITIES: ReadonlySet<string> = new Set<SmtpSecurity>(["none", "starttls", "ssl"]);

export function isSmtpUsable(cfg: SmtpConfig | null | undefined): boolean {
  return Boolean(cfg?.host && cfg.from_address);
}

export function isSmtpSecurity(value: unknown): value is SmtpSecurity {
  return typeof value === "string" && SECURITIES.has(value);
}

/** Porta 465 é SSL direto; qualquer outra negocia STARTTLS. */
export function readDefaultSecurity(port: number): SmtpSecurity {
  return port === SSL_PORT ? "ssl" : "starttls";
}

export function readSmtpConfigFromEnv(env: Env): SmtpConfig {
  const port = Number(env.SMTP_PORT) || DEFAULT_PORT;
  const security = isSmtpSecurity(env.SMTP_SECURITY) ? env.SMTP_SECURITY : readDefaultSecurity(port);
  return {
    host: env.SMTP_HOST,
    port,
    username: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from_address: env.SMTP_FROM,
    from_name: env.SMTP_FROM_NAME,
    security,
  };
}

export function resolveSmtpConfig(instanceSmtp: SmtpConfig | null | undefined, env: Env): ResolvedSmtp {
  if (isSmtpUsable(instanceSmtp)) return { origin: "instance", config: instanceSmtp as SmtpConfig };
  const fromEnv = readSmtpConfigFromEnv(env);
  if (isSmtpUsable(fromEnv)) return { origin: "env", config: fromEnv };
  return { origin: "none", config: {} };
}
