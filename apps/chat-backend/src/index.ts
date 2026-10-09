import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { randomUUID } from "crypto";
import prisma from "@db";
import { resolveAttendant, signClientToken, verifyClientToken, signWsTicket, verifyWsTicket } from "@/auth";
import { nextProtocol } from "@/protocol";
import { handleInboundClient, startNativeSession } from "@/bot/engine";
import { EncerramentoError, closeWithEncerramento } from "@/encerramento";
import { CAUSA_DO_FIM } from "@/ciclo-de-vida/abandono";
import { closeAtendimento } from "@/ciclo-de-vida/encerrar";
import { handleRespostaDeInatividade } from "@/ciclo-de-vida/inatividade";
import { resumeAtendimento } from "@/ciclo-de-vida/pausa";
import { cicloDeVidaModule } from "@/ciclo-de-vida/rotas";
import { relatoriosModule } from "@/relatorios/rotas";
import { zapiWebhookModule } from "@/webhook/zapi";
import { inicioDoDiaNoFuso } from "@/presence";
import { deliverOutbound } from "@/outbound";
import { persistAndBroadcast, serializeMessage } from "@/messages";
import { deleteMessage, editMessage } from "@/message-actions";
import { drainQueuesForWorkspace, assignSessionToAttendant } from "@/queue/router";
import { saveMedia, serveMedia } from "@/storage";
import { startTimers } from "@/timers";
import { submitRating, randomDog } from "@/rating";
import { attendantName } from "@/users";
import { nomeDoCliente } from "@/aviso-do-atendente";
import { CHAT_ACTION, hasChatAction, listAtendentes } from "@/permissoes";
import { applyVisaoDaAvaliacao, serializeSession } from "@/sessoes";
import { authorizeChat, isNegado } from "@/acesso";
import { SO_O_CLIENTE_AVALIA, authorizeSessaoPorId, authorizeTranscricao, isClienteDaSessao } from "@/acesso-a-sessao";
import { buildAvisosDaTransferencia } from "@/transferencia";
import { buildFiltroDaVisibilidade } from "@/visibilidade";
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
import { ligacoesModule } from "@/ligacoes/routes";
import { destinosModule } from "@/bot/acao/rotas";
import { disparoModule } from "@/disparo/routes";
import { startDisparoWorker } from "@/disparo/worker";
import { parseChannelFilter } from "@/canais";
import { atendenteModule } from "@/atendente/rotas";
import { painelModule } from "@/painel/rotas";
import { mergeClientInfo, parseClientInfo } from "@/atendente/client-info";

const PORT = Number(process.env.CHAT_PORT ?? 8002);

// ── helpers ───────────────────────────────────────────────────────────────────
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

/**
 * Depois de gravar a mensagem do cliente do site: em atendimento, pode ser a
 * resposta à pergunta de inatividade; em pausa, retoma. Nos demais, é o robô.
 */
const SEGUIMENTO_DO_CLIENTE: Record<string, (sessionId: string, texto: string) => Promise<unknown>> = {
  active: handleRespostaDeInatividade,
  paused: (sessionId) => resumeAtendimento(sessionId),
};

const SEM_PERMISSAO_PARA_ENCERRAR = "Você não tem permissão para encerrar atendimentos. Peça ao administrador.";

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
    await (SEGUIMENTO_DO_CLIENTE[session.status] ?? handleInboundClient)(ctx.sessionId, msg.text ?? "");
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
    return void closeAtendimento({ sessionId: ctx.sessionId, causa: CAUSA_DO_FIM.CLIENTE_SAIU });
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
      // "Enviar sem o nome" (src/atendente/whatsapp-texto.ts): desligado por padrão.
      withoutSenderName: msg.without_sender_name === true,
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
    // Mesma ação do `POST .../close/` (`chat.encerrar`); sem entidade, não encerra e o atendente é avisado.
    if (!(await hasChatAction(ctx.workspaceId, ctx.userId, CHAT_ACTION.ENCERRAR)))
      return reply({ type: "error", action: "session.close", session_id: sessionId, detail: SEM_PERMISSAO_PARA_ENCERRAR });
    return void closeWithEncerramento(sessionId, msg, ctx.userId).catch((e) =>
      reply({ type: "error", action: "session.close", session_id: sessionId, detail: e instanceof EncerramentoError ? e.message : "Não foi possível encerrar." })
    );
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
    // Só conecta como atendente quem atende neste espaço. Antes qualquer conta do
    // Plane pedia ticket para qualquer slug e entrava na sala do atendimento.
    if (!(await hasChatAction(slug, user.id, CHAT_ACTION.ATENDER))) {
      set.status = 403;
      return { detail: "Você não atende no chat deste espaço de trabalho." };
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
  // widget can also be deep-linked with ?system=<identifier>.
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
  // ── Client: start a session ──
  .post("/sessions/", async ({ body, set }) => {
    const b = (body as any) ?? {};
    if (!b.workspace_id) {
      set.status = 400;
      return { detail: "workspace_id é obrigatório." };
    }
    const browserId = b.browser_id || randomUUID();

    // Dados técnicos que o sistema que embute o widget mandou (versão, computador...).
    const clientInfo = parseClientInfo(b.client_info);
    // Reuse an open session for this browser (reload returns to the same chat).
    let session = await prisma.chatSession.findFirst({
      where: { workspaceId: b.workspace_id, clientBrowserId: browserId, status: { not: "closed" } },
      orderBy: { createdAt: "desc" },
    });
    if (session && Object.keys(clientInfo).length)
      session = await prisma.chatSession.update({
        where: { id: session.id },
        data: { clientInfo: mergeClientInfo(session.clientInfo, clientInfo) },
      });
    if (!session) {
      // Resolve the chosen "system" → a Plane project (by id or identifier).
      const project = await resolveProject(b.workspace_id, b.project_id, b.system);
      const protocol = await nextProtocol();
      session = await prisma.chatSession.create({
        data: {
          workspaceId: b.workspace_id,
          channel: "native",
          clientBrowserId: browserId,
          clientName: (b.name ? String(b.name).slice(0, 120) : null) || null,
          projectId: project?.id ?? null,
          projectIdentifier: project?.identifier ?? null,
          projectName: project?.name ?? null,
          protocol,
          status: "bot",
          botState: "done",
          clientInfo,
        },
      });
      // Native pre-chat: greet + enqueue. Quem atende é a fila que decide.
      startNativeSession(session.id).catch((e) => console.error("[startNativeSession]", e));
    }

    const token = await signClientToken(session.id, browserId);
    set.status = 201;
    return { token, browser_id: browserId, session: serializeSession(session) };
  })

  // ── History (no-reload load); client (token) or attendant (cookie) ──
  // A equipe precisa atender no espaço da conversa e enxergá-la (src/acesso-a-sessao.ts).
  .get("/sessions/:id/messages/", async ({ params: { id }, query, headers, set }) => {
    const autorizada = await authorizeSessaoPorId(id, (query as any)?.token, headers);
    if (isNegado(autorizada)) {
      set.status = autorizada.status;
      return autorizada.body;
    }
    const { sessao: session, acesso } = autorizada;
    const full = acesso.papel === "attendant"; // staff see deleted originals + edit history
    const messages = await prisma.chatMessage.findMany({ where: { sessionId: id }, orderBy: { createdAt: "asc" } });
    // O cliente vê a própria avaliação (é ela que diz se o formulário já foi
    // respondido); do lado da equipe, quem tem `chat.ver_avaliacao`.
    const canVerAvaliacao = acesso.papel === "client" || (await hasVerAvaliacao(session.workspaceId, acesso.userId));
    return {
      session: applyVisaoDaAvaliacao(serializeSession(session), canVerAvaliacao),
      results: messages.map((m) => serializeMessage(m, { full })),
    };
  })

  // ── Read-only transcript of a chat (web `chat-view/[protocol]`) ──
  // Só a equipe que enxerga a conversa, pela mesma regra do histórico.
  .get("/sessions/by-protocol/:protocol/", async ({ params: { protocol }, headers, set }) => {
    const autorizada = await authorizeTranscricao(protocol, headers);
    if (isNegado(autorizada)) {
      set.status = autorizada.status;
      return autorizada.body;
    }
    const { sessao: session, acesso: viewer } = autorizada;
    const messages = await prisma.chatMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } });
    // LGPD: abrir a transcrição é acesso ao conteúdo da conversa do cliente.
    recordChatAudit({
      workspaceSlug: session.workspaceId,
      sessionId: session.id,
      action: CHAT_AUDIT_ACTIONS.VIEW,
      userId: viewer.userId,
      headers,
      metadata: { protocolo: session.protocol, canal: session.channel, mensagens: messages.length },
    });
    // Staff transcript (shared via copy-link): show deleted originals + history.
    const canVerAvaliacao = await hasVerAvaliacao(session.workspaceId, viewer.userId);
    return {
      session: applyVisaoDaAvaliacao(serializeSession(session), canVerAvaliacao),
      results: messages.map((m) => serializeMessage(m, { full: true })),
    };
  })

  // ── Attendant: list sessions for a workspace ──
  .get("/workspaces/:slug/sessions/", async ({ params: { slug }, query, headers, set }) => {
    const user = await resolveAttendant(headers as any);
    if (!user) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    const status = (query as any).status as string | undefined;

    // Visibilidade pela matriz (src/visibilidade.ts): as próprias sempre, as dos
    // outros com `chat.ver_todas` (inclusive as que a pessoa já transferiu), a
    // fila e o robô com `chat.ver_fila`. A avaliação do cliente, só com
    // `chat.ver_avaliacao`.
    const [verTodas, verFila, canVerAvaliacao] = await Promise.all([
      hasChatAction(slug, user.id, CHAT_ACTION.VER_TODAS),
      hasChatAction(slug, user.id, CHAT_ACTION.VER_FILA),
      hasVerAvaliacao(slug, user.id),
    ]);

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
    // `?channel=phone` (ligações) ou `?channel=whatsapp,native` (conversas).
    const filtroDeCanal = parseChannelFilter((query as any).channel);
    // Cada recorte pode trazer o próprio `OR`: juntos por `AND`, um não apaga o outro.
    const whereFilter = {
      workspaceId: slug,
      AND: [buildFiltroDaVisibilidade({ userId: user.id, verTodas, verFila }, requested), recorteDeHoje, recorteDaBusca, filtroDeCanal],
    };

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
        const serializada = applyVisaoDaAvaliacao(serializeSession(s), canVerAvaliacao);
        return { ...serializada, unread, last_message: preview, last_message_at: last?.createdAt ?? s.lastClientMessageAt ?? s.createdAt };
      })
    );
    return { results };
  })

  // ── Attendant: start a new WhatsApp chat from a contact ──
  .post("/workspaces/:slug/sessions/whatsapp/", async ({ params: { slug }, body, headers, set }) => {
    // Iniciar conversa é atender neste espaço: antes qualquer conta do Plane falava pelo número de outro espaço.
    const acesso = await authorizeChat(slug, headers, CHAT_ACTION.ATENDER);
    if (isNegado(acesso)) {
      set.status = acesso.status;
      return acesso.body;
    }
    const b = (body as any) ?? {};
    const contact = await prisma.contact.findFirst({ where: { workspaceId: slug, id: b.contact_id } });
    if (!contact?.phone) {
      set.status = 400;
      return { detail: "Contato sem telefone." };
    }
    const protocol = await nextProtocol();
    const session = await prisma.chatSession.create({
      data: {
        workspaceId: slug,
        channel: "whatsapp",
        contactId: contact.id,
        clientName: contact.name,
        clientPhone: contact.phone,
        protocol,
        status: "active",
        assignedAttendantId: acesso.userId,
        botState: "done",
      },
    });
    if (b.message) {
      await deliverOutbound(session as any, { sender: "attendant", type: "text", text: b.message, senderUserId: acesso.userId });
    }
    return serializeSession(session);
  })

  // ── Attendants of a workspace (for the transfer picker) ──
  // A lista é de quem ATENDE (papel Atendimento para cima), não de quem pode
  // transferir: quem transfere é gestor, quem recebe é a equipe de atendimento.
  .get("/workspaces/:slug/attendants/", async ({ params: { slug }, headers, set }) => {
    const user = await resolveAttendant(headers);
    if (!user) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    const members = await listAtendentes(slug);
    const online = new Set(connectedUserIds(slug));
    return {
      results: members.map((m) => ({ user_id: m.id, name: m.name ?? "Atendente", online: online.has(m.id) })),
    };
  })

  // ── Transfer a session to another attendant (chat.transferir) ──
  .post("/workspaces/:slug/sessions/:id/transfer/", async ({ params: { slug, id }, body, headers, set }) => {
    const acesso = await authorizeChat(slug, headers, CHAT_ACTION.TRANSFERIR);
    if (isNegado(acesso)) {
      set.status = acesso.status;
      return acesso.body;
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

    // Ao vivo: quem recebe ganha a conversa; quem atendia e quem transferiu a
    // tiram da lista (src/transferencia.ts). O espaço inteiro recarrega a lista.
    // A conversa leva entidade, sistema e responsável: o `update` acima só troca
    // o dono, o cadastro continua na mesma linha.
    buildAvisosDaTransferencia({
      sessionId: id,
      clientName: nomeDoCliente(updated),
      anteriorUserId: session.assignedAttendantId,
      porUserId: acesso.userId,
      paraUserId: toUserId,
    }).forEach(({ userId, payload }) => sendToUser(userId, payload));
    sendToWorkspace(slug, { type: "session.activity", session_id: id });
    sendToSession(id, { type: "session.assigned", session_id: id, attendant_id: toUserId });

    return applyVisaoDaAvaliacao(serializeSession(updated), await hasVerAvaliacao(slug, acesso.userId));
  })

  // ── Media upload / serve ──
  .post("/sessions/:id/upload/", async ({ params: { id }, query, headers, request, set }) => {
    // Mesma regra do histórico: o cliente da conversa ou a equipe que a enxerga.
    const autorizada = await authorizeSessaoPorId(id, (query as any)?.token, headers);
    if (isNegado(autorizada)) {
      set.status = autorizada.status;
      return autorizada.body;
    }
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
  // Só o cliente, pelo token da conversa: a equipe não grava nem sobrescreve a nota
  // (o atendente nem a vê sem `chat.ver_avaliacao`). O WhatsApp grava pela resposta (src/rating.ts).
  .post("/sessions/:id/rate/", async ({ params: { id }, query, body, set }) => {
    if (!(await isClienteDaSessao(id, (query as any)?.token))) {
      set.status = SO_O_CLIENTE_AVALIA.status;
      return SO_O_CLIENTE_AVALIA.body;
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

  // ── Z-API webhook (src/webhook/zapi.ts) ──
  .use(zapiWebhookModule)

  // ── Ciclo de vida: encerrar, pausar, reenviar, chamado (src/ciclo-de-vida/rotas.ts) ──
  .use(cicloDeVidaModule)

  // ── Relatórios de atendimento e registros (src/relatorios/rotas.ts) ──
  .use(relatoriosModule)

  // ── Config & registries (bot, menu, flows, queues, schedules, contacts, provider) ──
  .use(configModule)

  // ── Ligações do FreePBX (entrada do PBX, atendente, telefonia, relatório) ──
  .use(ligacoesModule)

  // ── Destinos do passo "ação" do robô (ouvidoria, currículo, e-mail) ──
  .use(destinosModule)
  // ── Disparo em massa (chat.disparo; o worker envia no ritmo configurado) ──
  .use(disparoModule)

  // ── Ferramentas do atendente e gestão: frases, chave, alerta, cadastro,
  //    feriados, gerenciador e monitor (src/atendente/rotas.ts) ──
  .use(atendenteModule)

  // ── Painel de TV do atendimento (rota interna: quem chama é o api-ts) ──
  .use(painelModule)

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
startDisparoWorker();
console.log(`💬 chat-backend listening on :${PORT}`);

/** A nota e o comentário do cliente saem só para quem tem `chat.ver_avaliacao`. */
function hasVerAvaliacao(slug: string, userId: string): Promise<boolean> {
  return hasChatAction(slug, userId, CHAT_ACTION.VER_AVALIACAO);
}

export type App = typeof app;
