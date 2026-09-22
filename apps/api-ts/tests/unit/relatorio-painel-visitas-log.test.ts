/**
 * Painel de TV (TI e Qualidade), filtros e contagem por sistema das visitas,
 * horas analíticas por analista e rótulo das linhas do log de chamados. Sem banco.
 */
import { describe, expect, it } from "bun:test";
import { groupLancamentosPorAnalista } from "@modules/reports/horas-analiticas/horas-analiticas";
import { describeAtividade, mergeLogDeChamados } from "@modules/reports/log-chamados/log-chamados";
import { buildPainel, isSetorDoPainel, type ChamadoDoPainel } from "@modules/reports/painel-tv/painel-tv";
import { countVisitasPorSistema, filterVisitas, readProjetosDaVisita } from "@modules/reports/visitas/visitas";
import { STATE } from "@utils/permissions";

const chamado = (id: string, etapa: string, over: Partial<ChamadoDoPainel> = {}): ChamadoDoPainel => ({
  id,
  etapa,
  prioridade: "medium",
  responsaveis: [],
  ...over,
});

const FUNCAO: Record<string, string> = { dev1: "ti", dev2: "ti", q1: "qualidade" };
const funcaoDe = (id: string) => FUNCAO[id] ?? null;

describe("painel de TV", () => {
  it("aceita só os setores conhecidos", () => {
    expect(isSetorDoPainel("ti")).toBe(true);
    expect(isSetorDoPainel("qualidade")).toBe(true);
    expect(isSetorDoPainel("financeiro")).toBe(false);
  });

  it("TI: colunas A fazer, Em desenvolvimento e Em teste, agrupado por desenvolvedor", () => {
    const painel = buildPainel(
      "ti",
      [
        chamado("a", STATE.A_FAZER),
        chamado("b", STATE.EM_DESENVOLVIMENTO, { responsaveis: ["dev1", "q1"] }),
        chamado("c", STATE.EM_DESENVOLVIMENTO, { responsaveis: ["dev2"] }),
        chamado("d", STATE.EM_TESTE, { responsaveis: ["dev1"] }),
        chamado("e", STATE.TRIAGEM),
      ],
      funcaoDe
    );
    expect(painel.colunas.map((c) => [c.chave, c.chamados.map((x) => x.id)])).toEqual([
      ["a_fazer", ["a"]],
      ["em_desenvolvimento", ["b", "c"]],
      ["em_teste", ["d"]],
    ]);
    // Só quem é do TI entra no agrupamento; a Qualidade que moveu o card não.
    expect(painel.por_pessoa.map((p) => [p.usuarioId, p.chamados.map((x) => x.id)])).toEqual([
      ["dev1", ["b", "d"]],
      ["dev2", ["c"]],
    ]);
  });

  it("Qualidade: verificar, analisar e homologar com a fatia de cada um", () => {
    const painel = buildPainel(
      "qualidade",
      [
        chamado("a", STATE.TRIAGEM),
        chamado("b", STATE.TRIAGEM),
        chamado("c", STATE.EM_ANALISE, { responsaveis: ["q1"] }),
        chamado("d", STATE.EM_TESTE),
      ],
      funcaoDe
    );
    expect(painel.colunas.map((c) => [c.chave, c.total, c.percentual])).toEqual([
      ["verificar", 2, 50],
      ["analisar", 1, 25],
      ["homologar", 1, 25],
    ]);
    expect(painel.por_pessoa.map((p) => p.usuarioId)).toEqual(["q1"]);
  });

  it("alerta: urgente parado na entrada do setor", () => {
    const urgente = { prioridade: "urgent" };
    const ti = buildPainel(
      "ti",
      [
        chamado("a", STATE.A_FAZER, urgente),
        chamado("b", STATE.EM_DESENVOLVIMENTO, urgente),
        chamado("c", STATE.A_FAZER),
      ],
      funcaoDe
    );
    expect(ti.alertas.map((c) => c.id)).toEqual(["a"]);

    const qld = buildPainel(
      "qualidade",
      [
        chamado("a", STATE.TRIAGEM, urgente),
        chamado("b", STATE.EM_ANALISE, urgente),
        chamado("c", STATE.EM_TESTE, urgente),
      ],
      funcaoDe
    );
    expect(qld.alertas.map((c) => c.id)).toEqual(["a", "c"]);
  });
});

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

describe("horas analíticas", () => {
  it("agrupa os lançamentos por analista, do que mais lançou ao que menos", () => {
    const d = (dia: number) => new Date(Date.UTC(2026, 8, dia));
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
