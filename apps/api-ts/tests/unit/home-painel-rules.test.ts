/**
 * Painel da página inicial: regras puras (período da série, dias sem movimento,
 * ranking de encerrados, mês corrente e tipo de cada evento da atividade).
 * Sem banco. O dia é contado no fuso do escritório (America/Campo_Grande, UTC-4).
 */
import { describe, expect, it } from "bun:test";
import {
  classifyAtividade,
  fillSerie,
  mergeEventos,
  rankPosicao,
  readPeriodoDaSerie,
  resolveJanelaDaSerie,
  resolveMesCorrente,
} from "@modules/home/painel.rules";

/** 23/09/2026 às 10h no escritório (14h UTC). */
const AGORA = new Date("2026-09-23T14:00:00Z");

describe("período da série", () => {
  it("aceita semana, mês e trimestre e cai na semana para o resto", () => {
    expect(readPeriodoDaSerie("semana")).toBe("semana");
    expect(readPeriodoDaSerie("mes")).toBe("mes");
    expect(readPeriodoDaSerie("trimestre")).toBe("trimestre");
    expect(readPeriodoDaSerie("ano")).toBe("semana");
    expect(readPeriodoDaSerie(undefined)).toBe("semana");
    expect(readPeriodoDaSerie("toString")).toBe("semana");
  });

  it("a semana são os 7 dias que terminam hoje, começando à meia-noite do escritório", () => {
    const janela = resolveJanelaDaSerie("semana", AGORA);
    expect(janela.dias).toEqual([
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
    ]);
    expect(janela.inicio.toISOString()).toBe("2026-09-17T04:00:00.000Z");
    expect(janela.fim).toEqual(AGORA);
  });

  it("mês tem 30 dias e trimestre 90, sempre terminando hoje", () => {
    const mes = resolveJanelaDaSerie("mes", AGORA);
    const trimestre = resolveJanelaDaSerie("trimestre", AGORA);
    expect(mes.dias).toHaveLength(30);
    expect(mes.dias.at(-1)).toBe("2026-09-23");
    expect(mes.dias[0]).toBe("2026-08-25");
    expect(trimestre.dias).toHaveLength(90);
    expect(trimestre.dias[0]).toBe("2026-06-26");
  });
});

describe("série diária", () => {
  it("preenche com zero os dias sem movimento e respeita a ordem dos dias", () => {
    const serie = fillSerie(
      ["2026-09-21", "2026-09-22", "2026-09-23"],
      [{ dia: "2026-09-21", total: 3 }],
      [
        { dia: "2026-09-23", total: 2 },
        { dia: "2026-09-21", total: 1 },
      ]
    );
    expect(serie).toEqual([
      { data: "2026-09-21", abertos: 3, encerrados: 1 },
      { data: "2026-09-22", abertos: 0, encerrados: 0 },
      { data: "2026-09-23", abertos: 0, encerrados: 2 },
    ]);
  });

  it("ignora contagem de dia fora da janela", () => {
    const serie = fillSerie(["2026-09-23"], [{ dia: "2026-09-01", total: 9 }], []);
    expect(serie).toEqual([{ data: "2026-09-23", abertos: 0, encerrados: 0 }]);
  });
});

describe("mês corrente", () => {
  it("vai do dia 1 à meia-noite do escritório até agora", () => {
    const mes = resolveMesCorrente(AGORA);
    expect(mes.inicio.toISOString()).toBe("2026-09-01T04:00:00.000Z");
    expect(mes.fim).toEqual(AGORA);
  });

  it("na virada do mês em UTC ainda vale o mês do escritório", () => {
    // 01/10 às 02h UTC ainda é 30/09 às 22h no escritório.
    const mes = resolveMesCorrente(new Date("2026-10-01T02:00:00Z"));
    expect(mes.inicio.toISOString()).toBe("2026-09-01T04:00:00.000Z");
  });
});

describe("ranking de encerrados", () => {
  const contagens = [
    { pessoaId: "ana", total: 12 },
    { pessoaId: "bia", total: 7 },
    { pessoaId: "caio", total: 7 },
    { pessoaId: "davi", total: 3 },
  ];

  it("a posição é 1 + quantos encerraram mais", () => {
    expect(rankPosicao(contagens, "ana")).toEqual({ posicao: 1, total_pessoas: 4 });
    expect(rankPosicao(contagens, "davi")).toEqual({ posicao: 4, total_pessoas: 4 });
  });

  it("empate divide a posição", () => {
    expect(rankPosicao(contagens, "bia")).toEqual({ posicao: 2, total_pessoas: 4 });
    expect(rankPosicao(contagens, "caio")).toEqual({ posicao: 2, total_pessoas: 4 });
  });

  it("quem não encerrou nada no mês fica sem posição", () => {
    expect(rankPosicao(contagens, "eva")).toEqual({ posicao: null, total_pessoas: 4 });
    expect(rankPosicao([{ pessoaId: "eva", total: 0 }], "eva")).toEqual({ posicao: null, total_pessoas: 0 });
  });
});

describe("tipo do evento da atividade", () => {
  it("abertura, mudança de etapa, conclusão e solicitação atendida", () => {
    expect(classifyAtividade({ field: "issue", verb: "created" }, null)).toBe("abertura");
    expect(classifyAtividade({ field: "state", verb: "updated" }, "started")).toBe("etapa");
    expect(classifyAtividade({ field: "state", verb: "updated" }, "completed")).toBe("conclusao");
    expect(classifyAtividade({ field: "solicitacao_atendida", verb: "updated" }, null)).toBe("solicitacao_atendida");
  });

  it("o resto da trilha não entra no painel", () => {
    expect(classifyAtividade({ field: "priority", verb: "updated" }, null)).toBeNull();
    expect(classifyAtividade({ field: "labels", verb: "updated" }, null)).toBeNull();
    expect(classifyAtividade({ field: null, verb: "updated" }, null)).toBeNull();
  });

  it("junta as fontes do mais novo para o mais antigo, até o limite", () => {
    const a = { id: "a", criado_em: "2026-09-20T10:00:00.000Z" };
    const b = { id: "b", criado_em: "2026-09-22T10:00:00.000Z" };
    const c = { id: "c", criado_em: "2026-09-21T10:00:00.000Z" };
    expect(mergeEventos([[a], [b, c]], 2).map((e) => e.id)).toEqual(["b", "c"]);
  });
});
