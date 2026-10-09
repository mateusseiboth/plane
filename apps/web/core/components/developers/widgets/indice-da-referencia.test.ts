/**
 * Índice lateral e busca da referência de widgets: puros, sobre o
 * `referencia.json` gerado do SDK. Rodar com `bun test core/components/developers`.
 */
import { describe, expect, it } from "bun:test";
import { buildIndice, isItemDaBusca } from "@/components/developers/widgets/indice-da-referencia";
import { referencia } from "@/components/developers/widgets/referencia";

describe("buildIndice", () => {
  it("lista as seções fixas e um item por hook, API e tipo", () => {
    const indice = buildIndice(referencia, "");
    const ids = indice.flatMap((secao) => [secao.id].concat(secao.itens.map((item) => item.id)));
    expect(ids).toEqual(expect.arrayContaining(["instalar", "tutorial", "manifesto", "permissoes", "hooks"]));
    expect(ids).toContain("hook-useWorkerItems");
    expect(ids).toContain("api-workerItemsApi");
    expect(ids).toContain("tipo-WidgetManifest");
  });

  it("a busca deixa só as seções com itens que batem", () => {
    const indice = buildIndice(referencia, "useworker");
    expect(indice.map((secao) => secao.id)).toEqual(["hooks"]);
    expect(indice[0].itens.map((item) => item.titulo)).toEqual(["useWorkerItems", "useWorkerItem"]);
  });

  it("a busca olha a descrição e ignora acentos", () => {
    const indice = buildIndice(referencia, "solicitacoes da triagem");
    expect(indice.flatMap((secao) => secao.itens.map((item) => item.titulo))).toContain("intakesApi");
  });
});

describe("isItemDaBusca", () => {
  it("sem busca, tudo aparece", () => {
    expect(isItemDaBusca(["qualquer"], "")).toBe(true);
  });

  it("todas as palavras precisam aparecer", () => {
    expect(isItemDaBusca(["useStats", "Visão geral do espaço"], "visao espaco")).toBe(true);
    expect(isItemDaBusca(["useStats", "Visão geral do espaço"], "visao chamado")).toBe(false);
  });
});
