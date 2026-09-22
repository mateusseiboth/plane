/**
 * Versão de sessão do Plane (`users.token_updated_at`) aplicada ao chat.
 *
 * O JWT do Plane leva `tv`, o marco do usuário em milissegundos na emissão.
 * Quando o marco muda (senha trocada ou redefinida, conta congelada, "sair de
 * todos os lugares"), todo token anterior deixa de abrir o chat também.
 *
 * A regra é a de `apps/api-ts/src/utils/session-rules.ts`. O container do chat
 * não leva o código do api-ts, então as duas funções estão repetidas aqui e
 * `tests/sessao-igual-ao-api-ts.test.ts` confere que respondem igual.
 */

import type { JWTPayload } from "jose";
import prisma from "@db";

export function readSessionVersion(payload: JWTPayload): unknown {
  return payload.tv;
}

export function isSessionRevoked(tokenVersion: unknown, tokenUpdatedAt: Date | null | undefined): boolean {
  if (!tokenUpdatedAt) return false;
  return tokenVersion !== tokenUpdatedAt.getTime();
}

type SessionRow = { is_active: boolean; token_updated_at: Date | null };

/**
 * A sessão deste token ainda vale? Conta desativada, congelada ou com a sessão
 * revogada não passa. Banco fora do ar também não: sem confirmar, o chat nega.
 */
export async function isSessionValid(userId: string, payload: JWTPayload): Promise<boolean> {
  try {
    const [linha] = (await prisma.$queryRaw`
      SELECT is_active, token_updated_at FROM users
      WHERE id::text = ${userId} AND deleted_at IS NULL`) as SessionRow[];
    if (!linha?.is_active) return false;
    return !isSessionRevoked(readSessionVersion(payload), linha.token_updated_at);
  } catch (e) {
    console.error("[sessao] falha ao conferir a sessão", e);
    return false;
  }
}
