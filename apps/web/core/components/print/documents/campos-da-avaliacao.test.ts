/**
 * A avaliação do cliente na impressão da transcrição: só com
 * `chat.ver_avaliacao`. Sem a ação, os campos nem aparecem (um "—" daria a
 * entender que o cliente não avaliou). Puro.
 * Rodar com `bun test core/components/print`.
 */
import { describe, expect, it } from "bun:test";
import { buildCamposDaAvaliacao } from "@/components/print/documents/campos-da-avaliacao";

const avaliada = { rating_score: 4, rating_comment: "Resolveu rápido" };

describe("buildCamposDaAvaliacao", () => {
  it("com a ação, mostra a nota e o comentário", () => {
    expect(buildCamposDaAvaliacao(avaliada, true)).toEqual([
      { label: "Avaliação", value: "4" },
      { label: "Comentário da avaliação", value: "Resolveu rápido" },
    ]);
  });

  it("com a ação e sem avaliação, mostra o traço", () => {
    expect(buildCamposDaAvaliacao({ rating_score: null, rating_comment: null }, true)).toEqual([
      { label: "Avaliação", value: "—" },
      { label: "Comentário da avaliação", value: "—" },
    ]);
  });

  it("sem a ação, nenhum campo da avaliação", () => {
    expect(buildCamposDaAvaliacao(avaliada, false)).toEqual([]);
  });
});
