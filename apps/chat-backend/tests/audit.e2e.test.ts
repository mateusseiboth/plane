/**
 * Trilha de auditoria (LGPD) do chat.
 *
 * Conversa de atendimento carrega dado pessoal (nome, telefone, conteúdo), então
 * assumir e encerrar um atendimento precisam ficar registrados em `audit_logs` —
 * a mesma tabela do Plane, escrita aqui por SQL direto.
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

/** A trilha exige um workspace REAL do Plane (o slug precisa existir em `workspaces`). */
let workspace: string;
let workspaceId: string;
const phone = `5567${Math.floor(100000000 + Math.random() * 899999999)}`;

let zapi: FakeZapi;
let attendant: AttendantSocket;
let attendantId: string;
let sessionId: string;

type AuditRow = { action: string; entity: string; entity_id: string; actor_id: string | null; metadata: any };

async function findAudit(action: string, entityId: string): Promise<AuditRow | null> {
  return waitUntil(async () => {
    const rows = (await prisma.$queryRaw`
      SELECT action, entity, entity_id, actor_id::text AS actor_id, metadata
      FROM audit_logs
      WHERE entity = 'chat_session' AND entity_id = ${entityId} AND action = ${action}
      ORDER BY created_at DESC LIMIT 1`) as AuditRow[];
    return rows[0] ?? null;
  });
}

beforeAll(async () => {
  // Workspace de teste precisa existir de verdade para a trilha resolver o uuid.
  workspace = uniqueWorkspace("wsaudit");
  const created = (await prisma.$queryRaw`
    INSERT INTO workspaces (id, created_at, updated_at, name, slug, timezone)
    VALUES (gen_random_uuid(), NOW(), NOW(), ${"Auditoria " + workspace}, ${workspace}, 'UTC')
    RETURNING id::text AS id`) as Array<{ id: string }>;
  workspaceId = created[0]!.id;

  zapi = startFakeZapi();
  await configureWorkspace(workspace, zapi.baseUrl);
  const user = await resolveTestAttendant();
  attendantId = user.id;
  attendant = await connectAttendant(workspace, await signPlaneToken(user.id, user.email));

  await sendWhatsAppText(workspace, phone, "oi");
  const session = await waitUntil(() =>
    prisma.chatSession.findFirst({ where: { workspaceId: workspace, clientPhone: phone } })
  );
  sessionId = session!.id;
  await prisma.chatSession.update({ where: { id: sessionId }, data: { botState: "done" } });
}, 40000);

afterAll(async () => {
  attendant?.close();
  zapi?.stop();
  await prisma.$executeRaw`DELETE FROM audit_logs WHERE workspace_id = ${workspaceId}::uuid`;
  await cleanWorkspace(workspace);
  await prisma.$executeRaw`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`;
});

describe("trilha de auditoria do chat", () => {
  test("assumir o atendimento registra quem passou a ter acesso à conversa", async () => {
    attendant.send({ type: "agent.open", session_id: sessionId });
    attendant.send({ type: "agent.assign", session_id: sessionId });

    await waitUntil(async () => {
      const s = await prisma.chatSession.findUnique({ where: { id: sessionId } });
      return s?.status === "active" ? s : null;
    });

    const log = await findAudit("assign", sessionId);
    expect(log).not.toBeNull();
    expect(log!.actor_id).toBe(attendantId);
    expect(log!.metadata.origem).toBe("chat");
    expect(log!.metadata.canal).toBe("whatsapp");
  }, 25000);

  test("abrir a transcrição pelo protocolo registra o acesso ao conteúdo", async () => {
    const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    const res = await fetch(
      `${process.env.CHAT_URL ?? "http://localhost:8002"}/sessions/by-protocol/${session!.protocol}/`
    );
    expect(res.ok).toBe(true);

    const log = await findAudit("view", sessionId);
    expect(log).not.toBeNull();
    expect(log!.metadata.protocolo).toBe(session!.protocol);
    expect(typeof log!.metadata.mensagens).toBe("number");
  }, 25000);

  test("encerrar o atendimento registra o encerramento com o autor", async () => {
    attendant.send({ type: "agent.close", session_id: sessionId });
    await waitUntil(async () => {
      const s = await prisma.chatSession.findUnique({ where: { id: sessionId } });
      return s?.status === "closed" ? s : null;
    });

    const log = await findAudit("close", sessionId);
    expect(log).not.toBeNull();
    expect(log!.actor_id).toBe(attendantId);
  }, 25000);

  test("workspace inexistente não gera registro órfão", async () => {
    const antes = (await prisma.$queryRaw`SELECT count(*)::int AS total FROM audit_logs`) as Array<{ total: number }>;
    const { recordChatAudit } = await import("@/audit");
    await recordChatAudit({ workspaceSlug: "workspace-que-nao-existe", sessionId: "x", action: "view" });
    const depois = (await prisma.$queryRaw`SELECT count(*)::int AS total FROM audit_logs`) as Array<{ total: number }>;
    expect(depois[0]!.total).toBe(antes[0]!.total);
  });
});
