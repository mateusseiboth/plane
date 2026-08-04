/**
 * Integração WhatsApp (Z-API) ponta a ponta.
 *
 * Simula o webhook da Z-API (mensagens do cliente) e um servidor Z-API falso
 * (mensagens de saída), com um atendente real conectado ao WebSocket. Cobre:
 *   bot (saudação → nome → menu) → fila → roteamento → atendimento → encerramento.
 *
 * Pré-requisitos: chat-backend em execução (CHAT_URL) apontando para o mesmo
 * DATABASE_URL usado aqui, e ao menos um usuário na tabela `users` do Plane.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  cleanWorkspace,
  configureWorkspace,
  connectAttendant,
  prisma,
  resolveTestAttendant,
  sendWhatsAppText,
  signPlaneToken,
  startFakeZapi,
  uniqueWorkspace,
  waitUntil,
  type AttendantSocket,
  type FakeZapi,
} from "@tests/helpers/harness";

const workspace = uniqueWorkspace();
const phone = `5567${Math.floor(100000000 + Math.random() * 899999999)}`;
// Telefone isolado para os casos de webhook (dedup/eco) não interferirem na
// máquina de estados da conversa principal.
const otherPhone = `5567${Math.floor(100000000 + Math.random() * 899999999)}`;

let zapi: FakeZapi;
let attendant: AttendantSocket;
let attendantId: string;

/** Texto enviado ao WhatsApp em qualquer chamada send-text. */
const sentTexts = () => zapi.calls.filter((c) => c.action === "send-text").map((c) => String(c.body.message ?? ""));

beforeAll(async () => {
  zapi = startFakeZapi();
  await configureWorkspace(workspace, zapi.baseUrl);

  const user = await resolveTestAttendant();
  attendantId = user.id;
  const token = await signPlaneToken(user.id, user.email);
  attendant = await connectAttendant(workspace, token);

  // Uma opção de menu que joga o cliente numa fila (sem membros → cai no
  // fallback de "qualquer atendente conectado").
  const queue = await prisma.queue.create({ data: { workspaceId: workspace, name: "Suporte" } });
  await prisma.botMenuOption.create({
    data: { workspaceId: workspace, order: 0, key: "1", label: "Suporte", action: "queue", queueId: queue.id },
  });
});

afterAll(async () => {
  attendant?.close();
  zapi?.stop();
  await cleanWorkspace(workspace);
});

describe("webhook Z-API → sessão", () => {
  // Primeiro acesso ao banco/cliente Prisma no processo de teste: dá folga.
  test("primeira mensagem cria contato, sessão e dispara a saudação do bot", async () => {
    await sendWhatsAppText(workspace, phone, "oi");

    const session = await waitUntil(() =>
      prisma.chatSession.findFirst({ where: { workspaceId: workspace, clientPhone: phone } })
    );
    expect(session).not.toBeNull();
    expect(session!.channel).toBe("whatsapp");
    expect(session!.protocol).toMatch(/^\d{8}-\d{4}$/);

    const contact = await prisma.contact.findFirst({ where: { workspaceId: workspace, phone } });
    expect(contact).not.toBeNull();

    // O webhook já traz o senderName do WhatsApp, então o bot confirma o contato
    // em vez de perguntar o nome. Saudação + confirmação vão para o WhatsApp.
    await zapi.waitFor((c) => c.action === "send-text" && String(c.body.message).includes("Você é Cliente Teste"));
    expect(sentTexts().some((t) => t.includes("Bem-vindo"))).toBe(true);

    const state = await waitUntil(async () => {
      const s = await prisma.chatSession.findUnique({ where: { id: session!.id } });
      return s?.botState === "confirm_contact" ? s : null;
    });
    expect(state).not.toBeNull();
  }, 20000);

  test("mensagens duplicadas (mesmo messageId) são ignoradas", async () => {
    const body = {
      phone: otherPhone,
      senderName: "Cliente Teste",
      messageId: "DUPLICADA-123",
      fromMe: false,
      text: { message: "mensagem repetida" },
    };
    const res = await fetch(`${process.env.CHAT_URL ?? "http://localhost:8002"}/providers/zapi/webhook/${workspace}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.ok).toBe(true);
    await fetch(`${process.env.CHAT_URL ?? "http://localhost:8002"}/providers/zapi/webhook/${workspace}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const count = await prisma.chatMessage.count({ where: { externalId: "DUPLICADA-123" } });
    expect(count).toBe(1);
  });

  test("eco das nossas próprias mensagens (fromMe) é ignorado", async () => {
    const before = await prisma.chatMessage.count({ where: { session: { workspaceId: workspace } } });
    await fetch(`${process.env.CHAT_URL ?? "http://localhost:8002"}/providers/zapi/webhook/${workspace}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: otherPhone, fromMe: true, messageId: "ECO-1", text: { message: "eco" } }),
    });
    const after = await prisma.chatMessage.count({ where: { session: { workspaceId: workspace } } });
    expect(after).toBe(before);
  });
});

describe("fluxo do bot até o atendente", () => {
  test("recusar o contato faz o bot perguntar o nome; o nome informado leva ao menu", async () => {
    zapi.reset();
    await sendWhatsAppText(workspace, phone, "não");
    await zapi.waitFor((c) => c.action === "send-text" && String(c.body.message).includes("qual é o seu nome"));

    zapi.reset();
    await sendWhatsAppText(workspace, phone, "Maria da Silva");
    await zapi.waitFor((c) => c.action === "send-text" && String(c.body.message).includes("1) Suporte"));

    const session = await waitUntil(async () => {
      const s = await prisma.chatSession.findFirst({ where: { workspaceId: workspace, clientPhone: phone } });
      return s?.botState === "menu" ? s : null;
    });
    expect(session).not.toBeNull();
    expect(session!.clientName).toBe("Maria da Silva");
  }, 20000);

  test("opção do menu enfileira e roteia para o atendente conectado", async () => {
    zapi.reset();
    await sendWhatsAppText(workspace, phone, "1");

    const assigned = await waitUntil(async () => {
      const s = await prisma.chatSession.findFirst({ where: { workspaceId: workspace, clientPhone: phone } });
      return s?.status === "active" ? s : null;
    });
    expect(assigned).not.toBeNull();
    expect(assigned!.assignedAttendantId).toBe(attendantId);

    // O atendente recebe o aviso de atribuição pelo WS.
    const event = await attendant.waitFor((e) => e.type === "session.assigned" && e.session_id === assigned!.id);
    expect(event.session_id).toBe(assigned!.id);

    // Evento de sistema nomeado ("<Atendente> iniciou o atendimento.").
    const systemMessage = await waitUntil(() =>
      prisma.chatMessage.findFirst({ where: { sessionId: assigned!.id, sender: "system", type: "event" } })
    );
    expect(systemMessage!.text).toContain("iniciou o atendimento");
  });

  test("resposta do atendente é persistida e encaminhada ao WhatsApp com o nome", async () => {
    zapi.reset();
    const session = await prisma.chatSession.findFirst({ where: { workspaceId: workspace, clientPhone: phone } });
    attendant.send({ type: "agent.open", session_id: session!.id });
    attendant.send({ type: "agent.message", session_id: session!.id, text: "Bom dia, como posso ajudar?" });

    const call = await zapi.waitFor((c) => c.action === "send-text" && String(c.body.message).includes("como posso ajudar"));
    expect(call.body.phone).toBe(phone);
    // Prefixo "*Nome*:\n" para o cliente saber quem está falando.
    expect(String(call.body.message)).toMatch(/^\*.+\*:\n/);

    const stored = await waitUntil(() =>
      prisma.chatMessage.findFirst({
        where: { sessionId: session!.id, sender: "attendant" },
        orderBy: { createdAt: "desc" },
      })
    );
    expect(stored!.text).toBe("Bom dia, como posso ajudar?");
    expect(stored!.senderUserId).toBe(attendantId);
  });

  test("mensagem do cliente durante o atendimento não reativa o bot", async () => {
    zapi.reset();
    await sendWhatsAppText(workspace, phone, "preciso de ajuda com o relatório");

    const session = await prisma.chatSession.findFirst({ where: { workspaceId: workspace, clientPhone: phone } });
    const stored = await waitUntil(() =>
      prisma.chatMessage.findFirst({
        where: { sessionId: session!.id, sender: "client", text: "preciso de ajuda com o relatório" },
      })
    );
    expect(stored).not.toBeNull();

    // O bot não deve ter respondido nada (nenhum envio automático).
    await Bun.sleep(500);
    expect(sentTexts()).toHaveLength(0);
  });

  test("mídia recebida vira mensagem com o tipo correto", async () => {
    const session = await prisma.chatSession.findFirst({ where: { workspaceId: workspace, clientPhone: phone } });
    await fetch(`${process.env.CHAT_URL ?? "http://localhost:8002"}/providers/zapi/webhook/${workspace}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        senderName: "Maria da Silva",
        messageId: "MEDIA-1",
        fromMe: false,
        image: { imageUrl: "https://exemplo.test/foto.jpg", mimeType: "image/jpeg", caption: "segue o print" },
      }),
    });

    const stored = await waitUntil(() =>
      prisma.chatMessage.findFirst({ where: { sessionId: session!.id, externalId: "MEDIA-1" } })
    );
    expect(stored!.type).toBe("image");
    expect(stored!.text).toBe("segue o print");
    expect(stored!.mediaKey).toBe("ext:https://exemplo.test/foto.jpg");
  });
});

describe("encerramento", () => {
  test("atendente encerra, cliente recebe protocolo e a pesquisa é solicitada", async () => {
    zapi.reset();
    const session = await prisma.chatSession.findFirst({ where: { workspaceId: workspace, clientPhone: phone } });
    attendant.send({ type: "agent.close", session_id: session!.id });

    const closed = await waitUntil(async () => {
      const s = await prisma.chatSession.findUnique({ where: { id: session!.id } });
      return s?.status === "closed" ? s : null;
    });
    expect(closed).not.toBeNull();
    expect(closed!.closedAt).not.toBeNull();

    await zapi.waitFor((c) => c.action === "send-text" && String(c.body.message).includes(closed!.protocol));

    // Pesquisa de satisfação conversacional no WhatsApp (pedida logo após o fechamento).
    const surveyed = await waitUntil(async () => {
      const s = await prisma.chatSession.findUnique({ where: { id: session!.id } });
      return s?.ratingState === "awaiting_score" ? s : null;
    });
    expect(surveyed).not.toBeNull();
  }, 20000);

  test("nota respondida após o encerramento alimenta a pesquisa (não abre nova sessão)", async () => {
    const before = await prisma.chatSession.count({ where: { workspaceId: workspace } });
    await sendWhatsAppText(workspace, phone, "5");

    const rated = await waitUntil(async () => {
      const s = await prisma.chatSession.findFirst({ where: { workspaceId: workspace, clientPhone: phone } });
      return s?.ratingScore === 5 ? s : null;
    });
    expect(rated).not.toBeNull();
    expect(await prisma.chatSession.count({ where: { workspaceId: workspace } })).toBe(before);
  });
});
