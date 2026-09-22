/**
 * Agrupamento do catálogo de ações vindo da API para a tela de Funções. Puro.
 * Rodar com `bun test core/components/roles`.
 */
import { describe, expect, it } from "bun:test";
import { groupActionCatalog } from "./group-action-catalog";

const acao = (key: string, group: string) => ({ key, label: key, group, scope: "project" as const });

describe("groupActionCatalog", () => {
  it("mantém a ordem de chegada dos grupos e das ações", () => {
    const grupos = groupActionCatalog([acao("a", "Chamados"), acao("b", "Chat"), acao("c", "Chamados")]);
    expect(grupos.map((g) => g.label)).toEqual(["Chamados", "Chat"]);
    expect(grupos[0].actions.map((a) => a.key)).toEqual(["a", "c"]);
  });

  it("catálogo vazio não gera grupo", () => {
    expect(groupActionCatalog([])).toEqual([]);
  });
});
