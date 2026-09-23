/**
 * Consulta em lotes: lista grande de ids não pode virar um único `IN` (o
 * Postgres limita os parâmetros e o Prisma devolve P2029).
 */
import { describe, expect, it } from "bun:test";
import { findEmLotes } from "@modules/reports/comum/lotes";

describe("findEmLotes", () => {
  it("divide a lista em lotes do tamanho pedido e concatena na ordem", async () => {
    const lotes: number[][] = [];
    const resultado = await findEmLotes([1, 2, 3, 4, 5], 2, async (lote) => {
      lotes.push(lote);
      return lote.map((n) => n * 10);
    });
    expect(lotes).toEqual([[1, 2], [3, 4], [5]]);
    expect(resultado).toEqual([10, 20, 30, 40, 50]);
  });

  it("lista vazia não consulta nada", async () => {
    let chamadas = 0;
    expect(await findEmLotes([], 100, async () => (chamadas++, [1]))).toEqual([]);
    expect(chamadas).toBe(0);
  });
});
