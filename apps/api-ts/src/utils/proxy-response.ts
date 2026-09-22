/**
 * Como o proxy do gateway de plugins devolve a resposta do backend do plugin.
 *
 * Repassar `resp.body` (fluxo) em toda resposta obriga o Bun a responder com
 * `Transfer-Encoding: chunked`. O nginx do Plane conversa com o api-ts em HTTP/1.0,
 * que não tem chunked: em respostas grandes ele devolvia o JSON com um
 * "Content-Length: 0" grudado no fim, e o `JSON.parse` do navegador estourava.
 * Só o que é fluxo contínuo de verdade (SSE) precisa de streaming; o resto vai com o
 * tamanho conhecido.
 */

const CABECALHOS_DE_TRANSPORTE = ["transfer-encoding", "content-encoding", "connection", "content-length"];

export const isRespostaEmFluxo = (contentType: string | null): boolean =>
  (contentType ?? "").toLowerCase().includes("text/event-stream");

/** Cabeçalhos do backend do plugin, sem os de transporte, com o correlation id. */
export function buildProxyResponseHeaders(headers: Headers, correlationId: string): Record<string, string> {
  const saida: Record<string, string> = {};
  headers.forEach((valor, nome) => {
    if (!CABECALHOS_DE_TRANSPORTE.includes(nome.toLowerCase())) saida[nome] = valor;
  });
  saida["X-Correlation-Id"] = correlationId;
  return saida;
}
