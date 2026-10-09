/**
 * Quem entra numa conversa pelas rotas que não levam o espaço na URL:
 * histórico, transcrição pelo protocolo, anexo e avaliação.
 *
 *  - O cliente entra com o token da própria conversa (`?token=`).
 *  - A equipe precisa atender no espaço DA CONVERSA (`chat.atender`) e
 *    enxergá-la pela mesma regra da lista (`isSessaoVisivel`): as próprias
 *    sempre, as dos outros com `chat.ver_todas`, fila e robô com `chat.ver_fila`.
 *    Conversa que a pessoa não enxerga responde 404, como se não existisse.
 *  - A transcrição pelo protocolo é só da equipe e pede apenas `chat.atender`
 *    no espaço da conversa, sem a regra da lista: o protocolo chega pelo link
 *    "Ver conversa" gravado no chamado, e quem atende o chamado (TI, Qualidade)
 *    precisa ler a conversa de outra pessoa. A nota continua cortada por
 *    `chat.ver_avaliacao` na rota.
 *
 * Antes bastava estar logado no Plane: qualquer conta lia o histórico de
 * qualquer espaço e o atendente gravava a nota do cliente na própria conversa.
 */

import prisma from "@db";
import { verifyClientToken } from "@/auth";
import { authorizeChat, isNegado, type Negado } from "@/acesso";
import { CHAT_ACTION, hasChatAction } from "@/permissoes";
import { isSessaoVisivel } from "@/visibilidade";

type SessaoDoAcesso = { id: string; workspaceId: string; status: string; assignedAttendantId: string | null };

export type AcessoDaEquipe = { papel: "attendant"; userId: string };
export type AcessoDaSessao = { papel: "client" } | AcessoDaEquipe;

export const NAO_ENCONTRADO: Negado = { status: 404, body: { detail: "Atendimento não encontrado." } };

/** A nota é do cliente: a equipe não grava nem sobrescreve. */
export const SO_O_CLIENTE_AVALIA: Negado = { status: 403, body: { detail: "Só o cliente avalia o atendimento." } };

export async function isClienteDaSessao(sessionId: string, token: unknown): Promise<boolean> {
  const claims = await verifyClientToken(typeof token === "string" ? token : null);
  return claims?.sessionId === sessionId;
}

export async function authorizeEquipeNaSessao(
  sessao: SessaoDoAcesso,
  headers: unknown
): Promise<AcessoDaEquipe | Negado> {
  const acesso = await authorizeChat(sessao.workspaceId, headers, CHAT_ACTION.ATENDER);
  if (isNegado(acesso)) return acesso;
  const [verTodas, verFila] = await Promise.all([
    hasChatAction(sessao.workspaceId, acesso.userId, CHAT_ACTION.VER_TODAS),
    hasChatAction(sessao.workspaceId, acesso.userId, CHAT_ACTION.VER_FILA),
  ]);
  if (!isSessaoVisivel({ userId: acesso.userId, verTodas, verFila }, sessao)) return NAO_ENCONTRADO;
  return { papel: "attendant", userId: acesso.userId };
}

export async function authorizeSessao(
  sessao: SessaoDoAcesso,
  token: unknown,
  headers: unknown
): Promise<AcessoDaSessao | Negado> {
  if (await isClienteDaSessao(sessao.id, token)) return { papel: "client" };
  return authorizeEquipeNaSessao(sessao, headers);
}

const findSessao = (where: { id: string } | { protocol: string }) =>
  prisma.chatSession.findUnique({ where, include: { contact: true } });

type SessaoComContato = NonNullable<Awaited<ReturnType<typeof findSessao>>>;
export type SessaoAutorizada<A> = { sessao: SessaoComContato; acesso: A };

/** Histórico e anexo: o cliente da conversa ou a equipe que a enxerga. */
export async function authorizeSessaoPorId(
  id: string,
  token: unknown,
  headers: unknown
): Promise<SessaoAutorizada<AcessoDaSessao> | Negado> {
  const sessao = await findSessao({ id });
  if (!sessao) return NAO_ENCONTRADO;
  const acesso = await authorizeSessao(sessao, token, headers);
  return isNegado(acesso) ? acesso : { sessao, acesso };
}

/** Transcrição pelo protocolo: quem atende no espaço da conversa; o token do cliente não abre. */
export async function authorizeTranscricao(
  protocol: string,
  headers: unknown
): Promise<SessaoAutorizada<AcessoDaEquipe> | Negado> {
  const sessao = await findSessao({ protocol });
  if (!sessao) return NAO_ENCONTRADO;
  const acesso = await authorizeChat(sessao.workspaceId, headers, CHAT_ACTION.ATENDER);
  return isNegado(acesso) ? acesso : { sessao, acesso: { papel: "attendant", userId: acesso.userId } };
}
