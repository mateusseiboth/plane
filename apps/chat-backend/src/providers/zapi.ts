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
    const base = {externalId: body.messageId, phone, senderName: body.senderName || body.chatName};
    if (body.text?.message) return {...base, type: "text", text: body.text.message};
    if (body.image)
      return {...base, type: "image", mediaUrl: body.image.imageUrl, mediaMime: body.image.mimeType, text: body.image.caption};
    if (body.audio) return {...base, type: "audio", mediaUrl: body.audio.audioUrl, mediaMime: body.audio.mimeType};
    if (body.video)
      return {...base, type: "video", mediaUrl: body.video.videoUrl, mediaMime: body.video.mimeType, text: body.video.caption};
    if (body.document)
      return {
        ...base,
        type: "file",
        mediaUrl: body.document.documentUrl,
        mediaMime: body.document.mimeType,
        mediaName: body.document.fileName,
      };
    return null;
  }
}
