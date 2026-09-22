/**
 * Guarda do disparo: quem é a pessoa e se ela tem `chat.disparo` NESTE espaço,
 * pela matriz de ações (src/permissoes.ts). Toda rota do módulo passa por aqui.
 */

import { resolveAttendant, type PlaneUser } from "@/auth";
import { NotAutenticadoError, WithoutPermissaoError } from "@/disparo/erros";
import { CHAT_ACTION, hasChatAction } from "@/permissoes";

export async function requireDisparo(slug: string, headers: unknown): Promise<PlaneUser> {
  const user = await resolveAttendant(headers);
  if (!user) throw new NotAutenticadoError();
  if (!(await hasChatAction(slug, user.id, CHAT_ACTION.DISPARO))) throw new WithoutPermissaoError();
  return user;
}
