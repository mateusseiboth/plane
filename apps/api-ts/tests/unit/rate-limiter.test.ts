/**
 * Token bucket usado nas rotas sensíveis (magic link, reset de senha).
 * Cada teste usa uma chave própria porque o bucket é global ao processo.
 */
import {describe, expect, it} from "bun:test";
import {checkRateLimit, pruneStaleBuckets} from "@utils/rate-limiter";

const key = (name: string) => `${name}-${Math.random().toString(36).slice(2)}`;

describe("checkRateLimit", () => {
  it("libera exatamente maxRequests chamadas na janela", () => {
    const k = key("burst");
    const results = Array.from({length: 5}, () => checkRateLimit(k, 5, 60_000));
    expect(results).toEqual([true, true, true, true, true]);
    expect(checkRateLimit(k, 5, 60_000)).toBe(false);
  });

  it("mantém o bloqueio enquanto a janela não expira", () => {
    const k = key("blocked");
    for (let i = 0; i < 3; i++) checkRateLimit(k, 3, 60_000);
    expect(checkRateLimit(k, 3, 60_000)).toBe(false);
    expect(checkRateLimit(k, 3, 60_000)).toBe(false);
  });

  it("recarrega tokens quando a janela é curta o bastante", async () => {
    const k = key("refill");
    for (let i = 0; i < 2; i++) checkRateLimit(k, 2, 10);
    expect(checkRateLimit(k, 2, 10)).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(checkRateLimit(k, 2, 10)).toBe(true);
  });

  it("isola buckets por chave", () => {
    const a = key("a");
    const b = key("b");
    expect(checkRateLimit(a, 1)).toBe(true);
    expect(checkRateLimit(a, 1)).toBe(false);
    expect(checkRateLimit(b, 1)).toBe(true);
  });

  it("usa 5 requisições por minuto como padrão", () => {
    const k = key("default");
    for (let i = 0; i < 5; i++) expect(checkRateLimit(k)).toBe(true);
    expect(checkRateLimit(k)).toBe(false);
  });
});

describe("pruneStaleBuckets", () => {
  it("descarta buckets parados e libera a chave de novo", async () => {
    const k = key("stale");
    expect(checkRateLimit(k, 1)).toBe(true);
    expect(checkRateLimit(k, 1)).toBe(false);

    await new Promise((r) => setTimeout(r, 10));
    expect(pruneStaleBuckets(5)).toBeGreaterThan(0);
    // bucket recriado do zero → volta a permitir
    expect(checkRateLimit(k, 1)).toBe(true);
  });

  it("preserva buckets recentes", () => {
    const k = key("fresh");
    checkRateLimit(k, 2);
    pruneStaleBuckets(60_000);
    expect(checkRateLimit(k, 2)).toBe(true);
    expect(checkRateLimit(k, 2)).toBe(false);
  });

  it("não remove nada quando não há buckets antigos", () => {
    pruneStaleBuckets(60_000);
    expect(pruneStaleBuckets(60_000)).toBe(0);
  });
});
