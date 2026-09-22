/**
 * Agregações puras dos relatórios de chamados: tipo pela etiqueta, período em
 * horário de Brasília, visão por sistema (pendente, em andamento, a homologar,
 * concluído) × tipo, balanço com saldo acumulado e o sintético semanal. Sem banco.
 */
import { describe, expect, it } from "bun:test";
import { buildBalanco } from "@modules/reports/balanco/balanco";
import { resolvePeriodo, resolveSemanaAtual } from "@modules/reports/comum/periodo";
import { resolveTipoDoChamado } from "@modules/reports/comum/tipo-do-chamado";
import { buildSinteticoSemanal } from "@modules/reports/sintetico-semanal/sintetico-semanal";
import { buildVisaoPorSistema, classifySituacaoDoSistema } from "@modules/reports/visao-por-sistema/visao-por-sistema";
import { STATE } from "@utils/permissions";

const utc = (iso: string) => new Date(iso);

describe("resolveTipoDoChamado", () => {
  it("lê a etiqueta sem ligar para acento ou caixa", () => {
    expect(resolveTipoDoChamado(["CORRECAO"])).toBe("correcao");
    expect(resolveTipoDoChamado(["Melhoria"])).toBe("melhoria");
    expect(resolveTipoDoChamado(["projeto"])).toBe("projeto");
  });

  it("sem etiqueta de tipo é Outros", () => {
    expect(resolveTipoDoChamado(["Urgente", "Financeiro"])).toBe("outros");
    expect(resolveTipoDoChamado([])).toBe("outros");
  });

  it("com duas etiquetas de tipo, Correção vence Melhoria, que vence Projeto", () => {
    expect(resolveTipoDoChamado(["Projeto", "Melhoria"])).toBe("melhoria");
    expect(resolveTipoDoChamado(["Melhoria", "Correção"])).toBe("correcao");
  });
});

describe("período em horário de Brasília", () => {
  it("a semana atual vai de segunda 00:00 a domingo 23:59:59 em Brasília", () => {
    // quarta, 23/09/2026 10:00 em Brasília
    const { inicio, fim } = resolveSemanaAtual(utc("2026-09-23T13:00:00Z"));
    expect(inicio.toISOString()).toBe("2026-09-21T03:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-09-28T02:59:59.999Z");
  });

  it("domingo à noite em Brasília ainda é a mesma semana", () => {
    // domingo 27/09 22:00 em Brasília = segunda 01:00 UTC
    const { inicio } = resolveSemanaAtual(utc("2026-09-28T01:00:00Z"));
    expect(inicio.toISOString()).toBe("2026-09-21T03:00:00.000Z");
  });

  it("usa o período informado e só cai no padrão para o que falta", () => {
    const padrao = () => ({ inicio: utc("2026-01-01T00:00:00Z"), fim: utc("2026-12-31T00:00:00Z") });
    const p = resolvePeriodo({ dateFrom: utc("2026-05-01T00:00:00Z") }, padrao);
    expect(p.inicio.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(p.fim.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
});

describe("visão por sistema", () => {
  it("classifica a etapa na situação do painel do SAC", () => {
    expect(classifySituacaoDoSistema({ etapa: STATE.TRIAGEM, grupo: "triage" })).toBe("pendente");
    expect(classifySituacaoDoSistema({ etapa: STATE.A_FAZER, grupo: "unstarted" })).toBe("pendente");
    expect(classifySituacaoDoSistema({ etapa: STATE.PENDENCIAS, grupo: "backlog" })).toBe("pendente");
    expect(classifySituacaoDoSistema({ etapa: STATE.EM_DESENVOLVIMENTO, grupo: "started" })).toBe("em_andamento");
    expect(classifySituacaoDoSistema({ etapa: STATE.EM_TESTE, grupo: "started" })).toBe("a_homologar");
    expect(classifySituacaoDoSistema({ etapa: STATE.CONCLUIDO, grupo: "completed" })).toBe("concluido");
    expect(classifySituacaoDoSistema({ etapa: STATE.CANCELADO, grupo: "cancelled" })).toBe("cancelado");
    expect(classifySituacaoDoSistema({ etapa: null, grupo: null })).toBe("pendente");
  });

  it("conta por sistema e cruza com o tipo", () => {
    const visao = buildVisaoPorSistema([
      { projetoId: "p1", etapa: STATE.EM_TESTE, grupo: "started", tipo: "correcao" },
      { projetoId: "p1", etapa: STATE.EM_TESTE, grupo: "started", tipo: "melhoria" },
      { projetoId: "p1", etapa: STATE.CONCLUIDO, grupo: "completed", tipo: "correcao" },
      { projetoId: "p2", etapa: STATE.A_FAZER, grupo: "unstarted", tipo: "projeto" },
    ]);
    const p1 = visao.get("p1")!;
    expect(p1.total).toBe(3);
    expect(p1.a_homologar).toBe(2);
    expect(p1.concluido).toBe(1);
    expect(p1.por_tipo.correcao).toMatchObject({ total: 2, a_homologar: 1, concluido: 1 });
    expect(p1.por_tipo.projeto.total).toBe(0);
    expect(visao.get("p2")!.pendente).toBe(1);
  });
});

describe("balanço", () => {
  const chamados = [
    { criadoEm: utc("2025-12-10T12:00:00Z"), encerradoEm: null },
    { criadoEm: utc("2025-12-11T12:00:00Z"), encerradoEm: utc("2026-01-05T12:00:00Z") },
    { criadoEm: utc("2026-01-03T12:00:00Z"), encerradoEm: utc("2026-01-20T12:00:00Z") },
    { criadoEm: utc("2026-01-04T12:00:00Z"), encerradoEm: null },
    { criadoEm: utc("2026-02-02T12:00:00Z"), encerradoEm: utc("2026-02-03T12:00:00Z") },
  ];

  it("mensal: saldo anterior, abertos, encerrados e saldo acumulado", () => {
    const b = buildBalanco({
      chamados,
      inicio: utc("2026-01-01T03:00:00Z"),
      fim: utc("2026-02-28T12:00:00Z"),
      granularidade: "mes",
    });
    expect(b.linhas.map((l) => l.periodo)).toEqual(["2026-01", "2026-02"]);
    expect(b.linhas[0]).toMatchObject({ saldo_anterior: 2, abertos: 2, encerrados: 2, diferenca: 0, saldo_atual: 2 });
    expect(b.linhas[1]).toMatchObject({ saldo_anterior: 2, abertos: 1, encerrados: 1, saldo_atual: 2 });
    expect(b.totais).toMatchObject({ saldo_inicial: 2, abertos: 3, encerrados: 3, saldo_final: 2 });
  });

  it("o mês é o de Brasília: 31/12 às 22h ainda é dezembro", () => {
    const b = buildBalanco({
      chamados: [{ criadoEm: utc("2027-01-01T01:00:00Z"), encerradoEm: null }],
      inicio: utc("2026-12-01T03:00:00Z"),
      fim: utc("2027-01-31T12:00:00Z"),
      granularidade: "mes",
    });
    expect(b.linhas.find((l) => l.periodo === "2026-12")!.abertos).toBe(1);
  });

  it("anual: um bucket por ano com o saldo que vem do ano anterior", () => {
    const b = buildBalanco({
      chamados,
      inicio: utc("2025-01-01T03:00:00Z"),
      fim: utc("2026-12-31T12:00:00Z"),
      granularidade: "ano",
    });
    expect(b.linhas.map((l) => l.periodo)).toEqual(["2025", "2026"]);
    expect(b.linhas[0]).toMatchObject({ saldo_anterior: 0, abertos: 2, encerrados: 0, saldo_atual: 2 });
    expect(b.linhas[1]).toMatchObject({ saldo_anterior: 2, abertos: 3, encerrados: 3, saldo_atual: 2 });
  });
});

describe("sintético semanal", () => {
  const periodo = { inicio: utc("2026-09-21T03:00:00Z"), fim: utc("2026-09-28T02:59:59Z") };
  const dentro = utc("2026-09-23T15:00:00Z");
  const fora = utc("2026-09-10T15:00:00Z");

  it("monta responsável × sistema × tipo com concluídos, pendentes e interações", () => {
    const linhas = buildSinteticoSemanal({
      periodo,
      chamados: [
        {
          projetoId: "p1",
          tipo: "correcao",
          responsaveis: ["dev"],
          etapa: STATE.EM_TESTE,
          grupo: "started",
          finalizadoTiEm: dentro,
        },
        {
          projetoId: "p1",
          tipo: "melhoria",
          responsaveis: ["dev"],
          etapa: STATE.CONCLUIDO,
          grupo: "completed",
          finalizadoTiEm: fora,
        },
        {
          projetoId: "p1",
          tipo: "projeto",
          responsaveis: ["dev", "outro"],
          etapa: STATE.EM_DESENVOLVIMENTO,
          grupo: "started",
          finalizadoTiEm: null,
        },
        {
          projetoId: "p2",
          tipo: "correcao",
          responsaveis: ["dev"],
          etapa: STATE.A_FAZER,
          grupo: "unstarted",
          finalizadoTiEm: null,
        },
      ],
      interacoes: [
        { usuarioId: "dev", projetoId: "p1", total: 5 },
        { usuarioId: "dev", projetoId: "p3", total: 2 },
      ],
    });

    const dev = linhas.find((l) => l.usuarioId === "dev")!;
    const p1 = dev.sistemas.find((s) => s.projetoId === "p1")!;
    expect(p1.concluidos).toMatchObject({ correcao: 1, melhoria: 0, total: 1 });
    // Em Teste já saiu do TI: não é pendência dele
    expect(p1.pendentes).toMatchObject({ projeto: 1, correcao: 0, total: 1 });
    expect(p1.interacoes).toBe(5);
    expect(dev.sistemas.find((s) => s.projetoId === "p2")!.pendentes.correcao).toBe(1);
    expect(dev.sistemas.find((s) => s.projetoId === "p3")!.interacoes).toBe(2);
    expect(dev.totais).toMatchObject({ interacoes: 7, concluidos: 1, pendentes: 2 });
    expect(linhas.find((l) => l.usuarioId === "outro")!.totais.pendentes).toBe(1);
  });

  it("quem não tem nada na semana não aparece", () => {
    const linhas = buildSinteticoSemanal({
      periodo,
      chamados: [
        {
          projetoId: "p1",
          tipo: "correcao",
          responsaveis: ["x"],
          etapa: STATE.CONCLUIDO,
          grupo: "completed",
          finalizadoTiEm: fora,
        },
      ],
      interacoes: [],
    });
    expect(linhas).toEqual([]);
  });
});
