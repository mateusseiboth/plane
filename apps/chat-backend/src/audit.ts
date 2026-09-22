// Trilha de auditoria (LGPD) para o chat.
//
// O chat compartilha o Postgres do Plane, mas o schema Prisma daqui não conhece
// o model AuditLog (é do api-ts). Em vez de duplicar o model — e arriscar as duas
// definições divergirem —, gravamos com SQL direto na mesma tabela `audit_logs`.
//
// Conversas de atendimento carregam dado pessoal (nome, telefone, conteúdo das
// mensagens), então abrir/exportar uma conversa é acesso que precisa ficar
// registrado. Falha ao auditar NUNCA derruba o atendimento.

import prisma from "@db";

export const CHAT_AUDIT_ACTIONS = {
  VIEW: "view",
  ASSIGN: "assign",
  CLOSE: "close",
  EXPORT: "export",
  TRANSFER: "assign",
  UPDATE: "update",
  SEND: "send",
} as const;

/**
 * O que foi auditado. Visibilidade do atendente é sobre a pessoa, não a
 * conversa; o disparo em massa registra a execução (ou a mensagem, no Status).
 */
export const CHAT_AUDIT_ENTITIES = {
  SESSION: "chat_session",
  ATTENDANT: "chat_attendant",
  DISPARO: "chat_disparo",
} as const;
type ChatAuditEntity = (typeof CHAT_AUDIT_ENTITIES)[keyof typeof CHAT_AUDIT_ENTITIES];

/** O workspace do chat é o SLUG; a trilha exige o uuid do workspace do Plane. */
async function resolveWorkspaceId(slug: string): Promise<string | null> {
  try {
    const rows = (await prisma.$queryRaw`
      SELECT id::text AS id FROM workspaces WHERE slug = ${slug} AND deleted_at IS NULL LIMIT 1
    `) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

function clientIp(headers: any): string | null {
  const get = (key: string) => (typeof headers?.get === "function" ? headers.get(key) : headers?.[key]);
  const forwarded: string | undefined = get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || null;
  return get("x-real-ip") ?? null;
}

export async function recordChatAudit(args: {
  workspaceSlug: string;
  /** Id do registro auditado: a conversa, o atendente (ATTENDANT) ou o envio (DISPARO). */
  sessionId: string;
  entity?: ChatAuditEntity;
  action: string;
  userId?: string | null;
  headers?: any;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const workspaceId = await resolveWorkspaceId(args.workspaceSlug);
    if (!workspaceId) return; // workspace desconhecido → nada a auditar

    const email = args.userId
      ? ((await prisma.$queryRaw`SELECT email FROM users WHERE id::text = ${args.userId} LIMIT 1`) as Array<{ email: string }>)[0]
          ?.email ?? null
      : null;

    await prisma.$executeRaw`
      INSERT INTO audit_logs (id, created_at, workspace_id, actor_id, actor_email, actor_ip, entity, entity_id, action, changes, metadata)
      VALUES (
        gen_random_uuid(), NOW(), ${workspaceId}::uuid,
        ${args.userId ?? null}::uuid, ${email}, ${clientIp(args.headers)},
        ${args.entity ?? CHAT_AUDIT_ENTITIES.SESSION}, ${args.sessionId}, ${args.action},
        '{}'::jsonb, ${JSON.stringify({ ...args.metadata, origem: "chat" })}::jsonb
      )`;
  } catch (e) {
    console.error("[chat-audit] falha ao registrar evento:", e);
  }
}
