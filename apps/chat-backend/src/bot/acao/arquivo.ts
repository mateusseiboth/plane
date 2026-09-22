/**
 * Arquivo que o cliente mandou para o robô (o currículo em PDF).
 *
 * A mensagem já está gravada quando o motor roda: o webhook persiste antes de
 * chamar o robô. Mídia do WhatsApp fica como `ext:<url>` e só é baixada por
 * https (mesma regra do chamado aberto a partir da conversa); o resto está no
 * storage do chat.
 */
import prisma from "@db";
import type { ArquivoDaMensagem } from "@/bot/acao/tipos";
import { serveMedia } from "@/storage";

const TAMANHO_MAXIMO = 10 * 1024 * 1024;

export async function findArquivoDoCliente(sessionId: string): Promise<ArquivoDaMensagem | null> {
  const ultima = await prisma.chatMessage.findFirst({
    where: { sessionId, sender: "client" },
    orderBy: { createdAt: "desc" },
    select: { id: true, mediaKey: true, mediaMime: true, mediaName: true },
  });
  if (!ultima?.mediaKey) return null;
  return { messageId: ultima.id, mime: ultima.mediaMime, name: ultima.mediaName };
}

async function readExterno(url: string): Promise<Blob | null> {
  if (!url.startsWith("https://")) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const blob = await res.blob();
  return blob.size > 0 && blob.size <= TAMANHO_MAXIMO ? blob : null;
}

async function readDoStorage(key: string, mime: string | null): Promise<Blob | null> {
  const res = await serveMedia(key, mime);
  return res ? res.blob() : null;
}

export async function readArquivoDaMensagem(messageId: string): Promise<Blob | null> {
  try {
    const msg = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { mediaKey: true, mediaMime: true },
    });
    if (!msg?.mediaKey) return null;
    if (msg.mediaKey.startsWith("ext:")) return await readExterno(msg.mediaKey.slice(4));
    return await readDoStorage(msg.mediaKey, msg.mediaMime);
  } catch (e) {
    console.error("[robo] arquivo da mensagem", e);
    return null;
  }
}
