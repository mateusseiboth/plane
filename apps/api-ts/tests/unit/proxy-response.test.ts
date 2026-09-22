/**
 * Resposta do backend de um plugin devolvida pelo proxy do gateway.
 *
 * O proxy repassava SEMPRE o corpo como fluxo (`resp.body`). Com o nginx do Plane
 * falando HTTP/1.0 com o api-ts, o fluxo volta sem tamanho e o navegador recebe um
 * "Content-Length: 0" grudado no fim do JSON — a aba "Situação por entidade" quebrava
 * com `Unexpected non-whitespace character after JSON` na resposta de 169 KB.
 * Agora só o que é fluxo contínuo de verdade (SSE) segue em streaming; o resto vai com
 * tamanho conhecido.
 */
import { describe, expect, it } from "bun:test";
import { buildProxyResponseHeaders, isRespostaEmFluxo } from "@utils/proxy-response";

describe("isRespostaEmFluxo", () => {
  it("só SSE continua em streaming", () => {
    expect(isRespostaEmFluxo("text/event-stream")).toBe(true);
    expect(isRespostaEmFluxo("text/event-stream; charset=utf-8")).toBe(true);
    expect(isRespostaEmFluxo("application/json;charset=utf-8")).toBe(false);
    expect(isRespostaEmFluxo(null)).toBe(false);
  });
});

describe("buildProxyResponseHeaders", () => {
  it("descarta os cabeçalhos de transporte e carimba o correlation id", () => {
    const headers = new Headers({
      "content-type": "application/json",
      "content-length": "10",
      "transfer-encoding": "chunked",
      connection: "keep-alive",
      "x-custom": "ok",
    });
    const saida = buildProxyResponseHeaders(headers, "abc-123");
    expect(saida["content-type"]).toBe("application/json");
    expect(saida["x-custom"]).toBe("ok");
    expect(saida["X-Correlation-Id"]).toBe("abc-123");
    expect(Object.keys(saida).map((k) => k.toLowerCase())).not.toContain("content-length");
    expect(Object.keys(saida).map((k) => k.toLowerCase())).not.toContain("transfer-encoding");
    expect(Object.keys(saida).map((k) => k.toLowerCase())).not.toContain("connection");
  });
});
