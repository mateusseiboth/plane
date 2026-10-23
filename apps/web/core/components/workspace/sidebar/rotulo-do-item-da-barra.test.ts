/**
 * Nome de cada item da barra: o do catálogo, salvo os que mudam pela matriz de
 * ações de quem está vendo (hoje, as solicitações: Triagem ou Solicitação).
 * Rodar com `bun test core/components/workspace/sidebar`.
 */
import { describe, expect, it } from "bun:test";
import {
  WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS,
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS,
} from "@plane/constants";
import { ROTULO_DA_TRIAGEM } from "@/components/inbox/global/rotulo-da-triagem";
import { readRotuloDoItemDaBarra } from "./rotulo-do-item-da-barra";

const withAcoes =
  (...acoes: string[]) =>
  (acao: string) =>
    acoes.includes(acao);

describe("readRotuloDoItemDaBarra", () => {
  const triagem = WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS["global-intake"];

  it("as solicitações viram Solicitação para quem só abre pedidos", () => {
    expect(readRotuloDoItemDaBarra(triagem, withAcoes("intake.create"))).toBe(ROTULO_DA_TRIAGEM.solicitacao);
  });

  it("as solicitações viram Triagem para quem tria", () => {
    expect(readRotuloDoItemDaBarra(triagem, withAcoes("intake.review"))).toBe(ROTULO_DA_TRIAGEM.triagem);
  });

  it("os demais itens usam o nome do catálogo", () => {
    const sistemas = WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["projects"];
    expect(readRotuloDoItemDaBarra(sistemas, withAcoes())).toBe(sistemas.labelTranslationKey);
  });
});
