/**
 * Filtros e contagem por sistema das visitas, horas analíticas por analista e
 * rótulo das linhas do log de chamados. Sem banco. (O painel de TV virou o
 * módulo `painel-tv`, testado em `painel-quadro.test.ts`.)
 */
import { describe, expect, it } from "bun:test";
import { groupLancamentosPorAnalista } from "@modules/reports/horas-analiticas/horas-analiticas";
import { describeAtividade, mergeLogDeChamados } from "@modules/reports/log-chamados/log-chamados";
import { countVisitasPorSistema, filterVisitas, readProjetosDaVisita } from "@modules/reports/visitas/visitas";
import { STATE } from "@utils/permissions";

describe("visitas", () => {
  const visitas = [
    { id: "1", city: "Campo Grande", entityCity: "Campo Grande", entityUf: "MS", projectIds: ["p1", "p2"] },
    { id: "2", city: null, entityCity: "Dourados", entityUf: "ms", projectIds: ["p1"] },
    { id: "3", city: "Cuiabá", entityCity: null, entityUf: "MT", projectIds: "lixo" },
  ];

  it("lê os sistemas da visita mesmo quando o JSON veio torto", () => {
    expect(readProjetosDaVisita(["a", 1, "b"])).toEqual(["a", "b"]);
    expect(readProjetosDaVisita(null)).toEqual([]);
    expect(readProjetosDaVisita("x")).toEqual([]);
  });

  it("filtra por UF e cidade sem ligar para caixa ou acento", () => {
    expect(filterVisitas(visitas, { uf: "MS" }).map((v) => v.id)).toEqual(["1", "2"]);
    expect(filterVisitas(visitas, { cidade: "cuiaba" }).map((v) => v.id)).toEqual(["3"]);
    // Sem cidade na visita, vale a cidade da entidade
    expect(filterVisitas(visitas, { cidade: "DOURADOS" }).map((v) => v.id)).toEqual(["2"]);
    expect(filterVisitas(visitas, { projetoIds: ["p2"] }).map((v) => v.id)).toEqual(["1"]);
    expect(filterVisitas(visitas, {}).length).toBe(3);
  });

  it("conta cada sistema atendido na visita", () => {
    expect([...countVisitasPorSistema(visitas).entries()]).toEqual([
      ["p1", 2],
      ["p2", 1],
    ]);
  });
});

const d = (dia: number) => new Date(Date.UTC(2026, 8, dia));

describe("horas analíticas", () => {
  it("agrupa os lançamentos por analista, do que mais lançou ao que menos", () => {
    const grupos = groupLancamentosPorAnalista([
      { id: "l1", usuarioId: "a", minutos: 30, data: d(3) },
      { id: "l2", usuarioId: "b", minutos: 120, data: d(1) },
      { id: "l3", usuarioId: "a", minutos: 60, data: d(1) },
    ]);
    expect(grupos.map((g) => [g.usuarioId, g.minutos, g.lancamentos.map((l) => l.id)])).toEqual([
      ["b", 120, ["l2"]],
      ["a", 90, ["l3", "l1"]],
    ]);
  });
});

describe("log de chamados", () => {
  it("descreve a atividade em português", () => {
    expect(describeAtividade({ verb: "created", field: "issue" })).toBe("Criou o chamado");
    expect(describeAtividade({ verb: "updated", field: "state" })).toBe("Mudou a etapa");
    expect(describeAtividade({ verb: "updated", field: "assignees" })).toBe("Mudou os responsáveis");
    expect(describeAtividade({ verb: "updated", field: "campo_novo" })).toBe("Alterou campo_novo");
  });

  it("junta atividades e comentários do mais recente para o mais antigo", () => {
    const linhas = mergeLogDeChamados(
      [{ id: "a", em: new Date(Date.UTC(2026, 0, 2)) }],
      [{ id: "c", em: new Date(Date.UTC(2026, 0, 3)) }]
    );
    expect(linhas.map((l) => l.id)).toEqual(["c", "a"]);
  });
});
