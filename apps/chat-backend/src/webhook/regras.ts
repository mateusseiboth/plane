/**
 * Regras puras do webhook da Z-API: quem pode chamar e o que já é velho demais.
 */
import { timingSafeEqual } from "crypto";

/**
 * Mensagem com 2 dias ou mais é descartada (`momment` do `zapi/receber.php`).
 * A Z-API reenvia a fila acumulada quando a instância volta do ar, e responder
 * hoje ao "bom dia" de anteontem abre conversa que ninguém pediu.
 */
export const IDADE_MAXIMA_DA_MENSAGEM_MS = 2 * 24 * 60 * 60 * 1000;

export const isMensagemAntiga = (momentMs: number | undefined, agora: number): boolean =>
  typeof momentMs === "number" && agora - momentMs >= IDADE_MAXIMA_DA_MENSAGEM_MS;

const isIgual = (esperado: string, recebido: string | undefined): boolean => {
  if (!recebido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Sem token configurado o espaço aceita qualquer chamada (decisão do usuário:
 * não quebrar quem já está no ar). Configurado, o valor tem de vir no cabeçalho
 * `Client-Token` ou em `?token=` na URL cadastrada na Z-API.
 */
export function isWebhookAutorizado(
  configurado: string | null | undefined,
  recebido: { header: string | undefined; query: string | undefined }
): boolean {
  if (!configurado) return true;
  return isIgual(configurado, recebido.header) || isIgual(configurado, recebido.query);
}
