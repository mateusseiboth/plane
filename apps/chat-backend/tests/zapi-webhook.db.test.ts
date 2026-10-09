/**
 * Rota do webhook da Z-API no próprio processo (`module.handle`), contra o
 * banco: token do webhook, descarte de mensagem velha, reação, chamada perdida,
 * resposta à pergunta de inatividade, retomada da conversa pausada e a resposta
 * à pesquisa de satisfação.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { zapiWebhookModule } from "@/webhook/zapi";
import {
  cleanWorkspace,
  configureWorkspace,
  startFakeZapi,
  uniqueWorkspace,
  type FakeZapi,
} from "@tests/helpers/harness";

const slug = uniqueWorkspace("wshook");
const TOKEN = "token-do-webhook";
let zapi: FakeZapi;

const phone = () => `5567${Math.floor(100000000 + Math.random() * 899999999)}`;
const messageId = () => `MSG${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;

function post(body: Record<string, unknown>, headers: Record<string, string> = { "Client-Token": TOKEN }, query = "") {
  return zapiWebhookModule.handle(
    new Request(`http://chat.local/providers/zapi/webhook/${slug}/${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );
}

const texto = (fone: string, message: string, extra: Record<string, unknown> = {}) => ({
  phone: fone,
  senderName: "Cliente",
  fromMe: false,
  messageId: messageId(),
  text: { message },
  ...extra,
});

async function createAtiva(fone: string, dados: Record<string, unknown> = {}) {
  return prisma.chatSession.create({
    data: {
      workspaceId: slug,
      protocol: `H-${crypto.randomUUID().slice(0, 12)}`,
      channel: "whatsapp",
      clientPhone: fone,
      status: "active",
      botState: "done",
      assignedAttendantId: crypto.randomUUID(),
      lastAttendantMessageAt: new Date(),
      ...dados,
    },
  });
}

const mensagens = (sessionId: string) =>
  prisma.chatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  zapi = startFakeZapi();
  await configureWorkspace(slug, zapi.baseUrl);
  await prisma.providerConfig.update({ where: { workspaceId: slug }, data: { webhookToken: TOKEN } });
});

afterAll(async () => {
  zapi?.stop();
  await cleanWorkspace(slug);
});

describe("token do webhook", () => {
  it("sem o token configurado no espaço: 401 e nada gravado", async () => {
    const fone = phone();
    const res = await post(texto(fone, "oi"), {});
    expect(res.status).toBe(401);
    expect(await prisma.chatSession.count({ where: { workspaceId: slug, clientPhone: fone } })).toBe(0);
  });

  it("token errado: 401", async () => {
    expect((await post(texto(phone(), "oi"), { "Client-Token": "outro" })).status).toBe(401);
  });

  it("token no cabeçalho ou na URL: aceita", async () => {
    expect((await post(texto(phone(), "oi"))).status).toBe(200);
    expect((await post(texto(phone(), "oi"), {}, `?token=${TOKEN}`)).status).toBe(200);
  });
});

describe("mensagens", () => {
  it("mensagem com mais de 2 dias é descartada", async () => {
    const fone = phone();
    await post(texto(fone, "bom dia", { momment: Date.now() - 3 * 24 * 60 * 60 * 1000 }));
    expect(await prisma.chatSession.count({ where: { workspaceId: slug, clientPhone: fone } })).toBe(0);
  });

  it("reação entra na conversa aberta apontando para a mensagem reagida", async () => {
    const fone = phone();
    const s = await createAtiva(fone);
    const reagida = await prisma.chatMessage.create({
      data: { sessionId: s.id, sender: "attendant", text: "Resolvido?", externalId: "EXT-REAGIDA" },
    });
    await post({
      phone: fone,
      fromMe: false,
      messageId: messageId(),
      reaction: { value: "👍", referencedMessage: { messageId: "EXT-REAGIDA" } },
    });
    const ultima = (await mensagens(s.id)).at(-1)!;
    expect(ultima).toMatchObject({ sender: "client", replyToId: reagida.id });
    expect(ultima.text).toContain("👍");
  });

  it("chamada perdida vira aviso na conversa aberta", async () => {
    const fone = phone();
    const s = await createAtiva(fone);
    await post({ phone: fone, fromMe: false, notification: "CALL_MISSED_VOICE" });
    const ultima = (await mensagens(s.id)).at(-1)!;
    expect(ultima.sender).toBe("system");
    expect(ultima.text).toContain("ligar");
  });

  it("reação e chamada perdida sem conversa aberta não abrem conversa nova", async () => {
    const fone = phone();
    await post({ phone: fone, fromMe: false, notification: "CALL_MISSED_VIDEO" });
    await post({
      phone: fone,
      fromMe: false,
      messageId: messageId(),
      reaction: { value: "❤️", referencedMessage: { messageId: "X" } },
    });
    expect(await prisma.chatSession.count({ where: { workspaceId: slug, clientPhone: fone } })).toBe(0);
  });

  it("99 à pergunta de inatividade encerra pelo cliente", async () => {
    const fone = phone();
    const s = await createAtiva(fone, { idlePromptedAt: new Date() });
    await post(texto(fone, "99"));
    expect(await prisma.chatSession.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({
      status: "closed",
      endKind: "cliente",
    });
  });

  it("cliente que escreve na conversa pausada a retoma", async () => {
    const fone = phone();
    const s = await createAtiva(fone, { status: "paused", pausedAt: new Date() });
    await post(texto(fone, "voltei"));
    expect(await prisma.chatSession.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({
      status: "active",
      pausedAt: null,
    });
  });
});

describe("resposta à pesquisa de satisfação", () => {
  // A nota e o comentário só saem para quem tem `chat.ver_avaliacao`. Gravados
  // como mensagem do cliente, apareciam no histórico, no `message.new` e no
  // aviso ao atendente que acabou de ser avaliado.
  const createEncerrada = (fone: string, ratingState: string, dados: Record<string, unknown> = {}) =>
    createAtiva(fone, { status: "closed", closedAt: new Date(), ratingState, ...dados });

  const textosDoCliente = async (sessionId: string) =>
    (await mensagens(sessionId)).filter((m) => m.sender === "client").map((m) => m.text);

  it("a nota vai para a avaliação e não vira mensagem da conversa", async () => {
    const fone = phone();
    const s = await createEncerrada(fone, "awaiting_score");
    await post(texto(fone, "5, adorei"));
    expect(await prisma.chatSession.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({
      ratingScore: 5,
      ratingState: "awaiting_comment",
    });
    expect(await textosDoCliente(s.id)).toEqual([]);
  });

  it("o comentário vai para a avaliação e não vira mensagem da conversa", async () => {
    const fone = phone();
    const s = await createEncerrada(fone, "awaiting_comment", { ratingScore: 2 });
    await post(texto(fone, "Demorou demais"));
    expect(await prisma.chatSession.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({
      ratingComment: "Demorou demais",
      ratingState: "done",
    });
    expect(await textosDoCliente(s.id)).toEqual([]);
  });

  it("o que não é nota continua na conversa, e a pesquisa pede a nota de novo", async () => {
    const fone = phone();
    const s = await createEncerrada(fone, "awaiting_score");
    await post(texto(fone, "obrigado"));
    expect(await textosDoCliente(s.id)).toEqual(["obrigado"]);
    expect((await prisma.chatSession.findUniqueOrThrow({ where: { id: s.id } })).ratingState).toBe("awaiting_score");
  });
});
