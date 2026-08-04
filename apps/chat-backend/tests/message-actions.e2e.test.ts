/**
 * Edição e remoção de mensagens (atendente, cliente e WhatsApp).
 *
 * Cobre as regras do servidor — que não podem depender da UI:
 *   - atendente só altera as PRÓPRIAS mensagens;
 *   - cliente só altera as próprias mensagens;
 *   - alterações são propagadas ao WhatsApp (edit-message / DELETE messages);
 *   - edições/remoções feitas pelo cliente no WhatsApp são aplicadas localmente;
 *   - o cliente recebe a versão redigida; o atendente recebe o histórico completo.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  CHAT_URL,
  cleanWorkspace,
  configureWorkspace,
  connectAttendant,
  postWebhook,
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

const workspace = uniqueWorkspace("wsedit");
const phone = `5567${Math.floor(100000000 + Math.random() * 899999999)}`;

let zapi: FakeZapi;
let attendant: AttendantSocket;
let attendantId: string;
let sessionId: string;

/** Coloca a conversa em atendimento (atendente atribuído) para os testes. */
async function openActiveSession() {
  await sendWhatsAppText(workspace, phone, "oi");
  const session = await waitUntil(() => prisma.chatSession.findFirst({ where: { workspaceId: workspace, clientPhone: phone } }));
  await prisma.chatSession.update({ where: { id: session!.id }, data: { botState: "done" } });
  attendant.send({ type: "agent.open", session_id: session!.id });
  attendant.send({ type: "agent.assign", session_id: session!.id });
  await waitUntil(async () => {
    const s = await prisma.chatSession.findUnique({ where: { id: session!.id } });
    return s?.status === "active" ? s : null;
  });
  return session!.id;
}

beforeAll(async () => {
  zapi = startFakeZapi();
  await configureWorkspace(workspace, zapi.baseUrl);
  const user = await resolveTestAttendant();
  attendantId = user.id;
  attendant = await connectAttendant(workspace, await signPlaneToken(user.id, user.email));
  sessionId = await openActiveSession();
}, 30000);

afterAll(async () => {
  attendant?.close();
  zapi?.stop();
  await cleanWorkspace(workspace);
});

async function sendAttendantMessage(text: string) {
  zapi.reset();
  attendant.send({ type: "agent.message", session_id: sessionId, text });
  await zapi.waitFor((c) => c.action === "send-text" && String(c.body.message).includes(text));
  const message = await waitUntil(() =>
    prisma.chatMessage.findFirst({ where: { sessionId, sender: "attendant", text }, orderBy: { createdAt: "desc" } })
  );
  return message!;
}

describe("atendente", () => {
  test("mensagem enviada guarda o id do provedor (necessário para editar/apagar)", async () => {
    const message = await sendAttendantMessage("mensagem original");
    const stored = await waitUntil(async () => {
      const m = await prisma.chatMessage.findUnique({ where: { id: message.id } });
      return m?.externalId ? m : null;
    });
    expect(stored!.externalId).toBeTruthy();
  }, 20000);

  test("editar mantém histórico e propaga para o WhatsApp", async () => {
    const message = await sendAttendantMessage("texto a editar");
    await waitUntil(async () => (await prisma.chatMessage.findUnique({ where: { id: message.id } }))?.externalId);

    zapi.reset();
    attendant.send({ type: "agent.edit", message_id: message.id, text: "texto corrigido" });

    const edited = await waitUntil(async () => {
      const m = await prisma.chatMessage.findUnique({ where: { id: message.id } });
      return m?.text === "texto corrigido" ? m : null;
    });
    expect(edited!.editedAt).not.toBeNull();
    expect((edited!.editHistory as any[])[0].text).toBe("texto a editar");

    const call = await zapi.waitFor((c) => c.action === "edit-message");
    expect(call.body.message).toBe("texto corrigido");
    expect(call.body.messageId).toBe(edited!.externalId);
    expect(call.body.phone).toBe(phone);
  }, 20000);

  test("apagar marca deleted_at e propaga o DELETE para o WhatsApp", async () => {
    const message = await sendAttendantMessage("texto a apagar");
    await waitUntil(async () => (await prisma.chatMessage.findUnique({ where: { id: message.id } }))?.externalId);

    zapi.reset();
    attendant.send({ type: "agent.delete", message_id: message.id });

    const deleted = await waitUntil(async () => {
      const m = await prisma.chatMessage.findUnique({ where: { id: message.id } });
      return m?.deletedAt ? m : null;
    });
    expect(deleted).not.toBeNull();

    const call = await zapi.waitFor((c) => c.method === "DELETE");
    expect(call.query.messageId).toBe(deleted!.externalId!);
    expect(call.query.owner).toBe("true");
  }, 20000);

  test("não pode editar a mensagem do cliente", async () => {
    const clientMessage = await prisma.chatMessage.findFirst({ where: { sessionId, sender: "client" } });
    expect(clientMessage).not.toBeNull();

    attendant.send({ type: "agent.edit", message_id: clientMessage!.id, text: "adulterada" });
    const error = await attendant.waitFor((e) => e.type === "error" && e.message_id === clientMessage!.id);
    expect(error.detail).toContain("suas próprias mensagens");

    const untouched = await prisma.chatMessage.findUnique({ where: { id: clientMessage!.id } });
    expect(untouched!.text).not.toBe("adulterada");
    expect(untouched!.editedAt).toBeNull();
  }, 20000);

  test("não pode apagar duas vezes", async () => {
    const message = await sendAttendantMessage("apagar duas vezes");
    attendant.send({ type: "agent.delete", message_id: message.id });
    await waitUntil(async () => (await prisma.chatMessage.findUnique({ where: { id: message.id } }))?.deletedAt);

    attendant.send({ type: "agent.delete", message_id: message.id });
    const error = await attendant.waitFor((e) => e.type === "error" && e.message_id === message.id);
    expect(error.detail).toContain("já apagada");
  }, 20000);
});

describe("cliente (widget nativo)", () => {
  test("edita e apaga apenas as próprias mensagens da sua sessão", async () => {
    // Sessão nativa própria + token de cliente emitido pelo backend.
    const res = await fetch(`${CHAT_URL}/sessions/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: workspace, browser_id: crypto.randomUUID(), name: "Cliente Nativo" }),
    });
    expect(res.ok).toBe(true);
    const created = (await res.json()) as { session: { id: string }; token: string };

    const ws = new WebSocket(`${CHAT_URL.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(created.token)}`);
    const events: any[] = [];
    ws.addEventListener("message", (ev) => {
      try {
        events.push(JSON.parse(String(ev.data)));
      } catch {
        /* ignora frames não-JSON */
      }
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WS do cliente não abriu")), 8000);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    ws.send(JSON.stringify({ type: "client.message", text: "mensagem do cliente" }));
    const own = await waitUntil(() =>
      prisma.chatMessage.findFirst({ where: { sessionId: created.session.id, sender: "client", text: "mensagem do cliente" } })
    );
    expect(own).not.toBeNull();

    ws.send(JSON.stringify({ type: "client.edit", message_id: own!.id, text: "mensagem corrigida" }));
    const edited = await waitUntil(async () => {
      const m = await prisma.chatMessage.findUnique({ where: { id: own!.id } });
      return m?.text === "mensagem corrigida" ? m : null;
    });
    expect(edited).not.toBeNull();

    // Mensagem de OUTRA sessão continua intocada.
    const foreign = await prisma.chatMessage.findFirst({ where: { sessionId, sender: "client" } });
    ws.send(JSON.stringify({ type: "client.delete", message_id: foreign!.id }));
    await Bun.sleep(600);
    const stillThere = await prisma.chatMessage.findUnique({ where: { id: foreign!.id } });
    expect(stillThere!.deletedAt).toBeNull();

    ws.send(JSON.stringify({ type: "client.delete", message_id: own!.id }));
    const deleted = await waitUntil(async () => {
      const m = await prisma.chatMessage.findUnique({ where: { id: own!.id } });
      return m?.deletedAt ? m : null;
    });
    expect(deleted).not.toBeNull();
    ws.close();
  }, 30000);
});

describe("WhatsApp → sistema", () => {
  test("cliente edita a mensagem no WhatsApp e o texto é atualizado aqui", async () => {
    const externalId = `EDIT-${crypto.randomUUID().slice(0, 8)}`;
    await postWebhook(workspace, {
      phone,
      senderName: "Cliente Teste",
      messageId: externalId,
      fromMe: false,
      text: { message: "erro de digitacao" },
    });
    const message = await waitUntil(() => prisma.chatMessage.findFirst({ where: { externalId } }));
    expect(message).not.toBeNull();

    await postWebhook(workspace, {
      phone,
      messageId: externalId,
      isEdit: true,
      fromMe: false,
      text: { message: "erro de digitação corrigido" },
    });
    const edited = await waitUntil(async () => {
      const m = await prisma.chatMessage.findUnique({ where: { id: message!.id } });
      return m?.text === "erro de digitação corrigido" ? m : null;
    });
    expect(edited!.editedAt).not.toBeNull();
    expect((edited!.editHistory as any[])[0].text).toBe("erro de digitacao");
  }, 20000);

  test("cliente apaga a mensagem no WhatsApp e ela é marcada como apagada", async () => {
    const externalId = `DEL-${crypto.randomUUID().slice(0, 8)}`;
    await postWebhook(workspace, {
      phone,
      senderName: "Cliente Teste",
      messageId: externalId,
      fromMe: false,
      text: { message: "mensagem que sera apagada" },
    });
    const message = await waitUntil(() => prisma.chatMessage.findFirst({ where: { externalId } }));
    expect(message).not.toBeNull();

    await postWebhook(workspace, { phone, type: "DeleteCallback", fromMe: false, ids: [externalId] });
    const deleted = await waitUntil(async () => {
      const m = await prisma.chatMessage.findUnique({ where: { id: message!.id } });
      return m?.deletedAt ? m : null;
    });
    expect(deleted).not.toBeNull();
    // O texto original permanece no banco (visível apenas ao time, não ao cliente).
    expect(deleted!.text).toBe("mensagem que sera apagada");
  }, 20000);
});
