/**
 * Interseção entre a restrição do filtro e a de cada grupo.
 *
 * As respostas agrupadas montavam a coluna com `{...where, stateId: <estados do
 * grupo>}` e, com isso, APAGAVAM o `stateId` que o filtro tinha imposto.
 * Filtrar por "Triagem" devolvia `total_count: 23` e, ao lado, "Em andamento
 * 1573" e "Concluído 49370": a tela parecia ignorar o filtro por completo.
 */
import { describe, expect, it } from "bun:test";
import { restringirAoGrupo } from "@utils/filters";

describe("restringirAoGrupo", () => {
  it("sem filtro no campo, vale a restrição do grupo", () => {
    expect(restringirAoGrupo(undefined, "st-1")).toEqual({ in: ["st-1"] });
    expect(restringirAoGrupo(undefined, ["st-1", "st-2"])).toEqual({ in: ["st-1", "st-2"] });
  });

  it("mantém o filtro: a coluna fora dele fica vazia", () => {
    const filtroTriagem = { in: ["triagem"] };
    expect(restringirAoGrupo(filtroTriagem, ["concluido-a", "concluido-b"])).toEqual({ in: [] });
  });

  it("a coluna dentro do filtro conserva só o que os dois permitem", () => {
    const filtro = { in: ["st-1", "st-2", "st-3"] };
    expect(restringirAoGrupo(filtro, ["st-2", "st-9"])).toEqual({ in: ["st-2"] });
  });

  it("filtro escalar (?project_id=) também restringe", () => {
    expect(restringirAoGrupo("proj-1", "proj-1")).toEqual({ in: ["proj-1"] });
    expect(restringirAoGrupo("proj-1", "proj-2")).toEqual({ in: [] });
  });

  it("filtro que já não casa com nada continua sem casar", () => {
    expect(restringirAoGrupo({ in: [] }, ["st-1"])).toEqual({ in: [] });
  });

  it("grupo sem valor de lista é devolvido como veio", () => {
    expect(restringirAoGrupo({ in: ["st-1"] }, undefined)).toBeUndefined();
    expect(restringirAoGrupo({ in: ["st-1"] }, null)).toBeNull();
  });
});
