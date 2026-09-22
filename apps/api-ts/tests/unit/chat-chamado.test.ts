/**
 * Chamado aberto a partir do chat: a transcrição que vai na descrição (texto do
 * cliente escapado, nunca HTML cru) e de onde vem cada arquivo da conversa. Puro,
 * sem banco e sem rede.
 */
import { describe, expect, it } from "bun:test";
import { buildTranscricaoHtml } from "@modules/chat-chamado/transcricao";
import { buildUrlDoAnexo, buildNomeDoAnexo } from "@modules/chat-chamado/anexos";

const sessao = {
  protocol: "20260922-0001",
  client_name: "Maria <b>",
  client_phone: "5567999990000",
  channel: "whatsapp",
  created_at: new Date("2026-09-22T12:00:00Z"),
};

const msg = (over: Record<string, unknown>) => ({
  sender: "client",
  sender_name: null,
  type: "text",
  text: "Olá",
  media_key: null,
  media_name: null,
  deleted_at: null,
  created_at: new Date("2026-09-22T12:01:00Z"),
  ...over,
});

describe("buildTranscricaoHtml", () => {
  const html = buildTranscricaoHtml(
    sessao,
    [
      msg({ text: "<script>alert(1)</script> não emite" }),
      msg({ sender: "attendant", sender_name: "Ana", text: "Vou verificar." }),
      msg({ sender: "client", type: "image", text: null, media_key: "s/1", media_name: "tela.png" }),
      msg({ sender: "client", text: "apagada", deleted_at: new Date() }),
      msg({ sender: "system", type: "event", text: "Ana iniciou o atendimento." }),
    ],
    "https://plane.local/quality/chat-view/20260922-0001"
  );

  it("cabeçalho com protocolo, cliente e link da conversa", () => {
    expect(html).toContain("20260922-0001");
    expect(html).toContain("Maria &lt;b&gt;");
    expect(html).toContain('href="https://plane.local/quality/chat-view/20260922-0001"');
  });

  it("escapa o texto de quem escreveu", () => {
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; não emite");
  });

  it("identifica quem falou e marca arquivo e mensagem apagada", () => {
    expect(html).toContain("Ana");
    expect(html).toContain("Arquivo: tela.png");
    expect(html).toContain("(mensagem apagada)");
    expect(html).not.toContain(">apagada<");
  });
});

describe("buildUrlDoAnexo", () => {
  const chat = "http://chat-backend:8002";

  it("arquivo guardado pelo chat vem da rota /media do chat", () => {
    expect(buildUrlDoAnexo("sessao/abc", chat)).toBe("http://chat-backend:8002/media/sessao/abc");
  });

  it("arquivo do WhatsApp só por https (a URL veio de fora)", () => {
    expect(buildUrlDoAnexo("ext:https://z-api.io/f.jpg", chat)).toBe("https://z-api.io/f.jpg");
    expect(buildUrlDoAnexo("ext:http://10.0.0.1/segredo", chat)).toBeNull();
    expect(buildUrlDoAnexo("ext:file:///etc/passwd", chat)).toBeNull();
  });

  it("sem chave ou sem endereço do chat, nada a buscar", () => {
    expect(buildUrlDoAnexo(null, chat)).toBeNull();
    expect(buildUrlDoAnexo("sessao/abc", "")).toBeNull();
  });
});

describe("buildNomeDoAnexo", () => {
  it("usa o nome original ou monta um pelo tipo", () => {
    expect(buildNomeDoAnexo({ media_name: "oficio.pdf", type: "file", media_mime: "application/pdf" }, 0)).toBe(
      "oficio.pdf"
    );
    expect(buildNomeDoAnexo({ media_name: null, type: "audio", media_mime: "audio/ogg" }, 2)).toBe("audio-3.ogg");
    expect(buildNomeDoAnexo({ media_name: null, type: "image", media_mime: null }, 0)).toBe("image-1.bin");
  });
});
