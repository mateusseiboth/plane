// Edição e remoção de mensagens — caminho único para atendente, cliente e para
// as notificações vindas do WhatsApp.
//
// Regras (validadas no servidor, não só na UI):
//  - atendente edita/apaga apenas as PRÓPRIAS mensagens (senderUserId dele);
//  - cliente edita/apaga apenas mensagens `client` da própria sessão;
//  - só mensagens de texto podem ser editadas; qualquer mensagem própria pode
//    ser apagada;
//  - mensagem já apagada não pode ser editada nem apagada de novo;
//  - quando a sessão é de WhatsApp e conhecemos o id da mensagem no provedor,
//    a alteração é propagada para o WhatsApp.

import prisma from "@db";
import { broadcastMessageDelete, broadcastMessageEdit } from "@/messages";
import { getProvider } from "@/providers/provider";

export type Actor =
  | { kind: "attendant"; userId: string }
  | { kind: "client"; sessionId: string }
  | { kind: "provider" }; // notificação do próprio WhatsApp: já aconteceu lá

export type ActionResult = { ok: true } | { ok: false; reason: string };

const NOT_FOUND: ActionResult = { ok: false, reason: "Mensagem não encontrada." };
const FORBIDDEN: ActionResult = { ok: false, reason: "Você só pode alterar as suas próprias mensagens." };
const ALREADY_DELETED: ActionResult = { ok: false, reason: "Mensagem já apagada." };

function canAct(message: { sender: string; senderUserId: string | null; sessionId: string }, actor: Actor): boolean {
  if (actor.kind === "provider") return true;
  if (actor.kind === "attendant") return message.sender === "attendant" && message.senderUserId === actor.userId;
  return message.sender === "client" && message.sessionId === actor.sessionId;
}

async function forwardToWhatsApp(
  message: { sessionId: string; externalId: string | null },
  apply: (provider: Awaited<ReturnType<typeof getProvider>>, phone: string, externalId: string) => Promise<void>
) {
  if (!message.externalId) return;
  const session = await prisma.chatSession.findUnique({ where: { id: message.sessionId } });
  if (!session || session.channel !== "whatsapp" || !session.clientPhone) return;
  try {
    const resolved = await getProvider(session.workspaceId);
    if (resolved) await apply(resolved, session.clientPhone, message.externalId);
  } catch (e) {
    console.error("[message-actions] propagação para o WhatsApp falhou:", e);
  }
}

export async function editMessage(messageId: string, text: string, actor: Actor): Promise<ActionResult> {
  const existing = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!existing) return NOT_FOUND;
  if (existing.deletedAt) return ALREADY_DELETED;
  if (!canAct(existing, actor)) return FORBIDDEN;
  if (existing.type !== "text") return { ok: false, reason: "Só mensagens de texto podem ser editadas." };

  // Preserva a versão anterior para auditoria (visível apenas a gestores).
  const history = Array.isArray(existing.editHistory) ? (existing.editHistory as any[]) : [];
  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: {
      text,
      editedAt: new Date(),
      editHistory: [...history, { text: existing.text ?? "", edited_at: (existing.editedAt ?? existing.createdAt).toISOString() }],
    },
  });

  broadcastMessageEdit(updated.sessionId, updated);
  if (actor.kind !== "provider") {
    await forwardToWhatsApp(updated, (resolved, phone, externalId) =>
      resolved!.provider.editText(phone, externalId, text)
    );
  }
  return { ok: true };
}

export async function deleteMessage(messageId: string, actor: Actor): Promise<ActionResult> {
  const existing = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!existing) return NOT_FOUND;
  if (existing.deletedAt) return ALREADY_DELETED;
  if (!canAct(existing, actor)) return FORBIDDEN;

  const deleted = await prisma.chatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date() } });

  broadcastMessageDelete(deleted.sessionId, deleted);
  if (actor.kind !== "provider") {
    await forwardToWhatsApp(deleted, (resolved, phone, externalId) =>
      resolved!.provider.deleteMessage(phone, externalId)
    );
  }
  return { ok: true };
}

/** Edição/remoção anunciada pelo provedor: aplica localmente sem devolver ao WhatsApp. */
export async function applyProviderMutation(externalId: string, mutation: { text?: string; deleted?: boolean }) {
  const message = await prisma.chatMessage.findFirst({ where: { externalId } });
  if (!message) return;
  if (mutation.deleted) return void (await deleteMessage(message.id, { kind: "provider" }));
  if (typeof mutation.text === "string") await editMessage(message.id, mutation.text, { kind: "provider" });
}
