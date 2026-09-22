/**
 * W05 contra o servidor de pé (CHAT_URL): "enviar sem o nome" pelo socket do
 * atendente chega ao WhatsApp sem o `*Nome*:` e ao cliente sem o rótulo; os
 * dados técnicos mandados pelo sistema que embute o widget ficam na conversa.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import {
  CHAT_URL,
  cleanWorkspace,
  configureWorkspace,
  connectAttendant,
  limparWorkspacePlane,
  resolveTestAttendant,
  signPlaneToken,
  startFakeZapi,
  uniqueWorkspace,
  waitUntil,
  type AttendantSocket,
  type FakeZapi,
} from "@tests/helpers/harness";

const slug = uniqueWorkspace("wsw05e2e");
let zapi: FakeZapi;
let token: string;
let userId: string;
let atendente: AttendantSocket;

beforeAll(async () => {
  zapi = startFakeZapi();
  await configureWorkspace(slug, zapi.baseUrl);
  const user = await resolveTestAttendant();
  userId = user.id;
  token = await signPlaneToken(user.id, user.email);
  atendente = await connectAttendant(slug, token);
}, 30000);

afterAll(async () => {
  atendente?.close();
  zapi?.stop();
  await cleanWorkspace(slug);
  await limparWorkspacePlane(slug);
});

describe("enviar sem o nome do atendente", () => {
  it("o WhatsApp recebe só o texto; o padrão continua com o nome", async () => {
    const s = await prisma.chatSession.create({
      data: {
        workspaceId: slug,
        protocol: `E5-${crypto.randomUUID().slice(0, 12)}`,
        channel: "whatsapp",
        clientPhone: "5567999001122",
        status: "active",
        botState: "done",
        assignedAttendantId: userId,
      },
    });
    zapi.reset();
    atendente.send({ type: "agent.message", session_id: s.id, text: "Com nome" });
    const comNome = await zapi.waitFor((c) => c.action === "send-text" && String(c.body.message).endsWith("Com nome"));
    expect(comNome.body.message).toMatch(/^\*.+\*:\nCom nome$/);
    atendente.send({ type: "agent.message", session_id: s.id, text: "Sem nome", without_sender_name: true });
    const semNome = await zapi.waitFor((c) => c.action === "send-text" && String(c.body.message).endsWith("Sem nome"));
    expect(semNome.body.message).toBe("Sem nome");
    const gravada = await waitUntil(() =>
      prisma.chatMessage.findFirst({ where: { sessionId: s.id, text: "Sem nome" } })
    );
    expect(gravada?.withoutSenderName).toBe(true);
  });
});

describe("dados técnicos do cliente", () => {
  it("o POST /sessions/ guarda só as chaves conhecidas e a conversa retomada completa", async () => {
    const browserId = crypto.randomUUID();
    const post = (clientInfo: unknown) =>
      fetch(`${CHAT_URL}/sessions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: slug, browser_id: browserId, name: "Cliente", client_info: clientInfo }),
      }).then((r) => r.json() as Promise<any>);
    const criada = await post({ versao: "4.0.1", computador: "PC-01", senha: "x" });
    expect(criada.session.client_info).toEqual({ versao: "4.0.1", computador: "PC-01" });
    const retomada = await post({ so: "Windows 10" });
    expect(retomada.session.id).toBe(criada.session.id);
    expect(retomada.session.client_info).toEqual({ versao: "4.0.1", computador: "PC-01", so: "Windows 10" });
  });
});
