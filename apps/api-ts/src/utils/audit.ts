/**
 * Trilha de auditoria (LGPD).
 *
 * A LGPD exige que o tratamento de dados pessoais seja rastreável: quem acessou,
 * o quê, quando e de onde. Aqui registramos tanto ESCRITAS quanto LEITURAS de
 * dados pessoais (abrir/visualizar um chamado, ver dados de um membro, imprimir,
 * exportar), porque acesso também é tratamento.
 *
 * Princípios:
 *  - **Nunca quebrar a requisição**: falha ao gravar log não pode derrubar a
 *    operação do usuário; erros são apenas reportados no console.
 *  - **Nunca gravar o dado sensível em si**: guardamos identificadores e o
 *    diff de campos, não o conteúdo pessoal (a fonte continua sendo o registro).
 *  - **Assíncrono**: a gravação não bloqueia a resposta.
 */

import prisma from "@db";

/** Vocabulário fechado de ações — evita `action` escrito de N formas diferentes. */
export const AUDIT_ACTIONS = {
  VIEW: "view",
  LIST: "list",
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  PRINT: "print",
  EXPORT: "export",
  DOWNLOAD: "download",
  COMMENT: "comment",
  STATE_CHANGE: "state_change",
  ASSIGN: "assign",
  CLOSE: "close",
  REOPEN: "reopen",
  LOGIN: "login",
  LOGIN_FAILED: "login_failed",
  LOGOUT: "logout",
  PERMISSION_CHANGE: "permission_change",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** Entidades auditadas (usado também para filtrar a consulta). */
export const AUDIT_ENTITIES = {
  ISSUE: "issue",
  INTAKE: "intake",
  COMMENT: "comment",
  ATTACHMENT: "attachment",
  PROJECT: "project",
  WORKSPACE: "workspace",
  MEMBER: "member",
  USER: "user",
  ENTITY: "entity",
  // Responsáveis: dado pessoal de terceiro (nome, e-mail, telefone, nascimento).
  ENTITY_CONTACT: "entity_contact",
  ENTITY_CONTACT_TYPE: "entity_contact_type",
  TECHNICAL_VISIT: "technical_visit",
  PAGE: "page",
  CYCLE: "cycle",
  MODULE: "module",
  REPORT: "report",
  CHAT_SESSION: "chat_session",
  AUDIT_LOG: "audit_log",
} as const;

export type AuditEntity = (typeof AUDIT_ENTITIES)[keyof typeof AUDIT_ENTITIES];

export type AuditActor = { id?: string | null; email?: string | null } | null | undefined;

export type AuditInput = {
  workspaceId: string;
  entity: string;
  entityId: string;
  action: string;
  actor?: AuditActor;
  /** Diferença aplicada (só nomes de campo e valores curtos). */
  changes?: Record<string, unknown>;
  /** Contexto extra: projeto, origem da tela, motivo, quantidade impressa… */
  metadata?: Record<string, unknown>;
  /** Headers da requisição, para extrair IP e user-agent. */
  headers?: Record<string, string | undefined> | Headers;
};

function headerValue(headers: AuditInput["headers"], key: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get(key) ?? undefined;
  return (headers as Record<string, string | undefined>)[key];
}

/**
 * IP real do cliente. Atrás do nginx/proxy o socket é sempre o do proxy, então o
 * primeiro endereço de `x-forwarded-for` é o que importa.
 */
export function clientIp(headers: AuditInput["headers"]): string | null {
  const forwarded = headerValue(headers, "x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || null;
  return headerValue(headers, "x-real-ip") ?? null;
}

/** Corta valores longos: a trilha guarda o QUE mudou, não o conteúdo inteiro. */
function trim(value: unknown, maxLen = 500): unknown {
  if (typeof value !== "string") return value;
  return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
}

function trimAll(obj: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!obj) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) out[key] = trim(value);
  return out;
}

/**
 * Grava um evento de auditoria. Não use `await` no caminho da requisição — a
 * função já engole os próprios erros e devolve uma promise resolvida.
 */
export function recordAudit(input: AuditInput): Promise<void> {
  const userAgent = headerValue(input.headers, "user-agent");
  const metadata = trimAll(input.metadata);
  if (userAgent) metadata.user_agent = trim(userAgent, 300);

  return prisma.auditLog
    .create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        actorIp: clientIp(input.headers),
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        changes: trimAll(input.changes) as any,
        metadata: metadata as any,
      },
    })
    .then(() => undefined)
    .catch((e) => {
      // Auditoria nunca pode derrubar a operação do usuário.
      console.error("[audit] falha ao registrar evento:", e);
    });
}

/** Açúcar para leituras (o caso mais comum e mais fácil de esquecer). */
export function recordView(
  args: Omit<AuditInput, "action" | "changes"> & { changes?: never }
): Promise<void> {
  return recordAudit({ ...args, action: AUDIT_ACTIONS.VIEW });
}

/**
 * Diff enxuto para gravar em `changes`: apenas os campos que realmente mudaram,
 * no formato `{campo: {de, para}}`.
 */
export function auditDiff(
  before: Record<string, any>,
  after: Record<string, any>,
  fields: string[]
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const field of fields) {
    const from = before?.[field];
    const to = after?.[field];
    if (from === to) continue;
    if (from instanceof Date && to instanceof Date && from.getTime() === to.getTime()) continue;
    changes[field] = { de: trim(from), para: trim(to) };
  }
  return changes;
}

export function serializeAuditLog(log: any) {
  return {
    id: log.id,
    workspace_id: log.workspaceId,
    actor_id: log.actorId ?? null,
    actor_email: log.actorEmail ?? null,
    actor_ip: log.actorIp ?? null,
    entity: log.entity,
    entity_id: log.entityId,
    action: log.action,
    changes: log.changes ?? {},
    metadata: log.metadata ?? {},
    created_at: log.createdAt,
  };
}
