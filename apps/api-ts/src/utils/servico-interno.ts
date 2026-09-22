/**
 * Autenticação de serviço para as rotas internas (`/api/internal/*`), que o
 * chat chama sem usuário logado: o robô do WhatsApp registra ouvidoria,
 * currículo e troca de e-mail em nome do cliente.
 *
 * O segredo é compartilhado pelos dois processos em `CHAT_SERVICE_TOKEN` e
 * viaja no cabeçalho `X-Service-Token`. Sem o segredo configurado as rotas
 * ficam DESLIGADAS (503): token vazio nunca vale como token.
 */
import { timingSafeEqual } from "crypto";

export const SERVICE_TOKEN_HEADER = "x-service-token";

export function isServiceTokenValid(recebido: string | undefined, esperado: string | undefined): boolean {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type Headers = Record<string, string | undefined>;

export function requireServiceToken(headers: Headers, esperado = process.env.CHAT_SERVICE_TOKEN): void {
  if (!esperado) throw { status: 503, message: "Integração com o chat não configurada." };
  if (isServiceTokenValid(headers[SERVICE_TOKEN_HEADER], esperado)) return;
  throw { status: 401, message: "Credencial de serviço inválida." };
}
