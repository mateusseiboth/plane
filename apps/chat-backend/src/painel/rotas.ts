/**
 * Rota interna do painel de TV do atendimento.
 *
 * Quem chama é o api-ts, DEPOIS de conferir a chave do painel (ou a sessão de
 * quem está logado). Por isso a autenticação aqui é de SERVIÇO
 * (`X-Service-Token` = `CHAT_SERVICE_TOKEN`), o mesmo segredo que o robô do
 * chat já usa para falar com o api-ts, e não uma segunda cópia da regra da
 * chave: a regra da chave mora em um lugar só.
 *
 * Sem o segredo configurado a rota fica DESLIGADA (503): token vazio nunca vale
 * como token.
 */

import { Elysia } from "elysia";
import { timingSafeEqual } from "crypto";
import { readPainelDeAtendimento } from "@/painel/painel.service";

export const SERVICE_TOKEN_HEADER = "x-service-token";

export function isServiceTokenValid(recebido: string | undefined, esperado: string | undefined): boolean {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type Set = { status?: number | string };

export const painelModule = new Elysia().get(
  "/internal/painel/:slug/atendimento/",
  async ({
    params,
    headers,
    set,
  }: {
    params: Record<string, string>;
    headers: Record<string, string | undefined>;
    set: Set;
  }) => {
    const esperado = process.env.CHAT_SERVICE_TOKEN?.trim();
    if (!esperado) {
      set.status = 503;
      return { detail: "Integração de serviço não configurada." };
    }
    if (!isServiceTokenValid(headers[SERVICE_TOKEN_HEADER], esperado)) {
      set.status = 401;
      return { detail: "Credencial de serviço inválida." };
    }
    return readPainelDeAtendimento(params.slug!);
  }
);
