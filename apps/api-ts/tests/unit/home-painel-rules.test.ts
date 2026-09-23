/**
 * Painel da página inicial: regras puras (período da série, dias sem movimento,
 * ranking, mês corrente, tipo de cada evento da atividade, resumo dos sistemas,
 * métricas do mês por papel e quem pode concluir uma tarefa).
 * Sem banco. O dia é contado no fuso do escritório (America/Campo_Grande, UTC-4).
 */
import { describe, expect, it } from "bun:test";
import {
  buildMetricasDeEncerramento,
  buildMetricasDeMovimentacao,
  classifyAtividade,
  fillSerie,
  formatDuracao,
  isConcluivel,
  mergeEventos,
  rankPosicao,
  readPerfilDeMetricas,
  readPeriodoDaSerie,
  resolveJanelaDaSerie,
  resolveMesCorrente,
  summarizeSistemas,
} from "@modules/home/painel.rules";
import {
  DEFAULT_ROLES,
  DEFAULT_TRANSITIONS,
  STATE,
  type EffectiveRole,
  type EtapaDaTransicao,
} from "@utils/permissions";

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

const sistema = (n: number) => ({ id: `p${n}`, name: `Sistema ${n}`, identifier: `S${n}` });
const varios = (quantos: number) => Array.from({ length: quantos }, (_, i) => sistema(i + 1));

describe("sistemas em que a pessoa atua", () => {
  it("o mesmo sistema repetido conta uma vez", () => {
    const resumo = summarizeSistemas([sistema(1), sistema(2), sistema(1), sistema(2)], 5);
    expect(resumo).toEqual({ texto: null, etiquetas: [sistema(1), sistema(2)], restantes: 0 });
  });

  it("quem atua em todos os sistemas ativos do espaço vê o total, sem a lista", () => {
    const resumo = summarizeSistemas([...varios(3), sistema(1), sistema(3)], 3);
    expect(resumo).toEqual({ texto: "Todos os sistemas (3)", etiquetas: [], restantes: 0 });
  });

  it("mais de 8 sistemas vira uma contagem", () => {
    expect(summarizeSistemas(varios(9), 20)).toEqual({ texto: "9 sistemas", etiquetas: [], restantes: 0 });
  });

  it("até 8 sistemas: no máximo 6 etiquetas e o resto em +N", () => {
    expect(summarizeSistemas(varios(8), 20)).toEqual({ texto: null, etiquetas: varios(6), restantes: 2 });
    expect(summarizeSistemas(varios(6), 20)).toEqual({ texto: null, etiquetas: varios(6), restantes: 0 });
  });

  it("sem sistema não há texto nem etiqueta", () => {
    expect(summarizeSistemas([], 4)).toEqual({ texto: null, etiquetas: [], restantes: 0 });
  });
});

describe("métricas do mês pelo papel", () => {
  it("Qualidade, Atendimento e Visualizador são medidos pelo que movimentam", () => {
    expect(readPerfilDeMetricas("qualidade")).toBe("movimentacao");
    expect(readPerfilDeMetricas("atendimento")).toBe("movimentacao");
    expect(readPerfilDeMetricas("guest")).toBe("movimentacao");
  });

  it("os demais papéis, inclusive os criados na tela, são medidos pelo que encerram", () => {
    expect(readPerfilDeMetricas("admin")).toBe("encerramento");
    expect(readPerfilDeMetricas("gestor_projeto")).toBe("encerramento");
    expect(readPerfilDeMetricas("member")).toBe("encerramento");
    expect(readPerfilDeMetricas("ti")).toBe("encerramento");
    expect(readPerfilDeMetricas("suporte_n2")).toBe("encerramento");
    expect(readPerfilDeMetricas("toString")).toBe("encerramento");
  });

  it("quem encerra: encerrados, em aberto, tempo médio e ranking, já prontos para a tela", () => {
    const metricas = buildMetricasDeEncerramento({
      encerrados: 12,
      em_aberto: 3,
      horas: 60,
      ranking: { posicao: 2, total_pessoas: 3 },
    });
    expect(metricas).toEqual([
      { rotulo: "Encerrados", valor: "12", complemento: "no mês" },
      { rotulo: "Em aberto", valor: "3", complemento: "com você" },
      { rotulo: "Tempo médio", valor: "2,5 dias", complemento: "até encerrar" },
      { rotulo: "Ranking", valor: "2º", complemento: "de 3 pessoas" },
    ]);
  });

  it("quem movimenta: movimentados, comentários, em aberto e ranking por movimentações", () => {
    const metricas = buildMetricasDeMovimentacao({
      movimentados: 5,
      comentarios: 4,
      em_aberto: 0,
      ranking: { posicao: 1, total_pessoas: 1 },
    });
    expect(metricas).toEqual([
      { rotulo: "Movimentados", valor: "5", complemento: "no mês" },
      { rotulo: "Comentários", valor: "4", complemento: "no mês" },
      { rotulo: "Em aberto", valor: "0", complemento: "com você" },
      { rotulo: "Ranking", valor: "1º", complemento: "de 1 pessoa" },
    ]);
  });

  it("sem posição no ranking, o marcador de vazio e o motivo de cada perfil", () => {
    const semPosicao = { posicao: null, total_pessoas: 4 };
    const encerramento = buildMetricasDeEncerramento({ encerrados: 0, em_aberto: 0, horas: null, ranking: semPosicao });
    const movimentacao = buildMetricasDeMovimentacao({
      movimentados: 0,
      comentarios: 0,
      em_aberto: 0,
      ranking: semPosicao,
    });
    expect(encerramento.at(-1)).toEqual({ rotulo: "Ranking", valor: "–", complemento: "sem encerrados no mês" });
    expect(movimentacao.at(-1)).toEqual({ rotulo: "Ranking", valor: "–", complemento: "sem movimentações no mês" });
  });

  it("duração: até dois dias em horas, depois em dias com uma casa", () => {
    expect(formatDuracao(null)).toBe("–");
    expect(formatDuracao(0.4)).toBe("< 1 h");
    expect(formatDuracao(18.4)).toBe("18 h");
    expect(formatDuracao(60)).toBe("2,5 dias");
  });
});

describe("pode concluir a tarefa (a mesma regra do quadro)", () => {
  const funcao = (key: string): EffectiveRole => {
    const padrao = DEFAULT_ROLES.find((r) => r.key === key)!;
    return { id: null, key, level: padrao.level, permissions: padrao.permissions };
  };
  const emTeste: EtapaDaTransicao = { group: "started", name: STATE.EM_TESTE };
  const aFazer: EtapaDaTransicao = { group: "unstarted", name: STATE.A_FAZER };
  const concluido: EtapaDaTransicao = { group: "completed", name: STATE.CONCLUIDO };
  const tarefa = (de: EtapaDaTransicao, isAutor = false) => ({ de, para: concluido, isAutor });

  it("administrador e gestor concluem de qualquer etapa", () => {
    expect(isConcluivel(funcao("admin"), [], tarefa(aFazer))).toBe(true);
    expect(isConcluivel(funcao("gestor_projeto"), [], tarefa(aFazer))).toBe(true);
  });

  it("Qualidade conclui o que está em teste, e só isso", () => {
    const regras = DEFAULT_TRANSITIONS.qualidade;
    expect(isConcluivel(funcao("qualidade"), regras, tarefa(emTeste))).toBe(true);
    expect(isConcluivel(funcao("qualidade"), regras, tarefa(aFazer))).toBe(false);
  });

  it("TI edita o chamado mas não o conclui", () => {
    expect(isConcluivel(funcao("ti"), DEFAULT_TRANSITIONS.ti, tarefa(emTeste))).toBe(false);
  });

  it("Visualizador não conclui nada", () => {
    expect(isConcluivel(funcao("guest"), [], tarefa(emTeste))).toBe(false);
  });

  it("quem só edita os próprios chamados conclui só os que abriu", () => {
    const soOsProprios: EffectiveRole = {
      id: null,
      key: "x",
      level: 10,
      permissions: ["issue.edit.own", "state.unrestricted"],
    };
    expect(isConcluivel(soOsProprios, [], tarefa(aFazer, true))).toBe(true);
    expect(isConcluivel(soOsProprios, [], tarefa(aFazer, false))).toBe(false);
  });

  it("sem função no sistema ou sem etapa de conclusão, não conclui", () => {
    expect(isConcluivel(null, [], tarefa(aFazer))).toBe(false);
    expect(isConcluivel(funcao("admin"), [], { de: aFazer, para: null, isAutor: true })).toBe(false);
  });
});
