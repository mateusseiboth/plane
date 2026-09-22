/**
 * Configuração de telefonia do espaço: o token de serviço do PBX e o mapa de
 * ramal para atendente. Quem chega aqui já passou por `chat.administrar`.
 */

import * as dao from "@/ligacoes/ligacoes.dao";
import { requireValid } from "@/ligacoes/errors";
import { parseRamais } from "@/ligacoes/payload";
import { generateServiceToken, hashServiceToken, lastFour } from "@/ligacoes/token-de-servico";
import { listAtendentes } from "@/permissoes";

export async function readTelefoniaConfig(slug: string) {
  const [config, ramais, atendentes] = await Promise.all([
    dao.findTelefoniaConfig(slug),
    dao.listRamais(slug),
    listAtendentes(slug),
  ]);
  const nomes = new Map(atendentes.map((a) => [a.id, a.name]));
  return {
    has_token: Boolean(config?.tokenHash),
    token_last4: config?.tokenLast4 ?? null,
    updated_at: config?.updatedAt ?? null,
    ramais: ramais.map((r) => ({
      id: r.id,
      extension: r.extension,
      user_id: r.userId,
      name: nomes.get(r.userId) ?? null,
    })),
  };
}

/** Gera um token novo e invalida o anterior. O valor só sai nesta resposta. */
export async function generateTelefoniaToken(slug: string, userId: string) {
  const token = generateServiceToken();
  await dao.saveTokenHash(slug, hashServiceToken(token), lastFour(token), userId);
  return { token, token_last4: lastFour(token) };
}

export async function revokeTelefoniaToken(slug: string, userId: string) {
  await dao.saveTokenHash(slug, null, null, userId);
  return { has_token: false };
}

export async function saveRamais(slug: string, body: unknown) {
  const atendentes = new Set((await listAtendentes(slug)).map((a) => a.id));
  await dao.replaceRamais(slug, requireValid(parseRamais(body, atendentes)));
  return readTelefoniaConfig(slug);
}
