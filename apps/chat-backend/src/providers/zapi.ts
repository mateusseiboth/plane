// Z-API (z-api.io) WhatsApp provider.
// Send:  POST {baseUrl}/instances/{instanceId}/token/{token}/send-text   etc.
//        header: Client-Token: {clientToken}
// Webhook (on-message-received): { phone, senderName, text:{message}, image:{...},
//        audio:{...}, video:{...}, document:{...}, messageId, fromMe, ... }

import type {InboundMessage, WhatsAppProvider} from "@/providers/provider";

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

  private async post(action: string, body: Record<string, unknown>): Promise<void> {
    const res = await fetch(this.url(action), {
      method: "POST",
      headers: {"Content-Type": "application/json", "Client-Token": this.clientToken},
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Z-API ${action} failed: ${res.status} ${txt}`);
    }
  }

  async sendText(phone: string, text: string): Promise<void> {
    await this.post("send-text", {phone, message: text});
  }

  async sendMedia(phone: string, media: {url?: string; base64?: string; mime: string; name?: string; type: string}): Promise<void> {
    const payload = media.url ?? media.base64 ?? "";
    if (media.type === "image") return await this.post("send-image", {phone, image: payload});
    if (media.type === "video") return await this.post("send-video", {phone, video: payload});
    if (media.type === "audio") return await this.post("send-audio", {phone, audio: payload});
    return await this.post("send-document/" + (media.name?.split(".").pop() || "bin"), {phone, document: payload, fileName: media.name});
  }

  parseWebhook(body: any): InboundMessage | null {
    if (!body || body.fromMe) return null; // ignore our own outgoing echoes
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
