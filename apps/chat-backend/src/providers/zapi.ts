// Z-API (z-api.io) WhatsApp provider.
// Send:  POST {baseUrl}/instances/{instanceId}/token/{token}/send-text   etc.
//        header: Client-Token: {clientToken}
// Webhook (on-message-received): { phone, senderName, text:{message}, image:{...},
//        audio:{...}, video:{...}, document:{...}, messageId, fromMe, ... }

import type {InboundMessage, InboundMutation, WhatsAppProvider} from "@/providers/provider";

export class ZapiProvider implements WhatsAppProvider {
  private baseUrl: string;
  private instanceId: string;
  private token: string;
  private clientToken: string;

  constructor(config: {baseUrl?: string | null; instanceId?: string | null; token?: string | null; clientToken?: string | null}) {
    this.baseUrl = (config.baseUrl || "https://api.z-api.io").replace(/\/$/, "");
    this.instanceId = config.instanceId || "";
    this.token = config.token || "";
    this.clientToken = config.clientToken || "";
  }

  private url(action: string): string {
    return `${this.baseUrl}/instances/${this.instanceId}/token/${this.token}/${action}`;
  }

  private async request(
    method: "POST" | "DELETE",
    action: string,
    body?: Record<string, unknown>
  ): Promise<string | null> {
    const res = await fetch(this.url(action), {
      method,
      headers: {"Content-Type": "application/json", "Client-Token": this.clientToken},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Z-API ${action} failed: ${res.status} ${txt}`);
    }
    const data = (await res.json().catch(() => null)) as {messageId?: string; id?: string} | null;
    return data?.messageId ?? data?.id ?? null;
  }

  private async post(action: string, body: Record<string, unknown>): Promise<string | null> {
    return await this.request("POST", action, body);
  }

  async sendText(phone: string, text: string): Promise<string | null> {
    return await this.post("send-text", {phone, message: text});
  }

  async sendMedia(phone: string, media: {url?: string; base64?: string; mime: string; name?: string; type: string}): Promise<string | null> {
    const payload = media.url ?? media.base64 ?? "";
    if (media.type === "image") return await this.post("send-image", {phone, image: payload});
    if (media.type === "video") return await this.post("send-video", {phone, video: payload});
    if (media.type === "audio") return await this.post("send-audio", {phone, audio: payload});
    return await this.post("send-document/" + (media.name?.split(".").pop() || "bin"), {phone, document: payload, fileName: media.name});
  }

  async editText(phone: string, externalId: string, text: string): Promise<void> {
    await this.post("edit-message", {phone, messageId: externalId, message: text});
  }

  async deleteMessage(phone: string, externalId: string): Promise<void> {
    // DELETE /messages?messageId=&phone=&owner=true — só apagamos o que nós enviamos.
    const query = `messages?messageId=${encodeURIComponent(externalId)}&phone=${encodeURIComponent(phone)}&owner=true`;
    await this.request("DELETE", query);
  }

  /**
   * Edição/remoção feita pelo cliente. A Z-API sinaliza edição no próprio webhook
   * de mensagem (`isEdit`/`isEdited`) e remoção num callback dedicado
   * (`type: "DeleteCallback"` ou `notification: "MESSAGE_DELETED"`), cujo formato
   * varia entre versões — daí a leitura tolerante dos vários campos possíveis.
   */
  parseWebhookMutation(body: any): InboundMutation | null {
    if (!body || body.fromMe) return null;

    const isDelete =
      body.type === "DeleteCallback" ||
      body.notification === "MESSAGE_DELETED" ||
      body.isDeleted === true ||
      body.deleted === true;
    if (isDelete) {
      const ids = [body.messageId, body.referenceMessageId, ...(Array.isArray(body.ids) ? body.ids : [])]
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
      if (ids.length === 0) return null;
      return {kind: "delete", phone: body.phone ?? body.participantPhone, externalIds: ids};
    }

    const isEdit = body.isEdit === true || body.isEdited === true || body.type === "EditCallback";
    if (!isEdit) return null;
    const externalId: string | undefined = body.referenceMessageId ?? body.messageId;
    const text: string | undefined = body.text?.message ?? body.message;
    const phone: string | undefined = body.phone ?? body.participantPhone;
    if (!externalId || typeof text !== "string" || !phone) return null;
    return {kind: "edit", phone, externalId, text};
  }

  parseWebhook(body: any): InboundMessage | null {
    if (!body || body.fromMe) return null; // ignore our own outgoing echoes
    // Edições/remoções seguem por parseWebhookMutation, não criam mensagem nova.
    if (this.parseWebhookMutation(body)) return null;
    const phone: string | undefined = body.phone || body.participantPhone;
    if (!phone) return null;
    const base: Base = {
      externalId: body.messageId,
      phone,
      senderName: body.senderName || body.chatName,
      ...(typeof body.momment === "number" ? {momentMs: body.momment} : {}),
    };
    const leitor = LEITORES.find(([aplica]) => aplica(body));
    return leitor ? leitor[1](body, base) : null;
  }
}

type Base = Pick<InboundMessage, "externalId" | "phone" | "senderName" | "momentMs">;
type Leitor = [aplica: (body: any) => boolean, ler: (body: any, base: Base) => InboundMessage];

const CHAMADA_PERDIDA = new Set(["CALL_MISSED_VOICE", "CALL_MISSED_VIDEO"]);

const describeContato = (contato: any): string => {
  const telefones = Array.isArray(contato.phones) ? contato.phones.filter(Boolean).join(", ") : "";
  return ["Contato compartilhado:", contato.displayName || "sem nome", telefones ? `(${telefones})` : ""]
    .filter(Boolean)
    .join(" ");
};

/**
 * Um leitor por formato de mensagem da Z-API. Formato novo = uma linha aqui,
 * nenhum `if` mexido. A legenda da imagem vem em `image.caption`, não em
 * `text`, então a ordem só importa para a chamada perdida, que vem primeiro.
 */
const LEITORES: Leitor[] = [
  [(b) => CHAMADA_PERDIDA.has(b.notification), (_b, base) => ({...base, type: "call_missed"})],
  [(b) => Boolean(b.text?.message), (b, base) => ({...base, type: "text", text: b.text.message})],
  [
    (b) => Boolean(b.reaction),
    (b, base) => ({
      ...base,
      type: "reaction",
      reaction: {emoji: String(b.reaction.value ?? ""), externalId: b.reaction.referencedMessage?.messageId ?? null},
    }),
  ],
  [
    (b) => Boolean(b.image),
    (b, base) => ({...base, type: "image", mediaUrl: b.image.imageUrl, mediaMime: b.image.mimeType, text: b.image.caption}),
  ],
  [
    (b) => Boolean(b.sticker),
    (b, base) => ({
      ...base,
      type: "image",
      mediaUrl: b.sticker.stickerUrl,
      mediaMime: b.sticker.mimeType ?? "image/webp",
      mediaName: "Figurinha",
    }),
  ],
  [(b) => Boolean(b.audio), (b, base) => ({...base, type: "audio", mediaUrl: b.audio.audioUrl, mediaMime: b.audio.mimeType})],
  [
    (b) => Boolean(b.video),
    (b, base) => ({...base, type: "video", mediaUrl: b.video.videoUrl, mediaMime: b.video.mimeType, text: b.video.caption}),
  ],
  [
    (b) => Boolean(b.document),
    (b, base) => ({
      ...base,
      type: "file",
      mediaUrl: b.document.documentUrl,
      mediaMime: b.document.mimeType,
      mediaName: b.document.fileName,
    }),
  ],
  [(b) => Boolean(b.contact), (b, base) => ({...base, type: "text", text: describeContato(b.contact)})],
];
