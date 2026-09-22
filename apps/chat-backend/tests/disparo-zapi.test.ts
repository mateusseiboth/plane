/**
 * O que o disparo pede à Z-API: legenda na imagem e no documento, imagem no
 * Status e a fila de saída. Contra um servidor falso local; nada vai à Z-API.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ZapiProvider } from "@/providers/zapi";

type Chamada = { method: string; action: string; body: any };

const chamadas: Chamada[] = [];
let server: ReturnType<typeof Bun.serve>;
let provider: ZapiProvider;

const FILA = [{ Created: 1758542400000, Phone: "5567999990000", Message: "Olá", ZaapId: "z1", MessageId: "m1" }];

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const action = url.pathname.split("/token/")[1]?.split("/").slice(1).join("/") ?? "";
      chamadas.push({ method: req.method, action, body: await req.json().catch(() => null) });
      if (action === "queue") return Response.json(FILA);
      return Response.json({ zaapId: "z", messageId: "m-status", id: "m-status" });
    },
  });
  provider = new ZapiProvider({
    baseUrl: `http://localhost:${server.port}`,
    instanceId: "i",
    token: "t",
    clientToken: "c",
  });
});

afterAll(() => server.stop(true));

describe("ZapiProvider no disparo", () => {
  it("manda a legenda junto da imagem e do documento", async () => {
    await provider.sendMedia("5567999990000", {
      url: "http://x/a.png",
      mime: "image/png",
      type: "image",
      caption: "Oi",
    });
    await provider.sendMedia("5567999990000", {
      url: "http://x/a.pdf",
      mime: "application/pdf",
      name: "aviso.pdf",
      type: "file",
      caption: "Leia",
    });
    expect(chamadas.at(-2)).toMatchObject({ action: "send-image", body: { image: "http://x/a.png", caption: "Oi" } });
    expect(chamadas.at(-1)).toMatchObject({
      action: "send-document/pdf",
      body: { fileName: "aviso.pdf", caption: "Leia" },
    });
  });

  it("sem legenda, o corpo não leva o campo", async () => {
    await provider.sendMedia("5567999990000", { url: "http://x/a.png", mime: "image/png", type: "image" });
    expect("caption" in chamadas.at(-1)!.body).toBe(false);
  });

  it("publica a imagem no Status", async () => {
    const id = await provider.sendImageStatus("http://x/a.png");
    expect(chamadas.at(-1)).toMatchObject({
      method: "POST",
      action: "send-image-status",
      body: { image: "http://x/a.png" },
    });
    expect(id).toBe("m-status");
  });

  it("lê a fila de saída", async () => {
    const fila = await provider.getFilaDeSaida();
    expect(chamadas.at(-1)).toMatchObject({ method: "GET", action: "queue" });
    expect(fila).toEqual([
      { criadaEm: "2025-09-22T12:00:00.000Z", telefone: "5567999990000", mensagem: "Olá", id: "z1" },
    ]);
  });
});
