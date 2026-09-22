/**
 * Webhook da Z-API (`/providers/zapi/webhook/:slug/`): tudo que o cliente faz no
 * WhatsApp chega por aqui.
 *
 * Saiu do `index.ts` para caber inteiro num lugar: token do espaço, descarte de
 * mensagem velha, edição/remoção, reação, chamada perdida, pesquisa de
 * satisfação, pergunta de inatividade e retomada da pausa.
 */

import { Elysia } from "elysia";
import prisma from "@db";
import { startBot, handleInboundClient } from "@/bot/engine";
import { handleRespostaDeInatividade } from "@/ciclo-de-vida/inatividade";
import { resumeAtendimento } from "@/ciclo-de-vida/pausa";
import { applyProviderMutation } from "@/message-actions";
import { persistAndBroadcast } from "@/messages";
import { nextProtocol } from "@/protocol";
import { getProvider, type InboundMessage, type WhatsAppProvider } from "@/providers/provider";
import { handleRatingReply } from "@/rating";
import { isMensagemAntiga, isWebhookAutorizado } from "@/webhook/regras";

const OK = { ok: true } as const;
const AVISO_DE_CHAMADA_PERDIDA = "O cliente tentou ligar pelo WhatsApp e a chamada não foi atendida.";

/** Conversa escrita aberta deste telefone. `phone` é a ligação do W06: outra coisa. */
const findSessaoAberta = (slug: string, phone: string) =>
  prisma.chatSession.findFirst({
    where: { workspaceId: slug, channel: "whatsapp", clientPhone: phone, status: { not: "closed" } },
    orderBy: { createdAt: "desc" },
  });

async function handleReacao(slug: string, inbound: InboundMessage) {
  const sessao = await findSessaoAberta(slug, inbound.phone);
  if (!sessao) return;
  const reagida = inbound.reaction?.externalId
    ? await prisma.chatMessage.findFirst({ where: { sessionId: sessao.id, externalId: inbound.reaction.externalId } })
    : null;
  await persistAndBroadcast({
    sessionId: sessao.id,
    sender: "client",
    type: "text",
    text: `Reagiu com ${inbound.reaction?.emoji ?? ""}`.trim(),
    senderName: inbound.senderName ?? sessao.clientName ?? null,
    replyToId: reagida?.id ?? null,
    externalId: inbound.externalId ?? null,
  });
}

/** Sem conversa aberta, a chamada perdida não abre uma: o robô responderia a quem só ligou. */
async function handleChamadaPerdida(slug: string, inbound: InboundMessage) {
  const sessao = await findSessaoAberta(slug, inbound.phone);
  if (!sessao) return;
  await persistAndBroadcast({ sessionId: sessao.id, sender: "system", type: "event", text: AVISO_DE_CHAMADA_PERDIDA });
}

async function findOrCreateSessao(slug: string, inbound: InboundMessage) {
  let contact = await prisma.contact.findFirst({ where: { workspaceId: slug, phone: inbound.phone } });
  if (!contact)
    contact = await prisma.contact.create({
      data: { workspaceId: slug, phone: inbound.phone, name: inbound.senderName ?? null },
    });

  // Aberta, OU recém-encerrada ainda esperando a nota: a resposta "5" continua a
  // pesquisa em vez de abrir conversa nova com o robô.
  const existente = await prisma.chatSession.findFirst({
    where: {
      workspaceId: slug,
      channel: "whatsapp",
      clientPhone: inbound.phone,
      OR: [
        { status: { not: "closed" } },
        { status: "closed", ratingState: { in: ["awaiting_score", "awaiting_comment"] } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  if (existente) return { sessao: existente, contact, isNova: false };
  const sessao = await prisma.chatSession.create({
    data: {
      workspaceId: slug,
      channel: "whatsapp",
      contactId: contact.id,
      clientPhone: inbound.phone,
      clientName: contact.name,
      protocol: await nextProtocol(slug),
      status: "bot",
      botState: "new",
    },
  });
  return { sessao, contact, isNova: true };
}

type Sessao = Awaited<ReturnType<typeof findOrCreateSessao>>["sessao"];

/** O que acontece depois de a mensagem do cliente estar gravada, pela situação da conversa. */
const SEGUIMENTO: Record<string, (sessao: Sessao, texto: string, isNova: boolean) => Promise<unknown>> = {
  closed: (sessao, texto) => handleRatingReply(sessao, texto),
  active: (sessao, texto) => handleRespostaDeInatividade(sessao.id, texto),
  paused: (sessao) => resumeAtendimento(sessao.id),
};

const followBot = (sessao: Sessao, texto: string, isNova: boolean) =>
  isNova ? startBot(sessao.id) : handleInboundClient(sessao.id, texto);

async function handleMensagem(slug: string, inbound: InboundMessage) {
  const { sessao, contact, isNova } = await findOrCreateSessao(slug, inbound);
  await persistAndBroadcast({
    sessionId: sessao.id,
    sender: "client",
    type: inbound.type as "text" | "image" | "video" | "audio" | "file",
    text: inbound.text ?? null,
    senderName: inbound.senderName ?? contact.name ?? null,
    mediaMime: inbound.mediaMime ?? null,
    mediaName: inbound.mediaName ?? null,
    externalId: inbound.externalId ?? null,
    // WhatsApp media URLs are external; the attendant UI renders them directly.
    mediaKey: inbound.mediaUrl ? `ext:${inbound.mediaUrl}` : null,
  });
  await (SEGUIMENTO[sessao.status] ?? followBot)(sessao, inbound.text ?? "", isNova);
}

const TRATAMENTO_POR_TIPO: Partial<
  Record<InboundMessage["type"], (slug: string, inbound: InboundMessage) => Promise<void>>
> = {
  reaction: handleReacao,
  call_missed: handleChamadaPerdida,
};

/** Edição/remoção feita pelo cliente: altera a mensagem existente, não cria outra. */
async function applyMutacao(provider: WhatsAppProvider, body: unknown): Promise<boolean> {
  const mutation = provider.parseWebhookMutation(body);
  if (!mutation) return false;
  if (mutation.kind === "edit") await applyProviderMutation(mutation.externalId, { text: mutation.text });
  if (mutation.kind === "delete")
    await Promise.all(mutation.externalIds.map((id) => applyProviderMutation(id, { deleted: true })));
  return true;
}

const isDuplicada = async (externalId?: string) =>
  Boolean(externalId && (await prisma.chatMessage.findFirst({ where: { externalId }, select: { id: true } })));

export const zapiWebhookModule = new Elysia().post(
  "/providers/zapi/webhook/:slug/",
  async ({ params: { slug }, body, headers, query, set }) => {
    const resolved = await getProvider(slug);
    if (!resolved) return OK;
    const autorizado = isWebhookAutorizado(resolved.config.webhookToken, {
      header: headers["client-token"],
      query: (query as Record<string, string | undefined>)?.token,
    });
    if (!autorizado) {
      set.status = 401;
      return { detail: "Token do webhook inválido." };
    }
    if (await applyMutacao(resolved.provider, body)) return OK;

    const inbound = resolved.provider.parseWebhook(body);
    if (!inbound || isMensagemAntiga(inbound.momentMs, Date.now()) || (await isDuplicada(inbound.externalId)))
      return OK;
    await (TRATAMENTO_POR_TIPO[inbound.type] ?? handleMensagem)(slug, inbound);
    return OK;
  }
);
