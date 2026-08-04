/**
 * Utilitários dos testes do chat-backend.
 *
 * Os testes rodam contra uma instância JÁ EM EXECUÇÃO (CHAT_URL, padrão
 * http://localhost:8002) e usam um workspace de teste próprio (slug aleatório),
 * de modo que nenhum dado real é tocado — o `workspaceId` do chat é sempre o
 * slug do workspace do Plane.
 */

import { SignJWT } from "jose";
import prisma from "@db";

export const CHAT_URL = (process.env.CHAT_URL ?? "http://localhost:8002").replace(/\/$/, "");
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "plane-jwt-secret");

/** Token equivalente ao emitido pelo login do Plane (mesmo segredo compartilhado). */
export async function signPlaneToken(userId: string, email = "atendente@teste.local"): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SECRET);
}

export function uniqueWorkspace(prefix = "wstest"): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * O schema do chat não tem model User (referencia o id do Plane como string), mas
 * `attendantName()` lê a tabela `users` compartilhada. Os testes usam um usuário
 * real do banco para que o nome do atendente seja resolvido de verdade.
 */
export async function resolveTestAttendant(): Promise<{ id: string; email: string }> {
  const preferred = process.env.TEST_ATTENDANT_EMAIL ?? "atendimento@quality.local";
  const rows = (await prisma.$queryRaw`
    SELECT id::text AS id, email FROM users
    WHERE deleted_at IS NULL
    ORDER BY (email = ${preferred}) DESC, created_at ASC
    LIMIT 1`) as Array<{ id: string; email: string }>;
  const user = rows[0];
  if (!user) throw new Error("Nenhum usuário na tabela `users`: rode o seed do api-ts antes dos testes do chat.");
  return user;
}

// ── Servidor Z-API falso ──────────────────────────────────────────────────────
// Captura as chamadas de saída para que os testes verifiquem o que seria enviado
// ao WhatsApp sem depender da API real.

export type ZapiCall = { action: string; body: any; method: string; query: Record<string, string> };

export type FakeZapi = {
  baseUrl: string;
  calls: ZapiCall[];
  /** Espera até haver uma chamada que satisfaça o predicado. */
  waitFor(predicate: (c: ZapiCall) => boolean, timeoutMs?: number): Promise<ZapiCall>;
  reset(): void;
  stop(): void;
};

export function startFakeZapi(): FakeZapi {
  const calls: ZapiCall[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      // /instances/{id}/token/{token}/{action...}
      const action = url.pathname.split("/token/")[1]?.split("/").slice(1).join("/") ?? url.pathname;
      const body = await req.json().catch(() => ({}));
      calls.push({
        action,
        body,
        method: req.method,
        query: Object.fromEntries(url.searchParams.entries()),
      });
      return Response.json({ messageId: `fake-${crypto.randomUUID().slice(0, 8)}`, zaapId: "fake" });
    },
  });

  return {
    baseUrl: `http://localhost:${server.port}`,
    calls,
    async waitFor(predicate, timeoutMs = 8000) {
      const found = await waitUntil(() => calls.find(predicate) ?? null, timeoutMs);
      if (!found) throw new Error(`Nenhuma chamada Z-API correspondente em ${timeoutMs}ms. Recebidas: ${calls.map((c) => c.action).join(", ")}`);
      return found;
    },
    reset() {
      calls.length = 0;
    },
    stop() {
      server.stop(true);
    },
  };
}

// ── Espera ativa ──────────────────────────────────────────────────────────────

export async function waitUntil<T>(fn: () => T | Promise<T>, timeoutMs = 8000, stepMs = 100): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await Bun.sleep(stepMs);
  }
  return null;
}

// ── Socket do atendente ───────────────────────────────────────────────────────

export type AttendantSocket = {
  ws: WebSocket;
  events: any[];
  send(payload: unknown): void;
  waitFor(predicate: (e: any) => boolean, timeoutMs?: number): Promise<any>;
  close(): void;
};

/** Faz o fluxo real: pega o ticket via REST (com o token do Plane) e abre o WS. */
export async function connectAttendant(workspace: string, token: string): Promise<AttendantSocket> {
  const res = await fetch(`${CHAT_URL}/workspaces/${workspace}/ws-ticket/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`ws-ticket falhou: ${res.status} ${await res.text()}`);
  const { ticket } = (await res.json()) as { ticket: string };

  const wsUrl = `${CHAT_URL.replace(/^http/, "ws")}/ws?workspace=${workspace}&ticket=${encodeURIComponent(ticket)}`;
  const ws = new WebSocket(wsUrl);
  const events: any[] = [];
  ws.addEventListener("message", (ev) => {
    try {
      events.push(JSON.parse(String(ev.data)));
    } catch {
      /* frame não-JSON: ignorado */
    }
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WS não abriu em 8s")), 8000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`WS erro: ${String(e)}`));
    });
  });

  return {
    ws,
    events,
    send: (payload) => ws.send(JSON.stringify(payload)),
    async waitFor(predicate, timeoutMs = 8000) {
      const found = await waitUntil(() => events.find(predicate) ?? null, timeoutMs);
      if (!found) throw new Error(`Evento WS não recebido em ${timeoutMs}ms. Recebidos: ${events.map((e) => e.type).join(", ")}`);
      return found;
    },
    close: () => ws.close(),
  };
}

// ── Webhook Z-API (entrada) ───────────────────────────────────────────────────

export async function sendWhatsAppText(workspace: string, phone: string, message: string, senderName = "Cliente Teste") {
  return postWebhook(workspace, {
    phone,
    senderName,
    messageId: `MSG${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`,
    fromMe: false,
    text: { message },
  });
}

export async function postWebhook(workspace: string, body: Record<string, unknown>) {
  const res = await fetch(`${CHAT_URL}/providers/zapi/webhook/${workspace}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`webhook falhou: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Setup / limpeza do workspace de teste ─────────────────────────────────────

export async function configureWorkspace(workspace: string, zapiBaseUrl: string) {
  await prisma.providerConfig.upsert({
    where: { workspaceId: workspace },
    create: {
      workspaceId: workspace,
      provider: "zapi",
      instanceId: "test-instance",
      token: "test-token",
      clientToken: "test-client-token",
      baseUrl: zapiBaseUrl,
      isActive: true,
    },
    update: { baseUrl: zapiBaseUrl, isActive: true },
  });
  await prisma.botConfig.upsert({
    where: { workspaceId: workspace },
    create: { workspaceId: workspace },
    update: { businessHours: [], businessBreaks: [] },
  });
}

export async function cleanWorkspace(workspace: string) {
  const sessions = await prisma.chatSession.findMany({ where: { workspaceId: workspace }, select: { id: true } });
  const ids = sessions.map((s) => s.id);
  if (ids.length) {
    await prisma.chatMessage.deleteMany({ where: { sessionId: { in: ids } } });
    await prisma.chatReadState.deleteMany({ where: { sessionId: { in: ids } } });
    await prisma.chatSession.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.contact.deleteMany({ where: { workspaceId: workspace } });
  await prisma.botMenuOption.deleteMany({ where: { workspaceId: workspace } });
  await prisma.botFlow.deleteMany({ where: { workspaceId: workspace } });
  await prisma.queueMember.deleteMany({ where: { queue: { workspaceId: workspace } } });
  await prisma.queue.deleteMany({ where: { workspaceId: workspace } });
  await prisma.attendantStatus.deleteMany({ where: { workspaceId: workspace } });
  await prisma.protocolCounter.deleteMany({ where: { workspaceId: workspace } });
  await prisma.botConfig.deleteMany({ where: { workspaceId: workspace } });
  await prisma.providerConfig.deleteMany({ where: { workspaceId: workspace } });
}

export { prisma };
