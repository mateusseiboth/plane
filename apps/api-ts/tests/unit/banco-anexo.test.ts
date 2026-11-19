/**
 * Banco anexado: regras sem banco de dados. O número do backup, a marca no
 * HTML, os parâmetros que seguem para o plugin e o nome da entidade (o plugin
 * só sabe o código do SAC; o nome vem do Plane).
 */
import { describe, expect, it } from "bun:test";
import {
  NIVEIS_DA_BUSCA,
  addNomesDasEntidades,
  filterMesesRecentes,
  isMesPermitido,
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

describe("só os bancos recentes", () => {
  const novembro = new Date("2026-11-19T12:00:00-04:00");
  const janeiro = new Date("2027-01-10T12:00:00-04:00");

  it("vale o mês atual e o anterior, do mesmo ano", () => {
    expect(isMesPermitido("2026-11", novembro)).toBe(true);
    expect(isMesPermitido("2026-10", novembro)).toBe(true);
    expect(isMesPermitido("2026-09", novembro)).toBe(false);
    expect(isMesPermitido("2025-11", novembro)).toBe(false);
  });

  it("em janeiro, só janeiro: dezembro é de outro ano", () => {
    expect(isMesPermitido("2027-01", janeiro)).toBe(true);
    expect(isMesPermitido("2026-12", janeiro)).toBe(false);
  });

  it("a lista de meses do plugin fica só com os recentes", () => {
    const corpo = { data: [{ mes: "2026-11" }, { mes: "2026-10" }, { mes: "2026-09" }, { mes: "2025-11" }] };
    expect(filterMesesRecentes(corpo, novembro)).toEqual({ data: [{ mes: "2026-11" }, { mes: "2026-10" }] });
  });
});
