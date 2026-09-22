// WhatsApp provider abstraction. Start with Z-API; the chat core only depends on
// this interface, so swapping to Meta Cloud API later is a new implementation.

import prisma from "@db";

export type InboundMessage = {
  externalId?: string;
  phone: string;
  senderName?: string;
  /** `reaction` e `call_missed` não viram mensagem comum: ver src/webhook/zapi.ts. */
  type: "text" | "image" | "video" | "audio" | "file" | "reaction" | "call_missed";
  text?: string;
  mediaUrl?: string;
  mediaMime?: string;
  mediaName?: string;
  /** Reação do cliente a uma mensagem (id do provedor da mensagem reagida). */
  reaction?: { emoji: string; externalId: string | null };
  /** Instante da mensagem no WhatsApp (ms). Usado para descartar o que é velho. */
  momentMs?: number;
};

/** Edição/remoção feita pelo CLIENTE e notificada pelo provedor. */
export type InboundMutation =
  | { kind: "edit"; phone: string; externalId: string; text: string }
  | { kind: "delete"; phone?: string; externalIds: string[] };

/** Mídia de saída. `caption` é a legenda (imagem, vídeo e documento). */
export type MidiaDeSaida = { url?: string; base64?: string; mime: string; name?: string; type: string; caption?: string };

/** Uma mensagem parada na fila de saída do provedor (diagnóstico do disparo). */
export type ItemDaFilaDeSaida = { id: string | null; telefone: string | null; mensagem: string | null; criadaEm: string | null };

export interface WhatsAppProvider {
  /** Retorna o id da mensagem no provedor (necessário para editar/apagar depois). */
  sendText(phone: string, text: string): Promise<string | null>;
  sendMedia(phone: string, media: MidiaDeSaida): Promise<string | null>;
  /** Publica uma imagem no Status do WhatsApp da conta. */
  sendImageStatus(image: string): Promise<string | null>;
  /** O que o provedor ainda não entregou. */
  getFilaDeSaida(): Promise<ItemDaFilaDeSaida[]>;
  /** Edita uma mensagem já enviada por nós (id do provedor). */
  editText(phone: string, externalId: string, text: string): Promise<void>;
  /** Apaga uma mensagem já enviada por nós (id do provedor). */
  deleteMessage(phone: string, externalId: string): Promise<void>;
  /** Normalize a provider webhook body to InboundMessage (or null if irrelevant). */
  parseWebhook(body: any): InboundMessage | null;
  /** Detecta edição/remoção vinda do cliente no webhook (ou null). */
  parseWebhookMutation(body: any): InboundMutation | null;
}

export type ResolvedProvider = { provider: WhatsAppProvider; config: any };

export async function getProvider(workspaceId: string): Promise<ResolvedProvider | null> {
  const config = await prisma.providerConfig.findUnique({ where: { workspaceId } });
  if (!config || !config.isActive) return null;
  if (config.provider === "zapi") {
    const { ZapiProvider } = await import("@/providers/zapi");
    return { provider: new ZapiProvider(config), config };
  }
  return null;
}
