import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { randomUUID } from "crypto";
import prisma from "@db";
import { resolveAttendant, signClientToken, verifyClientToken, signWsTicket, verifyWsTicket } from "@/auth";
import { nextProtocol } from "@/protocol";
import { handleInboundClient, startBot, startNativeSession } from "@/bot/engine";
import { registrarEncerramento } from "@/encerramento";
import { availableAttendants, inicioDoDiaNoFuso } from "@/presence";
import { deliverOutbound } from "@/outbound";
import { persistAndBroadcast, serializeMessage } from "@/messages";
import { applyProviderMutation, deleteMessage, editMessage } from "@/message-actions";
import { routeQueuedSession, drainQueuesForWorkspace, assignSessionToAttendant } from "@/queue/router";
import { getProvider } from "@/providers/provider";
import { saveMedia, serveMedia } from "@/storage";
import { startTimers } from "@/timers";
import { requestRating, handleRatingReply, submitRating, randomDog } from "@/rating";
import { attendantName } from "@/users";
import { ratingsReport, slaReport } from "@/reports";
import {
  register,
  unregister,
  attachSession,
  markPong,
  startHeartbeat,
  sendToSession,
  sendToUser,
  sendToWorkspace,
  emitPresence,
  connectedUserIds,
} from "@/ws/hub";
import { clientPage } from "@/client-page";
import { CHAT_AUDIT_ACTIONS, recordChatAudit } from "@/audit";
import { configModule } from "@/config-routes";

const PORT = Number(process.env.CHAT_PORT ?? 8002);

// ── helpers ───────────────────────────────────────────────────────────────────
function serializeSession(s: any) {
  return {
    id: s.id,
    protocol: s.protocol,
    channel: s.channel,
    workspace_id: s.workspaceId,
    contact_id: s.contactId ?? null,
    // Responsável (cadastro do cliente) já vinculado a este atendimento.
    entity_contact_id: s.entityContactId ?? null,
    client_name: s.clientName ?? s.contact?.name ?? null,
    contact_email: s.contact?.email ?? null,
    contact_entity_id: s.contact?.entityId ?? null,
    client_phone: s.clientPhone ?? null,
    status: s.status,
    queue_id: s.queueId ?? null,
    assigned_attendant_id: s.assignedAttendantId ?? null,
    requested_attendant_id: s.requestedAttendantId ?? null,
    project_id: s.projectId ?? null,
    project_identifier: s.projectIdentifier ?? null,
    project_name: s.projectName ?? null,
    last_client_message_at: s.lastClientMessageAt ?? null,
    last_attendant_message_at: s.lastAttendantMessageAt ?? null,
    client_last_read_at: s.clientLastReadAt ?? null,
    rating_score: s.ratingScore ?? null,
    rating_comment: s.ratingComment ?? null,
    rating_state: s.ratingState ?? null,
    created_at: s.createdAt,
    closed_at: s.closedAt ?? null,
  };
}

// Resolve the client-chosen "system" to a Plane project (by uuid or identifier).
// `slug` is the Plane workspace slug (chat uses it as workspaceId).
async function resolveProject(
  slug: string,
  projectId?: string | null,
  identifier?: string | null
): Promise<{ id: string; identifier: string; name: string } | null> {
  if (!projectId && !identifier) return null;
  try {
    const rows = (await prisma.$queryRaw`
      SELECT p.id::text AS id, p.identifier, p.name
      FROM projects p JOIN workspaces w ON w.id = p.workspace_id
      WHERE w.slug = ${slug} AND p.deleted_at IS NULL
        AND (${projectId ?? null}::text IS NOT NULL AND p.id::text = ${projectId ?? null}
             OR ${identifier ?? null}::text IS NOT NULL AND UPPER(p.identifier) = UPPER(${identifier ?? null}))
      LIMIT 1`) as Array<{ id: string; identifier: string; name: string }>;
    return rows[0] ?? null;
  } catch (e) {
    console.error("[resolveProject]", e);
    return null;
  }
}

async function closeSession(sessionId: string, closedById?: string | null) {
  // A sessão pode ter sumido entre o agendamento do fechamento e a execução —
  // timer de inatividade que dispara depois de o registro ser removido, por
  // exemplo. `update` lança P2025 nesse caso e, sem tratamento, a rejeição não
  // capturada derruba o processo: uma conversa faltando tirava o chat do ar
  // para todo mundo. `updateMany` não lança; zero linhas é só um encerramento
  // que não tem mais o que encerrar.
  const alteradas = await prisma.chatSession.updateMany({
    where: { id: sessionId },
    data: { status: "closed", closedAt: new Date(), closedById: closedById ?? null },
  });
  if (alteradas.count === 0) return null;
  const s = await prisma.chatSession.findUniqueOrThrow({ where: { id: sessionId } });
  sendToSession(sessionId, { type: "session.closed", session_id: sessionId, protocol: s.protocol });
  sendToWorkspace(s.workspaceId, { type: "session.activity", session_id: sessionId });
  recordChatAudit({
    workspaceSlug: s.workspaceId,
    sessionId,
    action: CHAT_AUDIT_ACTIONS.CLOSE,
    userId: closedById ?? null,
    metadata: { protocolo: s.protocol, canal: s.channel },
  });
  const cfg = await prisma.botConfig.findUnique({ where: { workspaceId: s.workspaceId } });
  await deliverOutbound(s as any, {
    sender: "system",
    type: "event",
    text: (cfg?.closedMessage ?? "Atendimento encerrado. Protocolo: {protocol}").replace("{protocol}", s.protocol),
  });
  // Ask the client to rate the service (WhatsApp message / native form).
  await requestRating(s).catch((e) => console.error("[requestRating]", e));
  return s;
}

// Workspace role >= 15 (admin / project manager). `slug` is the Plane workspace slug.
async function isWorkspaceManager(slug: string, userId: string): Promise<boolean> {
  try {
    const rows = (await prisma.$queryRaw`
      SELECT wm.role FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE w.slug = ${slug} AND wm.member_id::text = ${userId}
        AND wm.deleted_at IS NULL AND wm.is_active = true
      LIMIT 1`) as Array<{ role: number }>;
    return Number(rows[0]?.role ?? 0) >= 15;
  } catch {
    return false;
  }
}

// ── WebSocket dispatch ──────────────────────────────────────────────────────────
async function onWsMessage(
  ctx: { id: string; userId?: string; sessionId?: string; workspaceId: string },
  raw: any,
  reply: (data: unknown) => void
) {
  let msg: any;
  try {
    msg = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return;
  }
  const type: string = msg?.type;
  if (type === "pong") return markPong(ctx.id);

  // ── client → server ──
  if (type === "client.message" && ctx.sessionId) {
    const session = await prisma.chatSession.findUnique({ where: { id: ctx.sessionId } });
    if (!session || session.status === "closed") return;
    await persistAndBroadcast({
      sessionId: ctx.sessionId,
      sender: "client",
      type: msg.media_key ? msg.media_type ?? "file" : "text",
      text: msg.text ?? null,
      senderName: session.clientName ?? null,
      mediaKey: msg.media_key ?? null,
      mediaMime: msg.media_mime ?? null,
      mediaName: msg.media_name ?? null,
      replyToId: msg.reply_to_id ?? null,
    });
    if (session.status !== "active") await handleInboundClient(ctx.sessionId, msg.text ?? "");
    return;
  }
  if (type === "client.typing" && ctx.sessionId) {
    return sendToSession(ctx.sessionId, { type: "typing", who: "client", session_id: ctx.sessionId }, "attendant");
  }
  if (type === "client.read" && ctx.sessionId) {
    // Client has read up to now → record it and tell the attendant (blue checks).
    const at = new Date();
    await prisma.chatSession.update({ where: { id: ctx.sessionId }, data: { clientLastReadAt: at } }).catch(() => {});
    return sendToSession(
      ctx.sessionId,
      { type: "read.receipt", who: "client", session_id: ctx.sessionId, at: at.toISOString() },
      "attendant"
    );
  }
  if (type === "client.edit" && ctx.sessionId && msg.message_id) {
    const result = await editMessage(msg.message_id, msg.text ?? "", { kind: "client", sessionId: ctx.sessionId });
    if (!result.ok) reply({ type: "error", action: "message.edit", message_id: msg.message_id, detail: result.reason });
    return;
  }
  if (type === "client.delete" && ctx.sessionId && msg.message_id) {
    const result = await deleteMessage(msg.message_id, { kind: "client", sessionId: ctx.sessionId });
    if (!result.ok) reply({ type: "error", action: "message.delete", message_id: msg.message_id, detail: result.reason });
    return;
  }
  if (type === "client.end" && ctx.sessionId) {
    return void closeSession(ctx.sessionId, null);
  }

  // ── attendant → server ──
  if (!ctx.userId) return;
  const sessionId: string | undefined = msg.session_id ?? ctx.sessionId;
  if (type === "agent.open" && sessionId) {
    attachSession(ctx.id, sessionId);
    return;
  }
  if (type === "agent.assign" && sessionId) {
    attachSession(ctx.id, sessionId);
    await assignSessionToAttendant(sessionId, ctx.userId);
    return;
  }
  if (type === "agent.message" && sessionId) {
    const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!session) return;
    await deliverOutbound(session as any, {
      sender: "attendant",
      type: msg.media_key ? msg.media_type ?? "file" : "text",
      text: msg.text ?? null,
      senderUserId: ctx.userId,
      mediaKey: msg.media_key ?? null,
      mediaMime: msg.media_mime ?? null,
      mediaName: msg.media_name ?? null,
      replyToId: msg.reply_to_id ?? null,
    });
    return;
  }
  if (type === "agent.typing" && sessionId) {
    return sendToSession(sessionId, { type: "typing", who: "attendant", session_id: sessionId });
  }
  if (type === "agent.edit" && msg.message_id) {
    const result = await editMessage(msg.message_id, msg.text ?? "", { kind: "attendant", userId: ctx.userId });
    if (!result.ok) reply({ type: "error", action: "message.edit", message_id: msg.message_id, detail: result.reason });
    return;
  }
  if (type === "agent.delete" && msg.message_id) {
    const result = await deleteMessage(msg.message_id, { kind: "attendant", userId: ctx.userId });
    if (!result.ok) reply({ type: "error", action: "message.delete", message_id: msg.message_id, detail: result.reason });
    return;
  }
  if (type === "agent.read" && sessionId) {
    await prisma.chatReadState.upsert({
      where: { sessionId_userId: { sessionId, userId: ctx.userId } },
      create: { sessionId, userId: ctx.userId, lastReadAt: new Date(), lastReadMessageId: msg.last_message_id ?? null },
      update: { lastReadAt: new Date(), lastReadMessageId: msg.last_message_id ?? null },
    });
    return;
  }
  if (type === "agent.close" && sessionId) {
    // O encerramento pode trazer a classificação e o cadastro feitos na hora:
    // para qual sistema era o suporte e quem é o Responsável do cliente.
    return void (async () => {
      await registrarEncerramento(
        sessionId,
        { project_id: msg.project_id ?? null, contact: msg.contact ?? null },
        ctx.userId
      ).catch((e) => console.error("[agent.close] falha ao gravar classificação/cadastro", e));
      await closeSession(sessionId, ctx.userId);
    })();
  }
}

// ── App ─────────────────────────────────────────────────────────────────────────
/**
 * Uma falha solta não pode derrubar o atendimento inteiro.
 *
 * O Bun encerra o processo numa rejeição não capturada. Bastou um timer tentar
 * encerrar uma sessão que já não existia para o chat sair do ar para todo mundo
 * — 502 em cima de conversas em andamento. Aqui o erro é registrado com o
 * contexto e o servidor continua de pé; a causa específica se corrige onde ela
 * está, mas o processo não morre por causa dela.
 */
for (const evento of ["unhandledRejection", "uncaughtException"] as const) {
  process.on(evento, (erro: unknown) => {
    console.error(`[${evento}] o chat seguiu no ar apesar de:`, erro);
  });
}

const app = new Elysia()
  .use(cors({ origin: true, credentials: true }))
  .onError(({ error, set }) => {
    const status = (error as any)?.status;
    if (status) {
      set.status = status;
      return { detail: (error as any).message };
    }
    set.status = 500;
    console.error("[chat-error]", error);
    return { detail: "Erro interno do servidor." };
  })

  .get("/health/", () => ({ status: "ok" }))

  // ── WS ticket: REST call that issues a 2-minute token for WS auth ────────
  // Browsers can't reliably set custom headers on WS connections, and Bun's WS
  // upgrade path may not expose cookies the same way HTTP routes do. So the
  // attendant UI fetches a short-lived ticket via this REST endpoint (which
  // works fine with the Plane cookie) and passes it as ?ticket= on the WS URL.
  .get("/workspaces/:slug/ws-ticket/", async ({ params: { slug }, headers, set }) => {
    const user = await resolveAttendant(headers);
    if (!user) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    const ticket = await signWsTicket(user.id, slug);
    return { ticket };
  })

  // Embeddable client page (iframe-friendly).
  .get("/client", ({ set }) => {
    set.headers["Content-Type"] = "text/html; charset=utf-8";
    // Allow embedding anywhere (iframe/embed).
    set.headers["Content-Security-Policy"] = "frame-ancestors *";
    return clientPage();
  })

  // ── Client (native widget): resolve an already-open session for this browser ──
  // Lets the widget skip the pre-chat form on reload / return visits.
  .get("/sessions/active/", async ({ query }) => {
    const q = (query as any) ?? {};
    if (!q.workspace || !q.browser_id) return { session: null };
    const session = await prisma.chatSession.findFirst({
      where: { workspaceId: q.workspace, clientBrowserId: q.browser_id, status: { not: "closed" } },
      orderBy: { createdAt: "desc" },
    });
    if (!session) return { session: null };
    const token = await signClientToken(session.id, q.browser_id);
    return { token, browser_id: q.browser_id, session: serializeSession(session) };
  })

  // ── Public (token-less) lookups for the native pre-chat form ──
  // The "system" the client needs help with is a Plane project (e.g. SIART). The
  // widget can also be deep-linked with ?system=<identifier> / ?attendant=<id>.
  .get("/workspaces/:slug/public/projects/", async ({ params: { slug } }) => {
    try {
      const rows = (await prisma.$queryRaw`
        SELECT p.id::text AS id, p.identifier, p.name
        FROM projects p JOIN workspaces w ON w.id = p.workspace_id
        WHERE w.slug = ${slug} AND p.deleted_at IS NULL
        ORDER BY p.name ASC`) as Array<{ id: string; identifier: string; name: string }>;
      return { results: rows };
    } catch (e) {
      console.error("[public/projects]", e);
      return { results: [] };
    }
  })
  .get("/workspaces/:slug/public/attendants/", async ({ params: { slug } }) => {
    let members: Array<{ id: string; name: string }> = [];
    try {
      members = (await prisma.$queryRaw`
        SELECT u.id::text AS id,
               COALESCE(NULLIF(u.display_name, ''), NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email) AS name
        FROM workspace_members wm
        JOIN workspaces w ON w.id = wm.workspace_id
        JOIN users u ON u.id = wm.member_id
        WHERE w.slug = ${slug} AND wm.deleted_at IS NULL AND wm.is_active = true
          AND wm.role >= 15
        ORDER BY name ASC`) as Array<{ id: string; name: string }>;
    } catch (e) {
      console.error("[public/attendants]", e);
    }
    const onlineIds = new Set(await availableAttendants(slug, members.map((m) => m.id)));
    return {
      results: members.map((m) => ({ user_id: m.id, name: m.name ?? "Atendente", online: onlineIds.has(m.id) })),
    };
  })

  // ── Client: start a session ──
  .post("/sessions/", async ({ body, set }) => {
    const b = (body as any) ?? {};
    if (!b.workspace_id) {
      set.status = 400;
      return { detail: "workspace_id é obrigatório." };
    }
    const browserId = b.browser_id || randomUUID();

    // Reuse an open session for this browser (reload returns to the same chat).
    let session = await prisma.chatSession.findFirst({
      where: { workspaceId: b.workspace_id, clientBrowserId: browserId, status: { not: "closed" } },
      orderBy: { createdAt: "desc" },
    });
    if (!session) {
      // Resolve the chosen "system" → a Plane project (by id or identifier).
      const project = await resolveProject(b.workspace_id, b.project_id, b.system);
      const requestedAttendantId = b.attendant_id ? String(b.attendant_id) : null;
      const protocol = await nextProtocol(b.workspace_id);
      session = await prisma.chatSession.create({
        data: {
          workspaceId: b.workspace_id,
          channel: "native",
          clientBrowserId: browserId,
          clientName: (b.name ? String(b.name).slice(0, 120) : null) || null,
          projectId: project?.id ?? null,
          projectIdentifier: project?.identifier ?? null,
          projectName: project?.name ?? null,
          requestedAttendantId,
          protocol,
          status: "bot",
          botState: "done",
        },
      });
      // Native pre-chat: greet + route directly to the chosen attendant or queue.
      startNativeSession(session.id, { attendantId: requestedAttendantId }).catch((e) => console.error("[startNativeSession]", e));
    }

    const token = await signClientToken(session.id, browserId);
    set.status = 201;
    return { token, browser_id: browserId, session: serializeSession(session) };
  })

  // ── History (no-reload load); client (token) or attendant (cookie) ──
  .get("/sessions/:id/messages/", async ({ params: { id }, query, headers }) => {
    const role = await authorizeSessionAccess(id, query, headers as any);
    if (!role) return new Response(JSON.stringify({ detail: "Acesso negado." }), { status: 403 });
    const full = role === "attendant"; // staff see deleted originals + edit history
    const messages = await prisma.chatMessage.findMany({ where: { sessionId: id }, orderBy: { createdAt: "asc" } });
    const session = await prisma.chatSession.findUnique({ where: { id }, include: { contact: true } });
    return { session: session ? serializeSession(session) : null, results: messages.map((m) => serializeMessage(m, { full })) };
  })

  // ── Read-only public view of a chat (for the editor chat-embed link) ──
  .get("/sessions/by-protocol/:protocol/", async ({ params: { protocol }, headers }) => {
    const session = await prisma.chatSession.findUnique({ where: { protocol }, include: { contact: true } });
    if (!session) return new Response(JSON.stringify({ detail: "Não encontrado." }), { status: 404 });
    const messages = await prisma.chatMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } });
    // LGPD: abrir a transcrição é acesso ao conteúdo da conversa do cliente.
    const viewer = await resolveAttendant(headers);
    recordChatAudit({
      workspaceSlug: session.workspaceId,
      sessionId: session.id,
      action: CHAT_AUDIT_ACTIONS.VIEW,
      userId: viewer?.id ?? null,
      headers,
      metadata: { protocolo: session.protocol, canal: session.channel, mensagens: messages.length },
    });
    // Staff transcript (shared via copy-link): show deleted originals + history.
    return { session: serializeSession(session), results: messages.map((m) => serializeMessage(m, { full: true })) };
  })

  // ── Attendant: list sessions for a workspace ──
  .get("/workspaces/:slug/sessions/", async ({ params: { slug }, query, headers, set }) => {
    const user = await resolveAttendant(headers as any);
    if (!user) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    const status = (query as any).status as string | undefined;

    // Role-based visibility:
    //   ONLY workspace admins (role >= 20) see the bot + queue and unassigned chats.
    //   Everyone else (managers included) sees ONLY chats assigned to them and never
    //   anything still in "bot" or "queued".
    let role = 20;
    try {
      const rows = (await prisma.$queryRaw`
        SELECT wm.role FROM workspace_members wm
        JOIN workspaces w ON w.id = wm.workspace_id
        WHERE w.slug = ${slug} AND wm.member_id::text = ${user.id}
          AND wm.deleted_at IS NULL AND wm.is_active = true
        LIMIT 1`) as Array<{ role: number }>;
      role = Number(rows[0]?.role ?? 0);
    } catch { role = 20; } // DB unavailable → allow all (degenerate case)
    const isAdmin = role >= 20;

    const requested = status ? status.split(",") : null;
    // A aba de encerrados mostra só o DIA CORRENTE: com o histórico do SAC são
    // mais de cem mil conversas, e a lista virava um paredão onde o atendimento
    // recém-fechado se perdia. Busca escrita ignora o recorte, para continuar
    // achando protocolo antigo.
    const busca = String((query as any).q ?? "").trim();
    // Vale para QUALQUER consulta sem busca, não só para a aba de encerrados: a
    // listagem traz no máximo 200 ordenadas por status, e "queued" vem depois de
    // "closed" no alfabeto. Com cem mil encerradas, as conversas EM FILA eram
    // empurradas para fora e a aba "Na fila" podia aparecer vazia com gente
    // esperando.
    const desde = busca ? null : await inicioDoDiaNoFuso(slug);
    const recorteDeHoje = desde
      ? { OR: [{ status: { not: "closed" } }, { status: "closed", closedAt: { gte: desde } }] }
      : {};
    const recorteDaBusca = busca
      ? {
          OR: [
            { protocol: { contains: busca, mode: "insensitive" as const } },
            { clientName: { contains: busca, mode: "insensitive" as const } },
            { clientPhone: { contains: busca } },
          ],
        }
      : {};
    let whereFilter: any;
    if (isAdmin) {
      whereFilter = { workspaceId: slug, ...(requested ? { status: { in: requested } } : {}), ...recorteDeHoje, ...recorteDaBusca };
    } else {
      // Own chats only; bot/queued are never visible to non-admins.
      const allowed = (requested ?? []).filter((s) => s !== "bot" && s !== "queued");
      whereFilter = {
        workspaceId: slug,
        assignedAttendantId: user.id,
        status: requested ? { in: allowed } : { notIn: ["bot", "queued"] },
        ...recorteDeHoje,
        ...recorteDaBusca,
      };
    }

    const sessions = await prisma.chatSession.findMany({
      where: whereFilter,
      include: { contact: true },
      // `nulls: "last"` é o que faz a aba Encerrados mostrar o que acabou de ser
      // encerrado. Sem isso o Postgres põe NULO primeiro na ordem decrescente, e
      // as 13.202 conversas migradas do SAC sem `lastClientMessageAt` ocupavam as
      // 200 vagas: quem encerrasse um atendimento não o encontrava mais.
      orderBy: [
        { status: "asc" },
        { lastClientMessageAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: 200,
    });
    // unread counts for this attendant
    const reads = await prisma.chatReadState.findMany({ where: { userId: user.id, sessionId: { in: sessions.map((s) => s.id) } } });
    const readMap = new Map(reads.map((r) => [r.sessionId, r.lastReadAt]));
    const results = await Promise.all(
      sessions.map(async (s) => {
        const since = readMap.get(s.id);
        const [unread, last] = await Promise.all([
          prisma.chatMessage.count({
            where: { sessionId: s.id, sender: { in: ["client"] }, ...(since ? { createdAt: { gt: since } } : {}) },
          }),
          prisma.chatMessage.findFirst({ where: { sessionId: s.id, deletedAt: null }, orderBy: { createdAt: "desc" }, select: { text: true, type: true, sender: true, createdAt: true } }),
        ]);
        const preview = last ? (last.text || (last.type === "image" ? "📷 Imagem" : last.type === "audio" ? "🎤 Áudio" : last.type === "video" ? "🎬 Vídeo" : last.type === "file" ? "📎 Arquivo" : "")) : "";
        return { ...serializeSession(s), unread, last_message: preview, last_message_at: last?.createdAt ?? s.lastClientMessageAt ?? s.createdAt };
      })
    );
    return { results };
  })

  // ── Admin dashboard: attendant activity + totals ──
  .get("/workspaces/:slug/dashboard/", async ({ params: { slug }, headers, set }) => {
    const user = await resolveAttendant(headers);
    if (!user) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [active, queued, bot, closedToday, activeByAttendant, todayByAttendant] = await Promise.all([
      prisma.chatSession.count({ where: { workspaceId: slug, status: "active" } }),
      prisma.chatSession.count({ where: { workspaceId: slug, status: "queued" } }),
      prisma.chatSession.count({ where: { workspaceId: slug, status: "bot" } }),
      prisma.chatSession.count({ where: { workspaceId: slug, status: "closed", closedAt: { gte: startOfToday } } }),
      prisma.chatSession.groupBy({ by: ["assignedAttendantId"], where: { workspaceId: slug, status: "active", assignedAttendantId: { not: null } }, _count: { _all: true } }),
      prisma.chatSession.groupBy({ by: ["assignedAttendantId"], where: { workspaceId: slug, assignedAttendantId: { not: null }, createdAt: { gte: startOfToday } }, _count: { _all: true } }),
    ]);

    let invisibleRows: Array<{ userId: string }> = [];
    try { invisibleRows = await (prisma as any).attendantStatus.findMany({ where: { workspaceId: slug, isInvisible: true }, select: { userId: true } }); } catch { }

    const online = Array.from(connectedUserIds(slug));
    const invisible = new Set(invisibleRows.map((r: any) => r.userId));
    const activeMap = new Map(activeByAttendant.map((g) => [g.assignedAttendantId as string, g._count._all]));
    const todayMap = new Map(todayByAttendant.map((g) => [g.assignedAttendantId as string, g._count._all]));
    const userIds = new Set<string>([...online, ...activeMap.keys(), ...todayMap.keys(), ...invisible]);

    const attendants = Array.from(userIds).map((userId) => ({
      user_id: userId,
      online: online.includes(userId),
      invisible: invisible.has(userId),
      active_chats: activeMap.get(userId) ?? 0,
      today_chats: todayMap.get(userId) ?? 0,
    }));

    return { totals: { active, queued, bot, closed_today: closedToday }, online, attendants };
  })

  // ── Reports: attendant ratings + ranking (admin/manager only) ──
  .get("/workspaces/:slug/reports/ratings/", async ({ params: { slug }, headers, set }) => {
    const user = await resolveAttendant(headers);
    if (!user) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    if (!(await isWorkspaceManager(slug, user.id))) {
      set.status = 403;
      return { detail: "Apenas administradores ou gestores." };
    }
    return ratingsReport(slug);
  })

  // ── Reports: SLA (first-response / resolution times) ──
  .get("/workspaces/:slug/reports/sla/", async ({ params: { slug }, query, headers, set }) => {
    const user = await resolveAttendant(headers);
    if (!user) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    if (!(await isWorkspaceManager(slug, user.id))) {
      set.status = 403;
      return { detail: "Apenas administradores ou gestores." };
    }
    const days = Math.min(365, Math.max(1, Number((query as any)?.days) || 30));
    return slaReport(slug, days);
  })

  // ── Attendant: start a new WhatsApp chat from a contact ──
  .post("/workspaces/:slug/sessions/whatsapp/", async ({ params: { slug }, body, headers, set }) => {
    const user = await resolveAttendant(headers as any);
    if (!user) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    const b = (body as any) ?? {};
    const contact = await prisma.contact.findFirst({ where: { workspaceId: slug, id: b.contact_id } });
    if (!contact?.phone) {
      set.status = 400;
      return { detail: "Contato sem telefone." };
    }
    const protocol = await nextProtocol(slug);
    const session = await prisma.chatSession.create({
      data: {
        workspaceId: slug,
        channel: "whatsapp",
        contactId: contact.id,
        clientName: contact.name,
        clientPhone: contact.phone,
        protocol,
        status: "active",
        assignedAttendantId: user.id,
        botState: "done",
      },
    });
    if (b.message) {
      await deliverOutbound(session as any, { sender: "attendant", type: "text", text: b.message, senderUserId: user.id });
    }
    return serializeSession(session);
  })

  // ── Attendants of a workspace (for the transfer picker) ──
  // Transfer targets are restricted to admins / project managers (role >= 15),
  // matching who is allowed to perform the transfer.
  .get("/workspaces/:slug/attendants/", async ({ params: { slug }, headers, set }) => {
    const user = await resolveAttendant(headers);
    if (!user) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    let members: Array<{ id: string; name: string }> = [];
    try {
      const rows = (await prisma.$queryRaw`
        SELECT u.id::text AS id,
               COALESCE(NULLIF(u.display_name, ''), NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email) AS name
        FROM workspace_members wm
        JOIN workspaces w ON w.id = wm.workspace_id
        JOIN users u ON u.id = wm.member_id
        WHERE w.slug = ${slug} AND wm.deleted_at IS NULL AND wm.is_active = true
          AND wm.role >= 15
        ORDER BY name ASC`) as Array<{ id: string; name: string }>;
      members = rows;
    } catch (e) {
      console.error("[attendants]", e);
    }
    const online = new Set(connectedUserIds(slug));
    return {
      results: members.map((m) => ({ user_id: m.id, name: m.name ?? "Atendente", online: online.has(m.id) })),
    };
  })

  // ── Transfer a session to another attendant (admin/manager only) ──
  .post("/workspaces/:slug/sessions/:id/transfer/", async ({ params: { slug, id }, body, headers, set }) => {
    const user = await resolveAttendant(headers);
    if (!user) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    // Only admins / project managers (workspace role >= 15) may transfer.
    let isManager = false;
    try {
      const rows = (await prisma.$queryRaw`
        SELECT wm.role FROM workspace_members wm
        JOIN workspaces w ON w.id = wm.workspace_id
        WHERE w.slug = ${slug} AND wm.member_id::text = ${user.id}
          AND wm.deleted_at IS NULL AND wm.is_active = true
        LIMIT 1`) as Array<{ role: number }>;
      isManager = Number(rows[0]?.role ?? 0) >= 15;
    } catch { isManager = false; }
    if (!isManager) {
      set.status = 403;
      return { detail: "Apenas administradores ou gestores podem transferir atendimentos." };
    }

    const toUserId = String((body as any)?.to_user_id ?? "");
    if (!toUserId) {
      set.status = 400;
      return { detail: "to_user_id é obrigatório." };
    }
    const session = await prisma.chatSession.findFirst({ where: { id, workspaceId: slug } });
    if (!session) {
      set.status = 404;
      return { detail: "Atendimento não encontrado." };
    }

    const updated = await prisma.chatSession.update({
      where: { id },
      data: { assignedAttendantId: toUserId, status: "active" },
    });
    const toName = await attendantName(toUserId);

    // Internal trail (visible to attendants) + a friendly note to the client.
    await persistAndBroadcast({ sessionId: id, sender: "system", type: "event", text: `Atendimento transferido para ${toName}.` });
    await deliverOutbound(updated as any, {
      sender: "system",
      type: "event",
      text: `Você foi transferido(a) para o atendente ${toName}, que dará continuidade ao seu atendimento.`,
    });

    // Let the target attendant (and the whole workspace) know live.
    sendToUser(toUserId, { type: "session.transferred", session_id: id, to_user_id: toUserId });
    sendToWorkspace(slug, { type: "session.activity", session_id: id });
    sendToSession(id, { type: "session.assigned", session_id: id, attendant_id: toUserId });

    return serializeSession(updated);
  })

  // ── Media upload / serve ──
  .post("/sessions/:id/upload/", async ({ params: { id }, request, set }) => {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      set.status = 400;
      return { detail: "file é obrigatório." };
    }
    const key = `${id}/${randomUUID()}`;
    await saveMedia(key, file);
    return { media_key: key, media_mime: (file as File).type, media_name: (file as File).name };
  })
  .get("/media/*", async ({ params, query }) => {
    const key = (params as any)["*"];
    const res = await serveMedia(key, (query as any).mime);
    return res ?? new Response("Não encontrado", { status: 404 });
  })

  // ── Rating: native client form submits its score + comment here ──
  .post("/sessions/:id/rate/", async ({ params: { id }, query, headers, body, set }) => {
    const authed = await authorizeSessionAccess(id, query, headers as any);
    if (!authed) {
      set.status = 403;
      return { detail: "Acesso negado." };
    }
    const b = (body as any) ?? {};
    const score = Number(b.score);
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      set.status = 400;
      return { detail: "A nota deve estar entre 1 e 5." };
    }
    const session = await submitRating(id, score, b.comment ?? null);
    return { ok: true, rating_score: session.ratingScore, rating_comment: session.ratingComment };
  })

  // ── Random dog (delightful little touch for the rating screen) ──
  .get("/random-dog/", async () => (await randomDog()) ?? { url: null })

  // ── Z-API webhook ──
  .post("/providers/zapi/webhook/:slug/", async ({ params: { slug }, body }) => {
    const resolved = await getProvider(slug);
    if (!resolved) return { ok: true };

    // Edição/remoção feita pelo cliente no WhatsApp: aplica na mensagem existente
    // (não cria mensagem nova) e propaga aos sockets.
    const mutation = resolved.provider.parseWebhookMutation(body);
    if (mutation) {
      if (mutation.kind === "edit") await applyProviderMutation(mutation.externalId, { text: mutation.text });
      else for (const id of mutation.externalIds) await applyProviderMutation(id, { deleted: true });
      return { ok: true };
    }

    const inbound = resolved.provider.parseWebhook(body);
    if (!inbound) return { ok: true };

    // dedup
    if (inbound.externalId) {
      const dup = await prisma.chatMessage.findFirst({ where: { externalId: inbound.externalId } });
      if (dup) return { ok: true };
    }

    // find/create contact + open session by phone
    let contact = await prisma.contact.findFirst({ where: { workspaceId: slug, phone: inbound.phone } });
    if (!contact) contact = await prisma.contact.create({ data: { workspaceId: slug, phone: inbound.phone, name: inbound.senderName ?? null } });

    // Match an open session, OR a just-closed one still awaiting a satisfaction
    // rating (so the client's "5"/comment reply continues the survey instead of
    // spawning a fresh bot conversation).
    let session = await prisma.chatSession.findFirst({
      where: {
        workspaceId: slug,
        clientPhone: inbound.phone,
        OR: [
          { status: { not: "closed" } },
          { status: "closed", ratingState: { in: ["awaiting_score", "awaiting_comment"] } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    let isNew = false;
    if (!session) {
      isNew = true;
      const protocol = await nextProtocol(slug);
      session = await prisma.chatSession.create({
        data: {
          workspaceId: slug,
          channel: "whatsapp",
          contactId: contact.id,
          clientPhone: inbound.phone,
          clientName: contact.name,
          protocol,
          status: "bot",
          botState: "new",
        },
      });
    }

    await persistAndBroadcast({
      sessionId: session.id,
      sender: "client",
      type: inbound.type,
      text: inbound.text ?? null,
      senderName: inbound.senderName ?? contact.name ?? null,
      mediaMime: inbound.mediaMime ?? null,
      mediaName: inbound.mediaName ?? null,
      externalId: inbound.externalId ?? null,
      // Note: WhatsApp media URLs are external; the attendant UI renders them directly.
      mediaKey: inbound.mediaUrl ? `ext:${inbound.mediaUrl}` : null,
    });
    // A closed session awaiting a satisfaction rating: feed the reply to the
    // survey state machine instead of restarting the bot.
    if (session.status === "closed" && session.ratingState && session.ratingState !== "done") {
      await handleRatingReply(session, inbound.text ?? "");
      return { ok: true };
    }
    if (session.status !== "active") {
      if (isNew) await startBot(session.id);
      else await handleInboundClient(session.id, inbound.text ?? "");
    }
    return { ok: true };
  })

  // ── Config & registries (bot, menu, flows, queues, schedules, contacts, provider) ──
  .use(configModule)

  // ── WebSocket hub ──
  .ws("/ws", {
    // IMPORTANT: Bun does NOT await an async `open` before delivering messages,
    // so any message that arrives during auth would be dropped (ctx undefined).
    // We kick off auth+register as a promise assigned synchronously, and every
    // `message`/`close` awaits it — so nothing is processed before the socket is
    // registered (this is why agent.open/assign were being silently lost).
    open(ws) {
      // Extract query params robustly — try every possible location Elysia/Bun
      // might put them depending on the runtime version.
      const data: any = ws.data ?? {};

      // 1. Try the raw Request URL (most reliable in Bun/Elysia 1.4)
      const rawUrl: string =
        data?.request?.url ??
        (ws as any)?.request?.url ??
        data?.url ??
        "";

      const qs = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1) : "";
      const urlParams = new URLSearchParams(qs);
      const q: Record<string, string> = {};
      for (const [k, v] of urlParams) q[k] = v;

      // 2. Merge ws.data.query (populated when Elysia parses with schema)
      const ctxQuery = data.query ?? {};
      for (const [k, v] of Object.entries(ctxQuery)) {
        if (!(k in q) && v != null) q[k] = String(v);
      }

      // Log so we can see exactly what's received in container logs
      console.log(`[ws open] rawUrl="${rawUrl}" qs="${qs}" q=${JSON.stringify(q)}`);

      const headers = data.headers ?? {};
      const id = (ws as any).id ?? randomUUID();

      (ws.data as any).ctxPromise = (async () => {
        // Client connection: ?token=<clientToken>
        if (q.token && !q.workspace) {
          const claims = await verifyClientToken(q.token);
          if (!claims) {
            console.warn("[ws] client token invalid, closing");
            ws.close();
            return null;
          }
          const session = await prisma.chatSession.findUnique({ where: { id: claims.sessionId } });
          if (!session) {
            console.warn("[ws] client session not found, closing");
            ws.close();
            return null;
          }
          const ctx = { id, sessionId: session.id, workspaceId: session.workspaceId };
          register({ id, kind: "client", workspaceId: session.workspaceId, sessionId: session.id, send: (d) => ws.send(d), alive: true, lastPongAt: Date.now() });
          ws.send({ type: "ready", session_id: session.id, protocol: session.protocol, status: session.status });
          return ctx;
        }

        // Attendant connection: ?workspace=<slug>&ticket=<wsTicket>
        // Primary: verify the short-lived WS ticket issued by /ws-ticket/.
        // Fallback: cookie/Authorization header (for local/dev environments).
        const workspaceId = q.workspace;
        if (!workspaceId) {
          console.warn("[ws] no workspace param, closing");
          ws.close();
          return null;
        }
        let userId: string | null = null;
        if (q.ticket) {
          const claims = await verifyWsTicket(q.ticket);
          if (claims && claims.workspaceId === workspaceId) {
            userId = claims.userId;
          } else {
            console.warn("[ws] ticket invalid or workspace mismatch", { workspaceId, claimsWid: claims?.workspaceId });
          }
        }
        if (!userId) {
          const user = await resolveAttendant(headers);
          userId = user?.id ?? null;
          if (!userId) console.warn("[ws] cookie/header auth also failed, closing");
        }
        if (!userId) {
          ws.close();
          return null;
        }
        const ctx = { id, userId, workspaceId };
        register({ id, kind: "attendant", workspaceId, userId, send: (d) => ws.send(d), alive: true, lastPongAt: Date.now() });
        emitPresence(workspaceId);
        drainQueuesForWorkspace(workspaceId).catch(() => {});
        ws.send({ type: "ready", user_id: userId });
        console.log(`[ws] attendant connected uid=${userId} workspace=${workspaceId}`);
        return ctx;
      })().catch((e) => {
        console.error("[ws open]", e);
        return null;
      });
    },
    async message(ws, raw) {
      const ctx = await (ws.data as any).ctxPromise;
      if (!ctx) return;
      await onWsMessage(ctx, raw, (d) => ws.send(d)).catch((e) => console.error("[ws]", e));
    },
    async close(ws) {
      const ctx = await ((ws.data as any).ctxPromise ?? Promise.resolve(null));
      if (ctx) unregister(ctx.id);
    },
  })

  .listen(PORT);

startHeartbeat();
startTimers();
console.log(`💬 chat-backend listening on :${PORT}`);

// ── auth helper for history endpoint ──
async function authorizeSessionAccess(
  sessionId: string,
  query: any,
  headers: Record<string, string | undefined>
): Promise<"client" | "attendant" | null> {
  if (query?.token) {
    const claims = await verifyClientToken(query.token);
    if (claims?.sessionId === sessionId) return "client";
  }
  const user = await resolveAttendant(headers);
  return user ? "attendant" : null;
}

export type App = typeof app;
