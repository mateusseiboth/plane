/**
 * Histórico do chat antigo (SAC / MySQL) → chat atual (chat_sessions, chat_messages,
 * chat_contacts) no Postgres do Plane.
 *
 *   chat                    → ChatSession   (protocolo LEG-…, sempre encerrada)
 *   chat_mensagens          → ChatMessage   (autor 0/1/2 → attendant/client/bot)
 *   chat_contato            → Contact       (deduplicado por telefone)
 *   chat_mensagens_arq_zap  → mídia no storage (data URI base64 → saveMedia)
 *
 * Idempotente: `chat_sessions.legacy_id` / `chat_messages.legacy_id` (únicos,
 * criados por prisma/sql/0008_legacy_import.sql) fazem a deduplicação, e cada
 * sessão totalmente importada é marcada em `flow_state.legacy.messagesImported`.
 * Rodar duas vezes não duplica nada.
 *
 * Uso:
 *   cd apps/chat-backend
 *   DATABASE_URL=postgresql://... bun run scripts/migrate-sac-chat.ts
 *
 * Opções (env):
 *   DRY_RUN=true          - Só conta/loga, não escreve nada
 *   BATCH_SIZE=200        - Sessões por lote (cursor por chat_id, sem OFFSET)
 *   LIMIT_SESSIONS=0      - Importa no máximo N sessões (0 = todas)
 *   SINCE=YYYY-MM-DD      - Só conversas iniciadas a partir da data
 *   SKIP_ATTACHMENTS=true - Não baixa/gera os anexos (só metadados da mensagem)
 *   START_AFTER_ID=0      - Retoma a partir do chat_id informado (execução interrompida)
 *   WORKSPACE_SLUG=quality
 *   MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASS / MYSQL_DB
 */

import prisma from "@db";
import { saveMedia, mediaExists } from "@/storage";
import {
  externalMediaKey,
  legacyProtocol,
  mapChannel,
  mapMessageType,
  mapSender,
  mapSessionStatus,
  mediaKeyFor,
  normalizePhone,
  parseClienteInfo,
  parseLegacyAttachment,
  sanitizeLegacyText,
  typeWithMedia,
} from "@scripts/sac-chat-mapping";

// ── Config ────────────────────────────────────────────────────────────────────

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST ?? "10.1.2.32",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? "developer",
  password: process.env.MYSQL_PASS ?? "qualitydev",
  database: process.env.MYSQL_DB ?? "quality_site_dev",
};

const WORKSPACE_SLUG = process.env.WORKSPACE_SLUG ?? "quality";
const DRY_RUN = process.env.DRY_RUN === "true";
// Só regrava os binários dos anexos das mensagens já importadas. Serve para
// recuperar o storage sem reprocessar milhões de registros — foi preciso quando
// os arquivos foram gravados num container sem volume e sumiram na recriação.
const ATTACHMENTS_ONLY = process.env.ATTACHMENTS_ONLY === "true";
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 200);
const LIMIT_SESSIONS = Number(process.env.LIMIT_SESSIONS ?? 0);
const SINCE = process.env.SINCE ?? "";
const SKIP_ATTACHMENTS = process.env.SKIP_ATTACHMENTS === "true";
// Retomada de uma execução interrompida: pula direto para depois desse chat_id
// (a idempotência já garante o resto, isso só evita reprocessar o que passou).
const START_AFTER_ID = Number(process.env.START_AFTER_ID ?? 0);
const MESSAGE_INSERT_CHUNK = 1000;

// ── Contadores ────────────────────────────────────────────────────────────────

const stats = {
  sessionsRead: 0,
  sessionsCreated: 0,
  sessionsExisting: 0,
  sessionsSkippedDone: 0,
  sessionsSkippedConflict: 0,
  messagesRead: 0,
  messagesCreated: 0,
  messagesDuplicated: 0,
  messagesOrphan: 0,
  contactsCreated: 0,
  contactsReused: 0,
  attachmentsSaved: 0,
  attachmentsBytes: 0,
  attachmentsMissing: 0,
  attachmentsExternalLink: 0,
  attachmentsFailed: 0,
  attendantsResolved: 0,
  attendantsUnresolved: 0,
};

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}
function logWarn(msg: string) {
  console.warn(`⚠️  ${msg}`);
}

function safeDate(v: any): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ── Tipos das linhas legadas ──────────────────────────────────────────────────

type LegacyChat = {
  chat_id: number;
  chat_numero: string | null;
  chat_inicio: Date | null;
  chat_fim: Date | null;
  chat_id_entidade: number | null;
  chat_sistemas_id: number | null;
  chat_id_sac: number | null;
  chat_email_cliente: string | null;
  chat_atendido: number;
  chat_zap: number;
  chat_tipo_atendimento: number | null;
  chat_motivo_atendimento: number | null;
  chat_fim_motivo: string | null;
  chat_cliente_info: string | null;
  responsavel_id: number | null;
  protocolo_anterior: string | null;
};

type LegacyMessage = {
  chat_mensagens_id: number;
  chat_mensagens_id_chat: number;
  chat_mensagens_data: Date | null;
  chat_mensagens_id_autor: number | null;
  chat_mensagens_texto: string | null;
  chat_mensagens_nomeautor: string | null;
  chat_mensagens_id_zap: string | null;
  chat_link_zap: string | null;
  chat_tipo_msg: number | null;
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`Migração do histórico de chat do SAC${DRY_RUN ? " (DRY RUN)" : ""}`);
  log(`MySQL: ${MYSQL_CONFIG.database}@${MYSQL_CONFIG.host} → workspace "${WORKSPACE_SLUG}"`);
  if (SINCE) log(`Filtro: conversas a partir de ${SINCE}`);
  if (LIMIT_SESSIONS) log(`Limite: ${LIMIT_SESSIONS} sessões`);

  const mysql2 = await import("mysql2/promise");
  const conn = await mysql2.createConnection({ ...MYSQL_CONFIG });
  const query = async <T>(sql: string, params: any[] = []): Promise<T[]> => {
    const [rows] = await conn.query(sql, params);
    return rows as T[];
  };
  log("✅  MySQL conectado");

  if (ATTACHMENTS_ONLY) {
    await reimportAttachments(query);
    await conn.end();
    await prisma.$disconnect();
    report();
    return;
  }

  const attendantByLegacyId = await loadAttendants(query);
  const projectBySistemaId = await loadProjects(query);
  const duplicatedProtocols = await loadDuplicatedProtocols(query);
  const attachmentZapIds = SKIP_ATTACHMENTS ? new Set<string>() : await loadAttachmentIndex(query);
  const contactIdByPhone = new Map<string, string>();

  const where = SINCE ? "AND chat_inicio >= ?" : "";
  const sinceParams = SINCE ? [SINCE] : [];
  const [{ total }] = await query<{ total: number }>(
    `SELECT COUNT(*) total FROM chat WHERE 1 = 1 ${where}`,
    sinceParams
  );
  log(`📋  ${total} conversas candidatas no legado`);

  // Mensagens cuja conversa não existe mais no legado: não há sessão para
  // ancorá-las, então ficam de fora — contabilizadas para o relatório.
  const [{ orphans }] = await query<{ orphans: number }>(
    `SELECT COUNT(*) orphans FROM chat_mensagens m
      LEFT JOIN chat c ON c.chat_id = m.chat_mensagens_id_chat
      WHERE c.chat_id IS NULL`
  );
  stats.messagesOrphan = Number(orphans);

  let cursor = START_AFTER_ID;
  while (true) {
    if (LIMIT_SESSIONS && stats.sessionsRead >= LIMIT_SESSIONS) break;
    const take = LIMIT_SESSIONS ? Math.min(BATCH_SIZE, LIMIT_SESSIONS - stats.sessionsRead) : BATCH_SIZE;

    const chats = await query<LegacyChat>(
      `SELECT chat_id, chat_numero, chat_inicio, chat_fim, chat_id_entidade, chat_sistemas_id,
              chat_id_sac, chat_email_cliente, chat_atendido, chat_zap, chat_tipo_atendimento,
              chat_motivo_atendimento, chat_fim_motivo, chat_cliente_info, responsavel_id, protocolo_anterior
         FROM chat
        WHERE chat_id > ? ${where}
        ORDER BY chat_id
        LIMIT ${take}`,
      [cursor, ...sinceParams]
    );
    if (!chats.length) break;
    cursor = chats[chats.length - 1]!.chat_id;
    stats.sessionsRead += chats.length;

    const sessionByLegacyId = await upsertSessions(chats, {
      query,
      attendantByLegacyId,
      projectBySistemaId,
      duplicatedProtocols,
      contactIdByPhone,
    });
    await importMessages(chats, sessionByLegacyId, { query, attendantByLegacyId, attachmentZapIds });

    log(
      `… ${stats.sessionsRead}/${total} conversas | ${stats.messagesCreated} mensagens | ` +
        `${stats.attachmentsSaved} anexos | último chat_id ${cursor}`
    );
  }

  await conn.end();
  await prisma.$disconnect();
  report();
}

// ── Reimportação apenas dos anexos ────────────────────────────────────────────

/**
 * Percorre as mensagens já importadas que apontam para um arquivo local
 * (`media_key` sem o prefixo `ext:`) e regrava o binário a partir do blob do
 * legado. Idempotente: pula o que já existe no storage.
 */
async function reimportAttachments(query: <T>(sql: string, params?: any[]) => Promise<T[]>) {
  const messages = await prisma.chatMessage.findMany({
    where: { legacyId: { not: null }, mediaKey: { not: null }, NOT: { mediaKey: { startsWith: "ext:" } } },
    select: { legacyId: true, mediaKey: true, externalId: true },
  });
  log(`📎  ${messages.length} mensagens com anexo local para verificar`);

  let restored = 0;
  let alreadyThere = 0;
  for (const message of messages) {
    if (!message.mediaKey || !message.externalId) continue;
    if (await mediaExists(message.mediaKey)) {
      alreadyThere++;
      continue;
    }
    const [row] = await query<{ chat_arquivo: string | null; nome_arquivo: string | null; tipo_arquivo: string | null }>(
      `SELECT chat_arquivo, nome_arquivo, tipo_arquivo FROM chat_mensagens_arq_zap WHERE chat_mensagens_id_zap = ? LIMIT 1`,
      [message.externalId]
    );
    const attachment = parseLegacyAttachment(row?.chat_arquivo, {
      nome: row?.nome_arquivo,
      tipo: row?.tipo_arquivo,
      legacyMessageId: Number(message.legacyId),
    });
    if (!attachment) {
      stats.attachmentsMissing++;
      continue;
    }
    const buffer = Buffer.from(attachment.base64, "base64");
    if (!DRY_RUN) await saveMedia(message.mediaKey, buffer);
    stats.attachmentsSaved++;
    stats.attachmentsBytes += buffer.byteLength;
    restored++;
    if (restored % 500 === 0) log(`  … ${restored} anexos regravados`);
  }
  log(`✅  ${restored} anexos regravados, ${alreadyThere} já estavam no storage`);
}

// ── Pré-carregamentos ─────────────────────────────────────────────────────────

/** usuarios_id (SAC) → user.id (Plane), correlacionado por e-mail. */
async function loadAttendants(query: <T>(sql: string, params?: any[]) => Promise<T[]>): Promise<Map<number, string>> {
  const usuarios = await query<{ usuarios_id: number; usuarios_email: string | null }>(
    `SELECT usuarios_id, usuarios_email FROM usuarios WHERE usuarios_email IS NOT NULL AND usuarios_email <> ''`
  );
  const emailByLegacyId = new Map<number, string>();
  for (const u of usuarios) {
    const email = (u.usuarios_email ?? "").toLowerCase().trim();
    if (email) emailByLegacyId.set(u.usuarios_id, email);
  }

  const emails = [...new Set(emailByLegacyId.values())];
  const planeUsers = emails.length
    ? await prisma.$queryRawUnsafe<{ id: string; email: string }[]>(
        `SELECT id::text, lower(email) email FROM users WHERE lower(email) = ANY($1::text[])`,
        emails
      )
    : [];
  const idByEmail = new Map(planeUsers.map((u) => [u.email, u.id]));

  const map = new Map<number, string>();
  for (const [legacyId, email] of emailByLegacyId) {
    const userId = idByEmail.get(email);
    if (userId) map.set(legacyId, userId);
  }
  log(`👤  ${map.size}/${emailByLegacyId.size} atendentes correlacionados com usuários do Plane`);
  return map;
}

type ProjectRef = { id: string; identifier: string; name: string };

/** sistemas_id (SAC) → projeto do Plane criado por scripts/migrate-sac.ts. */
async function loadProjects(query: <T>(sql: string, params?: any[]) => Promise<T[]>): Promise<Map<number, ProjectRef>> {
  const projects = await prisma.$queryRawUnsafe<{ id: string; identifier: string; name: string; external_id: string }[]>(
    `SELECT id::text, identifier, name, external_id FROM projects
      WHERE external_source = 'sac_migration' AND external_id IS NOT NULL AND deleted_at IS NULL`
  );
  const map = new Map<number, ProjectRef>();
  for (const p of projects) {
    const sistemaId = Number(p.external_id);
    if (Number.isFinite(sistemaId)) map.set(sistemaId, { id: p.id, identifier: p.identifier, name: p.name });
  }
  log(`📁  ${map.size} projetos do Plane vinculáveis a sistemas do SAC`);
  return map;
}

/** chat_numero repetidos no legado — protocolo precisa do chat_id como desempate. */
async function loadDuplicatedProtocols(
  query: <T>(sql: string, params?: any[]) => Promise<T[]>
): Promise<Set<string>> {
  const rows = await query<{ chat_numero: string }>(
    `SELECT chat_numero FROM chat WHERE chat_numero IS NOT NULL AND chat_numero <> ''
      GROUP BY chat_numero HAVING COUNT(*) > 1`
  );
  log(`🔖  ${rows.length} protocolos legados repetidos (recebem sufixo com o chat_id)`);
  return new Set(rows.map((r) => r.chat_numero));
}

/** Ids de mensagem do WhatsApp que possuem anexo — evita consultar blobs à toa. */
async function loadAttachmentIndex(query: <T>(sql: string, params?: any[]) => Promise<T[]>): Promise<Set<string>> {
  const rows = await query<{ chat_mensagens_id_zap: string | null }>(
    `SELECT chat_mensagens_id_zap FROM chat_mensagens_arq_zap WHERE chat_mensagens_id_zap IS NOT NULL`
  );
  const ids = new Set(rows.map((r) => r.chat_mensagens_id_zap!).filter(Boolean));
  log(`📎  ${ids.size} anexos disponíveis no legado`);
  return ids;
}

// ── Sessões + contatos ────────────────────────────────────────────────────────

type SessionDeps = {
  query: <T>(sql: string, params?: any[]) => Promise<T[]>;
  attendantByLegacyId: Map<number, string>;
  projectBySistemaId: Map<number, ProjectRef>;
  duplicatedProtocols: Set<string>;
  contactIdByPhone: Map<string, string>;
};

type SessionRef = { id: string; alreadyImported: boolean };

async function upsertSessions(chats: LegacyChat[], deps: SessionDeps): Promise<Map<number, SessionRef>> {
  const legacyIds = chats.map((c) => c.chat_id);
  const existing = DRY_RUN
    ? []
    : await prisma.chatSession.findMany({
        where: { legacyId: { in: legacyIds } },
        select: { id: true, legacyId: true, flowState: true },
      });

  const refs = new Map<number, SessionRef>();
  for (const s of existing) {
    const imported = Boolean((s.flowState as any)?.legacy?.messagesImported !== undefined);
    refs.set(s.legacyId!, { id: s.id, alreadyImported: imported });
    stats.sessionsExisting++;
    if (imported) stats.sessionsSkippedDone++;
  }

  const contacts = await loadContacts(chats, deps);
  const rows: any[] = [];

  for (const chat of chats) {
    if (refs.has(chat.chat_id)) continue;

    const channel = mapChannel(chat.chat_zap);
    const { status, closedReason } = mapSessionStatus(chat.chat_atendido);
    const info = parseClienteInfo(chat.chat_cliente_info);
    const contact = contacts.get(chat.chat_id) ?? null;
    const phone = contact?.phone ?? info.phone;
    const attendantId = chat.chat_id_sac ? (deps.attendantByLegacyId.get(chat.chat_id_sac) ?? null) : null;
    const project = chat.chat_sistemas_id ? (deps.projectBySistemaId.get(chat.chat_sistemas_id) ?? null) : null;
    const startedAt = safeDate(chat.chat_inicio) ?? new Date(0);

    if (chat.chat_id_sac) stats[attendantId ? "attendantsResolved" : "attendantsUnresolved"]++;

    const id = crypto.randomUUID();
    refs.set(chat.chat_id, { id, alreadyImported: false });
    rows.push({
      id,
      legacyId: chat.chat_id,
      protocol: legacyProtocol(chat.chat_id, chat.chat_numero, deps.duplicatedProtocols.has(chat.chat_numero ?? "")),
      channel,
      workspaceId: WORKSPACE_SLUG,
      contactId: contact?.id ?? null,
      clientBrowserId: info.browserId,
      clientName: contact?.name ?? info.name,
      clientPhone: phone,
      status,
      assignedAttendantId: attendantId,
      projectId: project?.id ?? null,
      projectIdentifier: project?.identifier ?? null,
      projectName: project?.name ?? null,
      // Conversa histórica: o bot nunca deve reprocessá-la.
      botState: "done",
      flowState: { legacy: legacyMetadata(chat, closedReason) },
      createdAt: startedAt,
      closedAt: safeDate(chat.chat_fim) ?? startedAt,
      closedById: attendantId,
    });
  }

  if (!rows.length || DRY_RUN) {
    stats.sessionsCreated += rows.length;
    return refs;
  }

  const created = await prisma.chatSession.createMany({ data: rows, skipDuplicates: true });
  stats.sessionsCreated += created.count;
  if (created.count !== rows.length) await dropSessionsNotPersisted(rows, refs);
  return refs;
}

/**
 * `skipDuplicates` pode descartar uma sessão (protocolo repetido inesperado).
 * Sem isso o lote seguinte tentaria inserir mensagens apontando para uma sessão
 * que não existe e derrubaria a migração inteira por violação de chave.
 */
async function dropSessionsNotPersisted(rows: any[], refs: Map<number, SessionRef>) {
  const persisted = await prisma.chatSession.findMany({
    where: { legacyId: { in: rows.map((r) => r.legacyId) } },
    select: { legacyId: true },
  });
  const ok = new Set(persisted.map((s) => s.legacyId));
  for (const row of rows) {
    if (ok.has(row.legacyId)) continue;
    refs.delete(row.legacyId);
    stats.sessionsSkippedConflict++;
    logWarn(`sessão legada ${row.legacyId} descartada: protocolo "${row.protocol}" já existe`);
  }
}

function legacyMetadata(chat: LegacyChat, closedReason: string) {
  return {
    source: "sac",
    chatId: chat.chat_id,
    protocol: chat.chat_numero,
    previousProtocol: chat.protocolo_anterior,
    entityId: chat.chat_id_entidade,
    systemId: chat.chat_sistemas_id,
    attendantLegacyId: chat.chat_id_sac,
    responsavelLegacyId: chat.responsavel_id,
    clientEmail: chat.chat_email_cliente,
    serviceType: chat.chat_tipo_atendimento,
    serviceReason: chat.chat_motivo_atendimento,
    closedReason,
    closeNote: sanitizeLegacyText(chat.chat_fim_motivo).slice(0, 500) || null,
  };
}

type ContactRef = { id: string | null; name: string | null; phone: string | null };

/**
 * Um contato por telefone no workspace (unique [workspaceId, phone]). O telefone
 * vem de chat_contato e, na falta dele, do chat_cliente_info.
 */
async function loadContacts(chats: LegacyChat[], deps: SessionDeps): Promise<Map<number, ContactRef>> {
  const whatsappChats = chats.filter((c) => mapChannel(c.chat_zap) === "whatsapp");
  const result = new Map<number, ContactRef>();
  if (!whatsappChats.length) return result;

  const rows = await deps.query<{ chat_id: number; nome: string | null; whatsapp: string | null }>(
    `SELECT chat_id, nome, whatsapp FROM chat_contato WHERE chat_id IN (${whatsappChats.map(() => "?").join(",")}) ORDER BY id`,
    whatsappChats.map((c) => c.chat_id)
  );
  const legacyByChat = new Map(rows.map((r) => [r.chat_id, r]));

  for (const chat of whatsappChats) {
    const legacy = legacyByChat.get(chat.chat_id);
    const info = parseClienteInfo(chat.chat_cliente_info);
    const phone = normalizePhone(legacy?.whatsapp) ?? info.phone;
    const name = (legacy?.nome ?? "").trim() || info.name;
    if (!phone) {
      result.set(chat.chat_id, { id: null, name, phone: null });
      continue;
    }
    const contactId = await resolveContact(phone, name, deps.contactIdByPhone);
    result.set(chat.chat_id, { id: contactId, name, phone });
  }
  return result;
}

async function resolveContact(phone: string, name: string | null, cache: Map<string, string>): Promise<string | null> {
  const cached = cache.get(phone);
  if (cached) {
    stats.contactsReused++;
    return cached;
  }
  if (DRY_RUN) {
    stats.contactsCreated++;
    cache.set(phone, `dry-${phone}`);
    return null;
  }

  const where = { workspaceId_phone: { workspaceId: WORKSPACE_SLUG, phone } };
  const existing = await prisma.contact.findUnique({ where, select: { id: true } });
  if (existing) {
    cache.set(phone, existing.id);
    stats.contactsReused++;
    return existing.id;
  }
  const contact = await prisma.contact.create({
    data: { workspaceId: WORKSPACE_SLUG, phone, name, extra: { source: "sac" } },
  });
  cache.set(phone, contact.id);
  stats.contactsCreated++;
  return contact.id;
}

// ── Mensagens + anexos ────────────────────────────────────────────────────────

type MessageDeps = {
  query: <T>(sql: string, params?: any[]) => Promise<T[]>;
  attendantByLegacyId: Map<number, string>;
  attachmentZapIds: Set<string>;
};

async function importMessages(chats: LegacyChat[], sessions: Map<number, SessionRef>, deps: MessageDeps) {
  const pending = chats.filter((c) => !sessions.get(c.chat_id)?.alreadyImported);
  if (!pending.length) return;

  const placeholders = pending.map(() => "?").join(",");
  const messages = await deps.query<LegacyMessage>(
    `SELECT chat_mensagens_id, chat_mensagens_id_chat, chat_mensagens_data, chat_mensagens_id_autor,
            chat_mensagens_texto, chat_mensagens_nomeautor, chat_mensagens_id_zap, chat_link_zap, chat_tipo_msg
       FROM chat_mensagens
      WHERE chat_mensagens_id_chat IN (${placeholders})
      ORDER BY chat_mensagens_id`,
    pending.map((c) => c.chat_id)
  );
  stats.messagesRead += messages.length;

  const attendantByChat = new Map(pending.map((c) => [c.chat_id, c.chat_id_sac]));
  const activity = new Map<number, { client: Date | null; attendant: Date | null; count: number }>();
  const rows: any[] = [];

  for (const msg of messages) {
    const session = sessions.get(msg.chat_mensagens_id_chat);
    if (!session) continue;

    const { sender, attendantLegacyId } = mapSender(msg.chat_mensagens_id_autor);
    const legacyUserId = attendantLegacyId ?? (sender === "attendant" ? attendantByChat.get(msg.chat_mensagens_id_chat) : null);
    const createdAt = safeDate(msg.chat_mensagens_data) ?? new Date(0);
    const media = await resolveMedia(msg, session.id, deps);

    rows.push({
      legacyId: msg.chat_mensagens_id,
      sessionId: session.id,
      sender,
      senderUserId: legacyUserId ? (deps.attendantByLegacyId.get(legacyUserId) ?? null) : null,
      senderName: (msg.chat_mensagens_nomeautor ?? "").trim().slice(0, 255) || null,
      type: typeWithMedia(mapMessageType(msg.chat_tipo_msg), media?.mime),
      text: sanitizeLegacyText(msg.chat_mensagens_texto) || null,
      mediaKey: media?.key ?? null,
      mediaMime: media?.mime ?? null,
      mediaName: media?.name ?? null,
      externalId: (msg.chat_mensagens_id_zap ?? "").trim() || null,
      status: "read",
      createdAt,
    });

    const acc = activity.get(msg.chat_mensagens_id_chat) ?? { client: null, attendant: null, count: 0 };
    acc.count++;
    if (sender === "client") acc.client = createdAt;
    if (sender === "attendant") acc.attendant = createdAt;
    activity.set(msg.chat_mensagens_id_chat, acc);
  }

  await insertMessages(rows);
  await markSessionsImported(pending, sessions, activity);
}

async function insertMessages(rows: any[]) {
  if (DRY_RUN) {
    stats.messagesCreated += rows.length;
    return;
  }
  for (let i = 0; i < rows.length; i += MESSAGE_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + MESSAGE_INSERT_CHUNK);
    const created = await prisma.chatMessage.createMany({ data: chunk, skipDuplicates: true });
    stats.messagesCreated += created.count;
    stats.messagesDuplicated += chunk.length - created.count;
  }
}

/** Marca a sessão como totalmente importada — reexecuções pulam suas mensagens. */
async function markSessionsImported(
  chats: LegacyChat[],
  sessions: Map<number, SessionRef>,
  activity: Map<number, { client: Date | null; attendant: Date | null; count: number }>
) {
  if (DRY_RUN) return;
  for (const chat of chats) {
    const session = sessions.get(chat.chat_id);
    if (!session) continue;
    const acc = activity.get(chat.chat_id) ?? { client: null, attendant: null, count: 0 };
    const { closedReason } = mapSessionStatus(chat.chat_atendido);
    await prisma.chatSession.update({
      where: { id: session.id },
      data: {
        flowState: { legacy: { ...legacyMetadata(chat, closedReason), messagesImported: acc.count } },
        lastClientMessageAt: acc.client,
        lastAttendantMessageAt: acc.attendant,
      },
    });
  }
}

type MediaRef = { key: string; mime: string | null; name: string | null };

/**
 * Mídia da mensagem: o blob base64 do legado vai para o storage do chat; sem
 * blob, sobra o link do WhatsApp (convenção `ext:<url>` já usada pelo webhook).
 */
async function resolveMedia(msg: LegacyMessage, sessionId: string, deps: MessageDeps): Promise<MediaRef | null> {
  const zapId = (msg.chat_mensagens_id_zap ?? "").trim();
  const isMedia = mapMessageType(msg.chat_tipo_msg) !== "text";

  if (zapId && deps.attachmentZapIds.has(zapId)) {
    const saved = await saveAttachment(msg, zapId, sessionId, deps);
    if (saved) return saved;
  }
  if (!isMedia) return null;

  const external = externalMediaKey(msg.chat_link_zap);
  if (external) {
    stats.attachmentsExternalLink++;
    return { key: external, mime: null, name: null };
  }
  stats.attachmentsMissing++;
  return null;
}

async function saveAttachment(
  msg: LegacyMessage,
  zapId: string,
  sessionId: string,
  deps: MessageDeps
): Promise<MediaRef | null> {
  try {
    const [row] = await deps.query<{ chat_arquivo: string | null; nome_arquivo: string | null; tipo_arquivo: string | null }>(
      `SELECT chat_arquivo, nome_arquivo, tipo_arquivo FROM chat_mensagens_arq_zap WHERE chat_mensagens_id_zap = ? LIMIT 1`,
      [zapId]
    );
    const attachment = parseLegacyAttachment(row?.chat_arquivo, {
      nome: row?.nome_arquivo,
      tipo: row?.tipo_arquivo,
      legacyMessageId: msg.chat_mensagens_id,
    });
    if (!attachment) {
      stats.attachmentsMissing++;
      return null;
    }

    const key = mediaKeyFor(sessionId, msg.chat_mensagens_id);
    const buffer = Buffer.from(attachment.base64, "base64");
    if (!DRY_RUN) await saveMedia(key, buffer);
    stats.attachmentsSaved++;
    stats.attachmentsBytes += buffer.byteLength;
    return { key, mime: attachment.mime, name: attachment.name };
  } catch (e) {
    stats.attachmentsFailed++;
    logWarn(`anexo ${zapId} (mensagem ${msg.chat_mensagens_id}) falhou: ${(e as Error).message}`);
    return null;
  }
}

// ── Relatório ─────────────────────────────────────────────────────────────────

function report() {
  const mb = (stats.attachmentsBytes / 1024 / 1024).toFixed(1);
  log("\n══════════════════════════════════════════════════");
  log("  Migração do chat concluída");
  log(`  Conversas lidas:        ${stats.sessionsRead}`);
  log(`  Sessões criadas:        ${stats.sessionsCreated}`);
  log(`  Sessões já existentes:  ${stats.sessionsExisting} (${stats.sessionsSkippedDone} já com mensagens importadas)`);
  log(`  Sessões descartadas:    ${stats.sessionsSkippedConflict} (protocolo já existente)`);
  log(`  Mensagens lidas:        ${stats.messagesRead}`);
  log(`  Mensagens criadas:      ${stats.messagesCreated}`);
  log(`  Mensagens duplicadas:   ${stats.messagesDuplicated} (ignoradas por legacy_id já existente)`);
  log(`  Mensagens órfãs:        ${stats.messagesOrphan} (a conversa não existe mais no legado — fora do escopo)`);
  log(`  Contatos criados:       ${stats.contactsCreated}`);
  log(`  Contatos reaproveitados:${stats.contactsReused}`);
  log(`  Anexos gravados:        ${stats.attachmentsSaved} (${mb} MB)`);
  log(`  Anexos só com link:     ${stats.attachmentsExternalLink} (blob não existe no legado, guardado como ext:<url>)`);
  log(`  Anexos sem arquivo:     ${stats.attachmentsMissing} (mídia sem blob e sem link)`);
  log(`  Anexos com falha:       ${stats.attachmentsFailed}`);
  log(`  Atendentes resolvidos:  ${stats.attendantsResolved} (${stats.attendantsUnresolved} sem usuário no Plane)`);
  if (SKIP_ATTACHMENTS) log("  ⚠️  SKIP_ATTACHMENTS=true — nenhum anexo foi processado");
  if (DRY_RUN) log("  ⚠️  DRY RUN — nada foi gravado");
  log("══════════════════════════════════════════════════");
}

main().catch(async (e) => {
  console.error("Migração falhou:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
