/**
 * Os arquivos da conversa do chat, copiados para o chamado.
 *
 * O chat guarda o binário no próprio storage e o serve em `/media/<chave>`; o
 * que veio do WhatsApp fica na URL da Z-API (`ext:<url>`). A API busca cada um
 * e grava pelo MESMO caminho do anexo do portal (`file_assets` +
 * `issue_attachments`, ver modules/portal/anexos.ts), então o chamado mostra o
 * arquivo como qualquer outro anexo.
 *
 * A URL externa foi escrita por quem chamou o webhook: só https, para a API não
 * virar ponte para endereço interno.
 */

import { randomUUID } from "crypto";
import prisma from "@db";
import { ENTIDADE_CHAMADO } from "@modules/portal/anexos";
import { saveAsset } from "@utils/storage";

/** Onde a API alcança o chat-backend (rede interna do compose). */
export const CHAT_INTERNAL_URL = (process.env.CHAT_INTERNAL_URL || "http://chat-backend:8002").replace(/\/$/, "");

const LIMITES = { porChamado: 20, tamanho: 25 * 1024 * 1024, tempoMs: 15_000 } as const;
const ORIGEM = "chat";

const EXTENSAO_POR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/webm": "webm",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

export type MensagemComArquivo = {
  media_key: string | null;
  media_mime: string | null;
  media_name: string | null;
  type: string;
};

export function buildUrlDoAnexo(chave: string | null, chatUrl: string): string | null {
  if (!chave) return null;
  if (chave.startsWith("ext:")) {
    const externa = chave.slice(4);
    return externa.startsWith("https://") ? externa : null;
  }
  if (!chatUrl) return null;
  return `${chatUrl}/media/${chave.split("/").map(encodeURIComponent).join("/")}`;
}

export function buildNomeDoAnexo(
  m: Pick<MensagemComArquivo, "media_name" | "type" | "media_mime">,
  indice: number
): string {
  if (m.media_name?.trim()) return m.media_name.trim().slice(0, 200);
  return `${m.type}-${indice + 1}.${EXTENSAO_POR_MIME[m.media_mime ?? ""] ?? "bin"}`;
}

async function fetchArquivo(url: string): Promise<Blob | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(LIMITES.tempoMs) });
  if (!res.ok) return null;
  const arquivo = await res.blob();
  return arquivo.size > 0 && arquivo.size <= LIMITES.tamanho ? arquivo : null;
}

type Destino = { issueId: string; projectId: string; workspaceId: string };

async function saveAnexo(destino: Destino, m: MensagemComArquivo, indice: number, chatUrl: string): Promise<boolean> {
  const url = buildUrlDoAnexo(m.media_key, chatUrl);
  const arquivo = url ? await fetchArquivo(url).catch(() => null) : null;
  if (!arquivo) return false;
  const id = randomUUID();
  const tipo = m.media_mime || arquivo.type || "application/octet-stream";
  const atributos = { name: buildNomeDoAnexo(m, indice), type: tipo, size: arquivo.size, origem: ORIGEM };
  await prisma.fileAsset.create({
    data: {
      id,
      workspaceId: destino.workspaceId,
      projectId: destino.projectId,
      entityType: ENTIDADE_CHAMADO,
      entityId: destino.issueId,
      asset: `issues/${destino.issueId}/chat/${id}`,
      size: arquivo.size,
      mimeType: tipo,
      attributes: atributos,
      isUploaded: false,
    },
  });
  await saveAsset(id, arquivo);
  await prisma.fileAsset.update({ where: { id }, data: { isUploaded: true } });
  await prisma.issueAttachment.create({
    data: { ...destino, asset: id, attributes: atributos, externalSource: ORIGEM },
  });
  return true;
}

/**
 * Copia os arquivos (no máximo 20) um por vez. Arquivo que não chega (fora do
 * ar, grande demais, URL recusada) é contado e pulado: o chamado abre mesmo
 * assim, e a transcrição já registra o nome de cada arquivo.
 */
export async function copyAnexosDaConversa(
  destino: Destino,
  mensagens: MensagemComArquivo[],
  chatUrl = CHAT_INTERNAL_URL
) {
  const comArquivo = mensagens.filter((m) => m.media_key).slice(0, LIMITES.porChamado);
  const resultados = await comArquivo.reduce<Promise<boolean[]>>(
    async (anteriores, m, i) => [...(await anteriores), await saveAnexo(destino, m, i, chatUrl).catch(() => false)],
    Promise.resolve([])
  );
  const copiados = resultados.filter(Boolean).length;
  return { copiados, falharam: resultados.length - copiados };
}
