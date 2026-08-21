/**
 * O crachá do portal do cliente.
 *
 * É deliberadamente OUTRO crachá: a conta do portal não é usuário do Plane, não
 * ocupa cadeira e não pode abrir nenhuma rota autenticada do produto. O papel
 * gravado dentro do token é o que separa os dois mundos — o `authPlugin` do
 * Plane procura um usuário por `sub` e não encontraria nada, mas depender disso
 * seria depender de um acidente. Aqui a recusa é explícita.
 */

import { SignJWT, jwtVerify } from "jose";

const SEGREDO = new TextEncoder().encode(process.env.JWT_SECRET ?? "plane-jwt-secret-change-in-production");
const PAPEL = "portal";
const VALIDADE = "7d";

export type CrachaDoPortal = { contaId: string; workspaceId: string };

export async function assinarTokenDoPortal(contaId: string, workspaceId: string): Promise<string> {
  return new SignJWT({ role: PAPEL, wid: workspaceId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(contaId)
    .setIssuedAt()
    .setExpirationTime(VALIDADE)
    .sign(SEGREDO);
}

/** `null` para token ausente, expirado, adulterado ou que não é do portal. */
export async function lerTokenDoPortal(bruto: string | null | undefined): Promise<CrachaDoPortal | null> {
  if (!bruto) return null;
  try {
    const { payload } = await jwtVerify(bruto, SEGREDO);
    if (payload.role !== PAPEL || !payload.sub || !payload.wid) return null;
    return { contaId: String(payload.sub), workspaceId: String(payload.wid) };
  } catch {
    return null;
  }
}
