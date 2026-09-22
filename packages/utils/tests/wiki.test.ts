/**
 * Wiki do espaço: montagem da árvore a partir da lista simples que a API
 * devolve, posição de uma página ao mover/reordenar, destinos válidos de
 * "mover para" e o endereço de uma página (wiki ou sistema). Funções puras.
 */
import { describe, expect, it } from "bun:test";
import { getPageName } from "../src/page";
import {
  buildWikiTree,
  getPaginaPath,
  getSortOrderBetween,
  getWikiMoveTargets,
  getWikiPageAncestors,
} from "../src/wiki";

type P = { id: string; parent_id: string | null; sort_order: number; name: string };
const p = (id: string, parent_id: string | null, sort_order: number): P => ({ id, parent_id, sort_order, name: id });

describe("buildWikiTree", () => {
  it("monta a hierarquia e ordena as irmãs por sort_order", () => {
    const arvore = buildWikiTree([p("b", null, 20), p("a", null, 10), p("a2", "a", 2), p("a1", "a", 1)]);
    expect(arvore.map((n) => n.page.id)).toEqual(["a", "b"]);
    expect(arvore[0].children.map((n) => n.page.id)).toEqual(["a1", "a2"]);
    expect(arvore[1].children).toEqual([]);
  });

  it("filha cujo pai não veio na lista sobe para a raiz", () => {
    const arvore = buildWikiTree([p("orfa", "sumiu", 1), p("raiz", null, 2)]);
    expect(arvore.map((n) => n.page.id)).toEqual(["orfa", "raiz"]);
  });

  it("ciclo gravado no banco não trava a montagem: as páginas sobem para a raiz", () => {
    const arvore = buildWikiTree([p("x", "y", 1), p("y", "x", 2)]);
    expect(arvore.map((n) => n.page.id).toSorted()).toEqual(["x", "y"]);
  });
});

describe("getSortOrderBetween", () => {
  it("fica no meio das duas vizinhas", () => {
    expect(getSortOrderBetween(10, 20)).toBe(15);
  });

  it("no começo fica antes da primeira; no fim, depois da última", () => {
    expect(getSortOrderBetween(undefined, 100)).toBeLessThan(100);
    expect(getSortOrderBetween(100, undefined)).toBeGreaterThan(100);
  });

  it("sem vizinhas usa um valor inicial positivo", () => {
    expect(getSortOrderBetween(undefined, undefined)).toBeGreaterThan(0);
  });
});

describe("getWikiMoveTargets", () => {
  const paginas = [p("a", null, 1), p("a1", "a", 1), p("a11", "a1", 1), p("b", null, 2)];

  it("não oferece a própria página nem as descendentes", () => {
    expect(getWikiMoveTargets(paginas, "a").map((x) => x.id)).toEqual(["b"]);
    expect(getWikiMoveTargets(paginas, "a1").map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("getWikiPageAncestors", () => {
  it("devolve do topo até a mãe direta", () => {
    const paginas = [p("a", null, 1), p("a1", "a", 1), p("a11", "a1", 1)];
    expect(getWikiPageAncestors(paginas, "a11").map((x) => x.id)).toEqual(["a", "a1"]);
    expect(getWikiPageAncestors(paginas, "a")).toEqual([]);
  });
});

describe("getPaginaPath", () => {
  it("página sem sistema abre na wiki", () => {
    expect(getPaginaPath({ workspaceSlug: "q", pageId: "1", projectIds: [] })).toBe("/q/wiki/1");
  });

  it("página de sistema abre no sistema; prefere o sistema atual quando ela está nele", () => {
    expect(getPaginaPath({ workspaceSlug: "q", pageId: "1", projectIds: ["p1", "p2"] })).toBe("/q/projects/p1/pages/1");
    expect(getPaginaPath({ workspaceSlug: "q", pageId: "1", projectIds: ["p1", "p2"], currentProjectId: "p2" })).toBe(
      "/q/projects/p2/pages/1"
    );
  });
});

describe("getPageName", () => {
  it("página sem nome aparece como Sem título", () => {
    expect(getPageName("")).toBe("Sem título");
    expect(getPageName("  ")).toBe("Sem título");
    expect(getPageName("Processos")).toBe("Processos");
  });
});
