/**
 * Infra de e-mail: de onde vem a configuração SMTP (instância primeiro, variável
 * de ambiente como reserva), o modelo da mensagem e o transporte falso usado nos
 * testes. Sem banco e sem SMTP de verdade.
 */
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { isSmtpUsable, readSmtpConfigFromEnv, resolveSmtpConfig } from "@utils/email-config";
import { buildEmail } from "@utils/email-template";
import { clearFakeOutbox, createEmailTransport, readFakeOutbox } from "@utils/email-transport";

describe("resolveSmtpConfig", () => {
  const INSTANCIA = { host: "smtp.instancia.test", port: 587, from_address: "suporte@instancia.test" };
  const AMBIENTE = { SMTP_HOST: "smtp.env.test", SMTP_PORT: "2525", SMTP_FROM: "env@env.test" };

  it("usa a configuração da instância quando ela é utilizável", () => {
    const resolvida = resolveSmtpConfig(INSTANCIA, AMBIENTE);
    expect(resolvida.origin).toBe("instance");
    expect(resolvida.config.host).toBe("smtp.instancia.test");
  });

  it("cai para as variáveis de ambiente quando a instância não tem SMTP", () => {
    const resolvida = resolveSmtpConfig({}, AMBIENTE);
    expect(resolvida.origin).toBe("env");
    expect(resolvida.config.host).toBe("smtp.env.test");
    expect(resolvida.config.port).toBe(2525);
  });

  it("sem nenhuma das duas, não há SMTP", () => {
    const resolvida = resolveSmtpConfig(null, {});
    expect(resolvida.origin).toBe("none");
    expect(isSmtpUsable(resolvida.config)).toBe(false);
  });

  it("instância pela metade (sem remetente) não vale: usa o ambiente", () => {
    expect(resolveSmtpConfig({ host: "smtp.x.test" }, AMBIENTE).origin).toBe("env");
  });
});

describe("readSmtpConfigFromEnv", () => {
  it("lê as variáveis SMTP_* com porta numérica e segurança padrão", () => {
    const cfg = readSmtpConfigFromEnv({
      SMTP_HOST: "smtp.a.test",
      SMTP_USER: "usuario",
      SMTP_PASSWORD: "segredo",
      SMTP_FROM: "a@a.test",
      SMTP_FROM_NAME: "Quality",
    });
    expect(cfg).toEqual({
      host: "smtp.a.test",
      port: 587,
      username: "usuario",
      password: "segredo",
      from_address: "a@a.test",
      from_name: "Quality",
      security: "starttls",
    });
  });

  it("porta 465 sem segurança declarada vira SSL", () => {
    expect(readSmtpConfigFromEnv({ SMTP_HOST: "h", SMTP_PORT: "465", SMTP_FROM: "a@a.test" }).security).toBe("ssl");
  });
});

describe("buildEmail", () => {
  it("escapa HTML do conteúdo e traz o botão de ação", () => {
    const email = buildEmail({
      subject: "Redefinir senha",
      title: "Olá, <b>Fulano</b>",
      paragraphs: ["Use o link abaixo."],
      action: { label: "Criar nova senha", url: "https://app.test/accounts/reset-password?token=abc&x=1" },
    });
    expect(email.subject).toBe("Redefinir senha");
    expect(email.html).toContain("Olá, &lt;b&gt;Fulano&lt;/b&gt;");
    expect(email.html).toContain('href="https://app.test/accounts/reset-password?token=abc&amp;x=1"');
    expect(email.text).toContain("https://app.test/accounts/reset-password?token=abc&x=1");
    expect(email.text).toContain("Use o link abaixo.");
  });

  it("não usa travessão no texto padrão", () => {
    const email = buildEmail({ subject: "Aviso", title: "Aviso", paragraphs: ["Linha."] });
    expect(email.html).not.toContain("—");
    expect(email.text).not.toContain("—");
  });
});

describe("transporte falso", () => {
  const anterior = process.env.EMAIL_OUTBOX_DIR;
  afterEach(() => {
    process.env.EMAIL_OUTBOX_DIR = anterior;
  });

  it("grava a mensagem na caixa de saída local em vez de enviar", async () => {
    process.env.EMAIL_OUTBOX_DIR = mkdtempSync(path.join(tmpdir(), "outbox-"));
    await clearFakeOutbox();
    const transporte = createEmailTransport("fake");
    await transporte.send(
      { to: "a@a.test", subject: "Teste", html: "<p>oi</p>", text: "oi" },
      { host: "smtp.fake", port: 587, from_address: "de@a.test", security: "starttls" }
    );
    const caixa = await readFakeOutbox();
    expect(caixa).toHaveLength(1);
    expect(caixa[0]).toMatchObject({ to: "a@a.test", subject: "Teste", from: "de@a.test" });
  });

  it("transporte desconhecido cai no SMTP", () => {
    expect(createEmailTransport("qualquer").kind).toBe("smtp");
    expect(createEmailTransport(undefined).kind).toBe("smtp");
    expect(createEmailTransport("fake").kind).toBe("fake");
  });
});
