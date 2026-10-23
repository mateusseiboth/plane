/**
 * Nome do item do menu (e da página) das solicitações do espaço: "Triagem" para
 * quem tria, "Solicitação" para quem só abre pedidos. Pela matriz de ações.
 * Rodar com `bun test core/components/inbox/global`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { readRotuloDaTriagem } from "./rotulo-da-triagem";

// O texto que a pessoa lê sai do pt-BR do pacote de i18n (o pacote só exporta o build).
const navegacao: unknown = JSON.parse(
  readFileSync(new URL("../../../../../../packages/i18n/src/locales/pt-BR/navigation.json", import.meta.url), "utf-8")
);

const withAcoes =
  (...acoes: string[]) =>
  (acao: string) =>
    acoes.includes(acao);

const readTextoEmPortugues = (chave: string) =>
  chave.split(".").reduce<unknown>((no, parte) => (no as Record<string, unknown>)[parte], navegacao);

describe("readRotuloDaTriagem", () => {
  it("quem só abre pedidos vê Solicitação", () => {
    expect(readTextoEmPortugues(readRotuloDaTriagem(withAcoes("intake.create")))).toBe("Solicitação");
  });

  it("quem tria vê Triagem", () => {
    expect(readTextoEmPortugues(readRotuloDaTriagem(withAcoes("intake.review")))).toBe("Triagem");
  });

  it("quem abre e tria vê Triagem", () => {
    expect(readTextoEmPortugues(readRotuloDaTriagem(withAcoes("intake.create", "intake.review")))).toBe("Triagem");
  });

  it("quem abre chamado e pedido, sem triar, vê Solicitação", () => {
    expect(readTextoEmPortugues(readRotuloDaTriagem(withAcoes("intake.create", "issue.create")))).toBe("Solicitação");
  });
});
