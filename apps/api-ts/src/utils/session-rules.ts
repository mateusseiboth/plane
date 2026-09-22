// Regra pura da versão de sessão, sem banco e sem dependência: o JWT leva `tv`
// (o `token_updated_at` do usuário em milissegundos na emissão) e deixa de valer
// quando o marco do usuário muda.
//
// A comparação é exata, e não por `iat`: `iat` tem resolução de segundo, e uma
// revogação no mesmo segundo do login deixaria o token antigo passar.
//
// O chat-backend não enxerga este arquivo em produção (a imagem dele só leva a
// própria pasta). Ele tem uma cópia em `apps/chat-backend/src/sessao.ts`, e o
// teste `tests/sessao-igual-ao-api-ts.test.ts` do chat confere, caso a caso, que
// as duas respondem igual.

import type { JWTPayload } from "jose";

export function readSessionVersion(payload: JWTPayload): unknown {
  return payload.tv;
}

export function isSessionRevoked(tokenVersion: unknown, tokenUpdatedAt: Date | null | undefined): boolean {
  if (!tokenUpdatedAt) return false;
  return tokenVersion !== tokenUpdatedAt.getTime();
}
