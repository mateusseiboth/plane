/**
 * Token de serviço que o FreePBX usa para registrar ligações.
 *
 * O banco guarda só o hash (SHA-256) e os quatro últimos caracteres, para a
 * tela mostrar qual token está valendo. O token em si aparece UMA vez, na
 * geração: perdeu, gera outro.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";

const PREFIX = "pbx_";

export const generateServiceToken = (): string => `${PREFIX}${randomBytes(32).toString("base64url")}`;

export const hashServiceToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export const lastFour = (token: string): string => token.slice(-4);

/** Compara pelo hash em tempo constante: o token nunca é comparado em claro. */
export function isSameToken(token: string, hash: string | null | undefined): boolean {
  if (!hash) return false;
  const recebido = Buffer.from(hashServiceToken(token), "hex");
  const gravado = Buffer.from(hash, "hex");
  return recebido.length === gravado.length && timingSafeEqual(recebido, gravado);
}

type HeaderBag = Headers | Record<string, string | undefined>;

const readHeader = (headers: HeaderBag, key: string): string | undefined =>
  headers instanceof Headers ? (headers.get(key) ?? undefined) : headers[key];

/** `X-Api-Token: <token>` ou `Authorization: Bearer <token>`. */
export function readServiceToken(headers: HeaderBag): string | null {
  const direto = readHeader(headers, "x-api-token")?.trim();
  if (direto) return direto;
  const bearer = readHeader(headers, "authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim();
  return bearer || null;
}
