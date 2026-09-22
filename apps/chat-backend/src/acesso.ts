/**
 * Guarda das rotas REST pela matriz de ações (src/permissoes.ts): quem é a
 * pessoa e se ela tem a ação de chat NESTE espaço. Devolve o id ou a resposta
 * de erro pronta, para a rota sair cedo sem `throw` (os módulos do Elysia não
 * herdam o `onError` do app quando testados sozinhos).
 */

import { resolveAttendant } from "@/auth";
import { type ChatAction, hasChatAction } from "@/permissoes";

export type Negado = { status: 401 | 403; body: { detail: string } };

const NAO_AUTENTICADO: Negado = { status: 401, body: { detail: "Não autenticado." } };
const SEM_PERMISSAO: Negado = { status: 403, body: { detail: "Você não tem permissão para esta ação no chat." } };

export async function authorizeChat(
  slug: string,
  headers: unknown,
  action: ChatAction
): Promise<{ userId: string } | Negado> {
  const user = await resolveAttendant(headers);
  if (!user) return NAO_AUTENTICADO;
  if (!(await hasChatAction(slug, user.id, action))) return SEM_PERMISSAO;
  return { userId: user.id };
}

export const isNegado = (r: { userId: string } | Negado): r is Negado => "status" in r;
