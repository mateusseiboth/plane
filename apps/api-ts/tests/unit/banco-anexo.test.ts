/**
 * Banco anexado: regras sem banco de dados. O número do backup, a marca no
 * HTML, os parâmetros que seguem para o plugin e o nome da entidade (o plugin
 * só sabe o código do SAC; o nome vem do Plane).
 */
import { describe, expect, it } from "bun:test";
import {
  NIVEIS_DA_BUSCA,
  addNomesDasEntidades,
  buildMarcaDoEnvio,
  pickParametros,
  readEnvio,
} from "@modules/banco-anexo/banco-anexo.rules";

describe("banco anexado", () => {
  it("o número do backup é só dígito", () => {
    expect(readEnvio("123")).toBe("123");
    expect(() => readEnvio("12a")).toThrow();
    expect(() => readEnvio("1;DROP")).toThrow();
  });

  it("a marca é o atributo que o bloco grava no HTML", () => {
    expect(buildMarcaDoEnvio("123")).toBe('data-envio="123"');
  });

  it("só os parâmetros do nível seguem para o plugin", () => {
    expect(
      pickParametros(NIVEIS_DA_BUSCA.entidades, { system_id: "1", mes: "2026-11", search: "x", vazio: "" })
    ).toEqual({ system_id: "1", mes: "2026-11" });
  });

  it("o nome da entidade vem do Plane, pelo código do SAC", () => {
    const corpo = {
      data: [
        { entity_code: "77", arquivos: 2 },
        { entity_code: "88", arquivos: 1 },
      ],
    };
    expect(addNomesDasEntidades(corpo, new Map([["77", "CAMARA DE ANGELICA"]]))).toEqual({
      data: [
        { entity_code: "77", arquivos: 2, entity_name: "CAMARA DE ANGELICA" },
        { entity_code: "88", arquivos: 1, entity_name: null },
      ],
    });
  });
});
