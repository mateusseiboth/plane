/**
 * Webhook da Z-API: leitura dos formatos que o SAC não tratava (reação,
 * figurinha, contato, chamada perdida), descarte de mensagem com mais de 2 dias
 * (`momment` do `zapi/receber.php`) e o token do webhook. Sem servidor.
 */
import { describe, expect, it } from "bun:test";
import { ZapiProvider } from "@/providers/zapi";
import { IDADE_MAXIMA_DA_MENSAGEM_MS, isMensagemAntiga, isWebhookAutorizado } from "@/webhook/regras";

const zapi = new ZapiProvider({});
const base = { phone: "5567999990000", senderName: "Cliente", fromMe: false, messageId: "ABC" };

describe("parseWebhook: formatos novos", () => {
  it("reação vira evento com o emoji e a mensagem reagida", () => {
    const m = zapi.parseWebhook({ ...base, reaction: { value: "👍", referencedMessage: { messageId: "XYZ" } } });
    expect(m).toMatchObject({ type: "reaction", reaction: { emoji: "👍", externalId: "XYZ" } });
  });

  it("figurinha chega como imagem", () => {
    const m = zapi.parseWebhook({ ...base, sticker: { stickerUrl: "https://x/s.webp", mimeType: "image/webp" } });
    expect(m).toMatchObject({
      type: "image",
      mediaUrl: "https://x/s.webp",
      mediaMime: "image/webp",
      mediaName: "Figurinha",
    });
  });

  it("contato compartilhado vira texto com nome e telefones", () => {
    const m = zapi.parseWebhook({ ...base, contact: { displayName: "Maria", phones: ["5567988887777"] } });
    expect(m?.type).toBe("text");
    expect(m?.text).toContain("Maria");
    expect(m?.text).toContain("5567988887777");
  });

  it("chamada perdida vira aviso", () => {
    const m = zapi.parseWebhook({ ...base, notification: "CALL_MISSED_VOICE" });
    expect(m).toMatchObject({ type: "call_missed", phone: base.phone });
  });

  it("guarda o instante da mensagem (momment)", () => {
    const m = zapi.parseWebhook({ ...base, momment: 1_700_000_000_000, text: { message: "oi" } });
    expect(m?.momentMs).toBe(1_700_000_000_000);
  });
});

describe("isMensagemAntiga", () => {
  const agora = Date.parse("2026-09-22T12:00:00Z");

  it("descarta o que tem 2 dias ou mais", () => {
    expect(isMensagemAntiga(agora - IDADE_MAXIMA_DA_MENSAGEM_MS, agora)).toBe(true);
    expect(isMensagemAntiga(agora - IDADE_MAXIMA_DA_MENSAGEM_MS + 1000, agora)).toBe(false);
  });

  it("sem instante, aceita", () => {
    expect(isMensagemAntiga(undefined, agora)).toBe(false);
  });
});

describe("isWebhookAutorizado", () => {
  it("espaço sem token configurado aceita tudo", () => {
    expect(isWebhookAutorizado(null, { header: undefined, query: undefined })).toBe(true);
  });

  it("com token configurado, exige o mesmo valor no cabeçalho ou na URL", () => {
    expect(isWebhookAutorizado("segredo", { header: "segredo", query: undefined })).toBe(true);
    expect(isWebhookAutorizado("segredo", { header: undefined, query: "segredo" })).toBe(true);
    expect(isWebhookAutorizado("segredo", { header: "outro", query: undefined })).toBe(false);
    expect(isWebhookAutorizado("segredo", { header: undefined, query: undefined })).toBe(false);
  });
});
