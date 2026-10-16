import { describe, expect, it } from "bun:test";
import {
  buildDicaDoChamadoMovido,
  buildLinkDoChamadoMovido,
  listSistemasDeDestino,
} from "@/components/issues/issue-detail/alterar-sistema/alterar-sistema.rules";

const movido = { id: "n1", project_id: "p2", sequence_id: 123, project_identifier: "SIART" };

describe("chamado movido de sistema", () => {
  it("o link leva ao chamado do outro lado pelo identificador", () => {
    expect(buildLinkDoChamadoMovido("quality", movido)).toBe("/quality/browse/SIART-123/");
  });

  it("a dica diz para onde foi ou de onde veio", () => {
    expect(buildDicaDoChamadoMovido("para", movido)).toBe("Movido para SIART-123");
    expect(buildDicaDoChamadoMovido("de", { ...movido, project_identifier: "INTEG1", sequence_id: 24 })).toBe(
      "Veio de INTEG1-24"
    );
  });
});

describe("listSistemasDeDestino", () => {
  it("tira o sistema atual e ordena pelo nome", () => {
    const sistemas = [
      { id: "a", name: "Siart" },
      { id: "b", name: "Contabilidade" },
      { id: "c", name: "Integração" },
    ];
    expect(listSistemasDeDestino(sistemas, "c").map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("ignora sistema que ainda não carregou", () => {
    expect(listSistemasDeDestino([undefined, { id: "a", name: "Siart" }], "x").map((s) => s.id)).toEqual(["a"]);
  });
});
