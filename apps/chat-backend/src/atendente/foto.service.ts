/**
 * Copia a foto de perfil do WhatsApp para o storage do chat e grava o endereço
 * em `entity_contacts.photo` (regras em `foto.ts`). Chamado pelo webhook da
 * Z-API depois que a conversa identificou o responsável.
 *
 * Nunca lança: foto é enfeite, e uma falha aqui não pode atrapalhar a mensagem
 * do cliente. Só baixa por https (o link vem de terceiro) e só grava imagem de
 * até 2 MB.
 */

import prisma from "@db";
import { buildChaveDaFoto, buildUrlDaFoto, isFotoVencida } from "@/atendente/foto";
import { saveFotoDoResponsavel } from "@/atendente/plane.dao";
import { findResponsavelPorId } from "@/responsaveis";
import { saveMedia } from "@/storage";

const LIMITE_DA_FOTO = 2 * 1024 * 1024;

/** Mesma base do endereço das mídias enviadas ao WhatsApp (outbound.ts). */
const BASE_PUBLICA = (process.env.CHAT_PUBLIC_URL || "/chat-api").replace(/\/$/, "");

type Opcoes = { agora?: Date; baixar?: (url: string) => Promise<Response> };

const isHttps = (url: string) => /^https:\/\//i.test(url);

async function downloadImagem(url: string, baixar: (url: string) => Promise<Response>): Promise<Blob | null> {
  const resposta = await baixar(url);
  const tipo = resposta.headers.get("content-type") ?? "";
  if (!resposta.ok || !tipo.startsWith("image/")) return null;
  const imagem = await resposta.blob();
  return imagem.size > 0 && imagem.size <= LIMITE_DA_FOTO ? imagem : null;
}

export async function refreshFotoDoResponsavel(
  slug: string,
  entityContactId: string,
  url: string,
  opcoes: Opcoes = {}
): Promise<void> {
  const agora = opcoes.agora ?? new Date();
  try {
    if (!isHttps(url)) return;
    const responsavel = await findResponsavelPorId(slug, entityContactId);
    if (!responsavel || !isFotoVencida(responsavel.photo, agora)) return;
    const imagem = await downloadImagem(
      url,
      opcoes.baixar ?? ((u) => fetch(u, { signal: AbortSignal.timeout(10_000) }))
    );
    if (!imagem) return;
    await saveMedia(buildChaveDaFoto(entityContactId), imagem);
    await saveFotoDoResponsavel(entityContactId, buildUrlDaFoto(BASE_PUBLICA, entityContactId, agora));
  } catch (e) {
    console.error("[foto do responsável]", e);
  }
}

/** Depois da mensagem gravada: se a conversa já sabe quem é o responsável, atualiza a foto. */
export async function refreshFotoDaSessao(sessionId: string, url: string | undefined): Promise<void> {
  if (!url) return;
  const sessao = await prisma.chatSession
    .findUnique({ where: { id: sessionId }, select: { workspaceId: true, entityContactId: true } })
    .catch(() => null);
  if (!sessao?.entityContactId) return;
  await refreshFotoDoResponsavel(sessao.workspaceId, sessao.entityContactId, url);
}
