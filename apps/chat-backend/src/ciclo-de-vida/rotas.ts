/**
 * Rotas do ciclo de vida da conversa, para o atendente (`chat.atender`):
 * encerrar com classificação, pausar e retomar, reenviar mensagem que falhou,
 * vincular o chamado aberto a partir da conversa e ler o catálogo de motivos.
 *
 * Toda rota confere que a conversa é do espaço da URL: o `workspaceId` do chat
 * é o slug, e sem essa conferência o id de outra conversa bastaria.
 */

import { Elysia } from "elysia";
import prisma from "@db";
import { authorizeChat, isNegado } from "@/acesso";
import { linkChamado } from "@/chamado";
import { parseCatalogoDeMotivos } from "@/ciclo-de-vida/encerramento-regras";
import { pauseAtendimento, resumeAtendimento } from "@/ciclo-de-vida/pausa";
import { EncerramentoError, closeWithEncerramento, type DadosDoEncerramento } from "@/encerramento";
import { serializeMessage } from "@/messages";
import { resendMessage } from "@/outbound";
import { CHAT_ACTION } from "@/permissoes";
import { semAvaliacao, serializeSession } from "@/sessoes";

type Set = { status?: number | string };

const NAO_ENCONTRADO = { detail: "Atendimento não encontrado." };

function deny(set: Set, status: number, body: unknown) {
  set.status = status;
  return body;
}

const isDoEspaco = async (sessionId: string, slug: string) =>
  Boolean(await prisma.chatSession.findFirst({ where: { id: sessionId, workspaceId: slug }, select: { id: true } }));

const readSessao = async (id: string) =>
  semAvaliacao(serializeSession(await prisma.chatSession.findUniqueOrThrow({ where: { id } })));

/** Pausar/retomar: 409 quando a conversa não está na situação de partida. */
const changePausa =
  (mudar: (id: string) => Promise<boolean>, conflito: string) =>
  async ({
    params: { slug, id },
    headers,
    set,
  }: {
    params: { slug: string; id: string };
    headers: unknown;
    set: Set;
  }) => {
    const acesso = await authorizeChat(slug, headers, CHAT_ACTION.ATENDER);
    if (isNegado(acesso)) return deny(set, acesso.status, acesso.body);
    if (!(await isDoEspaco(id, slug))) return deny(set, 404, NAO_ENCONTRADO);
    if (!(await mudar(id))) return deny(set, 409, { detail: conflito });
    return readSessao(id);
  };

export const cicloDeVidaModule = new Elysia()
  .post("/workspaces/:slug/sessions/:id/close/", async ({ params: { slug, id }, body, headers, set }) => {
    const acesso = await authorizeChat(slug, headers, CHAT_ACTION.ATENDER);
    if (isNegado(acesso)) return deny(set, acesso.status, acesso.body);
    if (!(await isDoEspaco(id, slug))) return deny(set, 404, NAO_ENCONTRADO);
    try {
      await closeWithEncerramento(id, (body ?? {}) as DadosDoEncerramento, acesso.userId);
    } catch (e) {
      if (e instanceof EncerramentoError) return deny(set, e.status, { detail: e.message });
      throw e;
    }
    return readSessao(id);
  })

  .post(
    "/workspaces/:slug/sessions/:id/pause/",
    changePausa(pauseAtendimento, "Só é possível pausar uma conversa em atendimento.")
  )
  .post("/workspaces/:slug/sessions/:id/resume/", changePausa(resumeAtendimento, "Esta conversa não está em pausa."))

  .post("/workspaces/:slug/messages/:id/resend/", async ({ params: { slug, id }, headers, set }) => {
    const acesso = await authorizeChat(slug, headers, CHAT_ACTION.ATENDER);
    if (isNegado(acesso)) return deny(set, acesso.status, acesso.body);
    const mensagem = await prisma.chatMessage.findFirst({
      where: { id, session: { workspaceId: slug } },
      select: { id: true },
    });
    if (!mensagem) return deny(set, 404, { detail: "Mensagem não encontrada." });
    const reenviada = await resendMessage(id);
    if (!reenviada) return deny(set, 409, { detail: "Só é possível reenviar mensagem que falhou." });
    return serializeMessage(reenviada, { full: true });
  })

  .post("/workspaces/:slug/sessions/:id/chamado/", async ({ params: { slug, id }, body, headers, set }) => {
    const acesso = await authorizeChat(slug, headers, CHAT_ACTION.ATENDER);
    if (isNegado(acesso)) return deny(set, acesso.status, acesso.body);
    if (!(await isDoEspaco(id, slug))) return deny(set, 404, NAO_ENCONTRADO);
    const issueId = String((body as { issue_id?: unknown } | null)?.issue_id ?? "");
    const vinculada = issueId ? await linkChamado(id, issueId) : null;
    if (!vinculada) return deny(set, 404, { detail: "Chamado não encontrado para esta conversa." });
    return readSessao(id);
  })

  .get("/workspaces/:slug/close-reasons/", async ({ params: { slug }, headers, set }) => {
    const acesso = await authorizeChat(slug, headers, CHAT_ACTION.ATENDER);
    if (isNegado(acesso)) return deny(set, acesso.status, acesso.body);
    const cfg =
      (await prisma.botConfig.findUnique({ where: { workspaceId: slug }, select: { closeReasons: true } })) ??
      (await prisma.botConfig.create({ data: { workspaceId: slug }, select: { closeReasons: true } }));
    return { results: parseCatalogoDeMotivos(cfg.closeReasons) };
  });
