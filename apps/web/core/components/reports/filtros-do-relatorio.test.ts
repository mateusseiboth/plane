/**
 * Filtros da tela de relatórios: parâmetros enviados à API (vários sistemas,
 * data do dia inteiro no fuso do navegador, só os filtros que o relatório usa),
 * o resumo impresso no cabeçalho e a decisão do alerta sonoro do painel de TV. Puro.
 * Rodar com `bun test core/components/reports`.
 */
import { describe, expect, it } from "bun:test";
import {
  ESTADO_INICIAL_DOS_FILTROS,
  buildPrintMeta,
  buildReportParams,
  hasFiltroAtivo,
} from "@/components/reports/filtros-do-relatorio";
import { readAlertasNovos } from "@/components/painel-tv/alerta-sonoro";

describe("buildReportParams", () => {
  it("manda vários sistemas separados por vírgula", () => {
    const params = buildReportParams({ ...ESTADO_INICIAL_DOS_FILTROS, projectIds: ["a", "b"] }, ["project"]);
    expect(params.project_ids).toBe("a,b");
  });

  it("o período cobre o dia inteiro no fuso de quem está na tela", () => {
    const params = buildReportParams({ ...ESTADO_INICIAL_DOS_FILTROS, dateFrom: "2026-09-01", dateTo: "2026-09-30" }, [
      "period",
    ]);
    expect(params.date_from).toBe(new Date("2026-09-01T00:00:00").toISOString());
    expect(params.date_to).toBe(new Date("2026-09-30T23:59:59.999").toISOString());
  });

  it("só envia o filtro que o relatório declara", () => {
    const params = buildReportParams(
      { ...ESTADO_INICIAL_DOS_FILTROS, projectIds: ["a"], uf: "MS", city: "Campo Grande", userId: "u1" },
      ["location"]
    );
    expect(params).toEqual({ uf: "MS", city: "Campo Grande" });
  });

  it("valores de lista vão com o nome que a API espera", () => {
    const params = buildReportParams(
      {
        ...ESTADO_INICIAL_DOS_FILTROS,
        perfil: "homologacao",
        situacao: "abertos",
        granularidade: "ano",
        etapa: "Em Teste",
        funcao: "ti",
        userId: "u1",
      },
      ["perfil", "situacao", "granularidade", "etapa", "funcao", "user"]
    );
    expect(params).toEqual({
      perfil: "homologacao",
      situacao: "abertos",
      granularidade: "ano",
      etapa: "Em Teste",
      funcao: "ti",
      user_id: "u1",
    });
  });
});

describe("hasFiltroAtivo", () => {
  it("o estado inicial não conta como filtro", () => {
    expect(hasFiltroAtivo(ESTADO_INICIAL_DOS_FILTROS)).toBe(false);
    expect(hasFiltroAtivo({ ...ESTADO_INICIAL_DOS_FILTROS, projectIds: ["a"] })).toBe(true);
    expect(hasFiltroAtivo({ ...ESTADO_INICIAL_DOS_FILTROS, city: "Dourados" })).toBe(true);
  });
});

describe("buildPrintMeta", () => {
  it("resume os filtros para o cabeçalho da impressão", () => {
    const meta = buildPrintMeta(
      { ...ESTADO_INICIAL_DOS_FILTROS, dateFrom: "2026-09-01", uf: "MS", city: "Dourados" },
      { sistemas: ["Tributos", "Folha"], usuario: "Davi Dev" }
    );
    expect(meta).toEqual([
      { label: "Período", value: "01/09/2026 a hoje" },
      { label: "Sistemas", value: "Tributos, Folha" },
      { label: "Pessoa", value: "Davi Dev" },
      { label: "Local", value: "Dourados / MS" },
    ]);
  });

  it("sem filtro, diz que é todo o período e todos os sistemas", () => {
    expect(buildPrintMeta(ESTADO_INICIAL_DOS_FILTROS, { sistemas: [] })).toEqual([
      { label: "Período", value: "Todo o período" },
      { label: "Sistemas", value: "Todos" },
    ]);
  });
});

describe("readAlertasNovos", () => {
  it("toca só quando aparece urgente que ainda não tocou", () => {
    expect(readAlertasNovos(new Set(), ["a"])).toEqual(["a"]);
    expect(readAlertasNovos(new Set(["a"]), ["a"])).toEqual([]);
    expect(readAlertasNovos(new Set(["a"]), ["a", "b"])).toEqual(["b"]);
    expect(readAlertasNovos(new Set(["a"]), [])).toEqual([]);
  });
});
