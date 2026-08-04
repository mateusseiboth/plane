/**
 * Mapeamentos puros do chat legado (SAC / MySQL `quality_site_dev`) para o
 * schema do chat atual (`chat_sessions` / `chat_messages` / `chat_contacts`).
 *
 * Tudo aqui é função pura e sem I/O — o script de migração
 * (`scripts/migrate-sac-chat.ts`) apenas orquestra. Isso mantém as regras de
 * conversão testáveis (`tests/migrate-sac-chat.test.ts`).
 */

export type ChatSender = "attendant" | "client" | "bot";
export type ChatMessageType = "text" | "image" | "video" | "audio" | "file";
export type ChatChannel = "whatsapp" | "native";
export type ClosedReason = "finished" | "abandoned" | "unfinished" | "unknown";

/** Prefixo dos protocolos importados — nunca colide com o formato atual YYYYMMDD-####. */
export const LEGACY_PROTOCOL_PREFIX = "LEG-";

// ── Autor → sender ────────────────────────────────────────────────────────────
// chat_mensagens_id_autor: 0 = atendente, 1 = cliente, 2 = mensagem automática.
// Registros antigos gravavam o próprio usuarios_id do atendente nessa coluna.
const SENDER_BY_AUTOR: Record<number, ChatSender> = { 0: "attendant", 1: "client", 2: "bot" };

export type SenderMapping = { sender: ChatSender; attendantLegacyId: number | null };

export function mapSender(autor: number | null | undefined): SenderMapping {
  const known = SENDER_BY_AUTOR[autor as number];
  if (known) return { sender: known, attendantLegacyId: null };
  // Sem autor: mensagem de sistema do chat antigo — entra como bot.
  if (autor === null || autor === undefined) return { sender: "bot", attendantLegacyId: null };
  return { sender: "attendant", attendantLegacyId: autor };
}

// ── chat_tipo_msg → type ──────────────────────────────────────────────────────
// 1 texto, 2 imagem, 3 sticker, 4 documento, 5 áudio, 6 vídeo, 7 contato.
const TYPE_BY_TIPO_MSG: Record<number, ChatMessageType> = {
  1: "text",
  2: "image",
  3: "image", // sticker é renderizado como imagem
  4: "file",
  5: "audio",
  6: "video",
  7: "text", // cartão de contato: o texto já traz nome + telefone
};

export function mapMessageType(tipo: number | null | undefined): ChatMessageType {
  return TYPE_BY_TIPO_MSG[tipo as number] ?? "text";
}

const TYPE_BY_MIME_PREFIX: Record<string, ChatMessageType> = { image: "image", video: "video", audio: "audio" };

/**
 * Boa parte das mensagens do WhatsApp tem `chat_tipo_msg` nulo mesmo carregando
 * anexo: quem manda no tipo final é o mime do arquivo que veio junto.
 */
export function typeWithMedia(mapped: ChatMessageType, mime: string | null | undefined): ChatMessageType {
  if (!mime) return mapped;
  return TYPE_BY_MIME_PREFIX[mime.split("/")[0]!.toLowerCase()] ?? (mapped === "text" ? "file" : mapped);
}

// ── chat_atendido → status ────────────────────────────────────────────────────
// 0 não iniciado, 1 em atendimento, 2 finalizado pelo atendimento, 3 finalizado,
// 4 abandono do cliente, 5 pausa. Todo o histórico entra encerrado: são conversas
// mortas, não podem reaparecer na fila/kanban do atendimento.
const CLOSED_REASON_BY_ATENDIDO: Record<number, ClosedReason> = {
  0: "unfinished",
  1: "unfinished",
  2: "finished",
  3: "finished",
  4: "abandoned",
  5: "unfinished",
};

export type SessionStatusMapping = { status: "closed"; closedReason: ClosedReason };

export function mapSessionStatus(atendido: number | null | undefined): SessionStatusMapping {
  return { status: "closed", closedReason: CLOSED_REASON_BY_ATENDIDO[atendido as number] ?? "unknown" };
}

export function mapChannel(chatZap: number | null | undefined): ChatChannel {
  return Number(chatZap) === 1 ? "whatsapp" : "native";
}

// ── Protocolo ─────────────────────────────────────────────────────────────────
/**
 * `chat_numero` é o protocolo conhecido pelo cliente ("6492-2026") e é
 * reaproveitado, mas NÃO é único no legado (43 números se repetem). Nos
 * repetidos — e quando não há número — o chat_id entra como desempate, o que
 * mantém o protocolo determinístico entre execuções.
 */
export function legacyProtocol(chatId: number, chatNumero: string | null | undefined, duplicated = false): string {
  const numero = (chatNumero ?? "").trim();
  if (!numero) return `${LEGACY_PROTOCOL_PREFIX}${chatId}`;
  if (duplicated) return `${LEGACY_PROTOCOL_PREFIX}${numero}-${chatId}`;
  return `${LEGACY_PROTOCOL_PREFIX}${numero}`;
}

// ── Telefone / cliente ────────────────────────────────────────────────────────
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export type ClienteInfo = { phone: string | null; name: string | null; browserId: string | null };

/**
 * `chat_cliente_info` é uma linha separada por "|". Dois formatos convivem:
 *   antigo  → versao|banco|computador|data|navegador|SO
 *   atual   → ...|telefone|ZAP ou 0|nome|uuid:cust_<browserId>
 */
export function parseClienteInfo(info: string | null | undefined): ClienteInfo {
  const parts = String(info ?? "").split("|");
  const uuidPart = parts.find((p) => p.startsWith("uuid:"));
  return {
    phone: normalizePhone(parts[6]),
    name: cleanName(parts[8]),
    browserId: uuidPart ? uuidPart.slice("uuid:".length) || null : null,
  };
}

function cleanName(raw: string | undefined): string | null {
  const name = String(raw ?? "").trim();
  if (!name || name === "0" || name.toLowerCase() === "web") return null;
  return name.slice(0, 120);
}

// ── Texto ─────────────────────────────────────────────────────────────────────

// Nomes das entidades HTML de U+00A0 a U+00FF, em ordem — cobrem todo o
// acentuado do português, que o chat antigo gravava como &aacute;, &ccedil;…
const LATIN1_ENTITY_NAMES =
  ("nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute " +
    "micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring " +
    "AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml " +
    "times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil " +
    "egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash " +
    "ugrave uacute ucirc uuml yacute thorn yuml").split(" ");

const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
LATIN1_ENTITY_NAMES.forEach((name, index) => {
  HTML_ENTITIES[name] = String.fromCharCode(0xa0 + index);
});

const MAX_TEXT_LENGTH = 20000;

// UTF-8 gravado em coluna latin1 e reconvertido para UTF-8 pelo servidor:
// "número" chega como "nÃºmero". Só parte das linhas tem o problema, então a
// correção é decidida linha a linha.
const MOJIBAKE = /[\u00C3\u00C2][\u0080-\u00BF]/;

/** Reinterpreta o texto como bytes latin1 quando ele é UTF-8 duplamente codificado. */
export function fixMojibake(text: string): string {
  if (!MOJIBAKE.test(text)) return text;
  // Há algo fora do latin1 → a linha é uma mistura; reinterpretar corromperia.
  if (/[^\u0000-\u00FF]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return text;
  }
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] !== "#") return HTML_ENTITIES[body] ?? HTML_ENTITIES[body.toLowerCase()] ?? match;
    const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

/** Mensagem que sobrou só com pontuação depois de remover o HTML. */
const ONLY_PUNCTUATION = /^[\s\-–—:.;|]*$/;

/** Tags de mídia: o legado embutia o arquivo inteiro em base64 dentro delas. */
const MEDIA_TAG = /<(img|video|audio|source|embed|iframe)\b[^>]*>/gi;
const INLINE_BASE64 = /data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g;

/**
 * O chat antigo gravava HTML no corpo da mensagem: negrito, quebras, links para
 * arquivos da intranet e — o caso perigoso — `<img src="data:image/jpeg;base64,…">`
 * com a foto inteira embutida (o mesmo arquivo que já vai para o storage). O chat
 * atual renderiza texto puro: corrige a codificação, preserva o destino dos links,
 * descarta a mídia embutida, remove tags, decodifica entidades e tira os caracteres
 * de controle que o Postgres rejeita.
 */
export function sanitizeLegacyText(raw: string | null | undefined): string {
  if (!raw) return "";
  const text = decodeEntities(
    fixMojibake(String(raw))
      .replace(MEDIA_TAG, "")
      .replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) =>
        !href || href.startsWith("data:") ? label : `${label} (${href})`
      )
      // A quebra vinha como <br> (web) ou como o token "|br|" (ponte do
      // WhatsApp), quase sempre acompanhada do CRLF e da indentação do HTML.
      .replace(/\s*(<br\s*\/?>|\|br\|)\s*/gi, "\n")
      .replace(/<\/(p|div|li|tr)>/gi, "\n")
      .replace(/<[^>]{0,400}>/g, "")
      .replace(INLINE_BASE64, "")
  )
    .replace(/\u00A0/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\uD800-\uDFFF]/g, "?")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (ONLY_PUNCTUATION.test(text)) return "";
  return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
}

// ── Anexos ────────────────────────────────────────────────────────────────────
const MIME_BY_LEGACY_TYPE: Record<string, string> = {
  image: "image/jpeg",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  sticker: "image/webp",
  audio: "audio/ogg",
  ptt: "audio/ogg",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  video: "video/mp4",
  mp4: "video/mp4",
  document: "application/octet-stream",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  zip: "application/zip",
  rar: "application/vnd.rar",
  txt: "text/plain",
  html: "text/html",
};

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/html": "html",
  "text/plain": "txt",
};

/** Deriva o mime a partir de `tipo_arquivo` e, quando genérico, da extensão do nome. */
export function mimeForLegacyFile(tipo: string | null | undefined, nome: string | null | undefined): string {
  const byName = MIME_BY_LEGACY_TYPE[extensionOf(nome) ?? ""];
  const byType = MIME_BY_LEGACY_TYPE[String(tipo ?? "").toLowerCase().trim()];
  if (byType && byType !== "application/octet-stream") return byType;
  return byName ?? byType ?? "application/octet-stream";
}

function extensionOf(nome: string | null | undefined): string | null {
  const parts = String(nome ?? "").toLowerCase().split(".");
  return parts.length > 1 ? (parts.pop() ?? null) : null;
}

export type LegacyAttachment = { base64: string; mime: string; name: string };

/**
 * `chat_mensagens_arq_zap.chat_arquivo` guarda o arquivo inteiro: quase sempre
 * como data URI (`data:image/jpeg;base64,...`), às vezes só o base64 cru — nesse
 * caso o mime vem de `tipo_arquivo`/`nome_arquivo`.
 */
export function parseLegacyAttachment(
  raw: string | null | undefined,
  file: { nome?: string | null; tipo?: string | null; legacyMessageId?: number | string | null } = {}
): LegacyAttachment | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  const match = /^data:([^;,]+)?(;[^,]*)?,(.*)$/s.exec(value);
  const base64 = (match ? match[3] : value).replace(/\s/g, "");
  if (!base64) return null;

  const mime = match?.[1]?.trim() || mimeForLegacyFile(file.tipo, file.nome);
  const name = (file.nome ?? "").trim() || defaultFileName(mime, file.legacyMessageId ?? "arquivo");
  return { base64, mime, name };
}

function defaultFileName(mime: string, id: number | string): string {
  return `legado-${id}.${EXTENSION_BY_MIME[mime] ?? "bin"}`;
}

/**
 * Chave determinística no storage: reexecutar a migração sobrescreve o mesmo
 * objeto em vez de deixar órfãos. Espelha o layout `<sessionId>/<arquivo>` usado
 * pelo upload do atendimento.
 */
export function mediaKeyFor(sessionId: string, legacyMessageId: number): string {
  return `${sessionId}/legacy-${legacyMessageId}`;
}

/**
 * Mídia sem blob no banco mas com link do WhatsApp: guarda a URL externa na
 * mesma convenção já usada pelo webhook (`ext:<url>`).
 */
export function externalMediaKey(link: string | null | undefined): string | null {
  const url = String(link ?? "").trim();
  return /^https?:\/\//i.test(url) ? `ext:${url}` : null;
}
