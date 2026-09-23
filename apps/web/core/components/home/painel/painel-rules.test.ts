/**
 * Painel da página inicial: regras puras da tela (grupos de prazo das tarefas,
 * prazo e tempo relativos em pt-BR, texto de cada evento da atividade, ranking,
 * duração e o ponto da série). Datas montadas no fuso local, então o resultado
 * não depende do fuso da máquina. Rodar com `bun test core/components/home`.
 */
import { describe, expect, it } from "bun:test";
import {
  buildResumoDoDia,
  formatDataLonga,
  formatDiaDoEixo,
  formatDuracao,
  formatPrazoRelativo,
  formatRanking,
  formatTempoRelativo,
  groupTarefasPorPrazo,
  isEventoDoPainel,
  readReferenciaDoChamado,
  readTextoDoEvento,
} from "@/components/home/painel/painel-rules";
import type { TEventoDaHome, TTarefaDaHome } from "@/services/home-painel.service";

/** Quarta-feira, 23/09/2026, 10h (horário local). */
const AGORA = new Date(2026, 8, 23, 10, 0);

const emDias = (dias: number, hora = 12) => new Date(2026, 8, 23 + dias, hora, 0).toISOString();

const tarefa = (id: string, target_date: string | null): TTarefaDaHome => ({
  id,
  name: `Chamado ${id}`,
  numero: `${id}-2026`,
  sequence_id: 1,
  project_id: "p1",
  project_identifier: "TRIB",
  project_name: "Tributos",
  entity_name: null,
  priority: "medium",
  target_date,
  state_name: "A fazer",
  completed_state_id: "s9",
});

const chamado = {
  id: "c1",
  name: "Guia do ISS",
  numero: "1248-2025",
  sequence_id: 7,
  project_id: "p1",
  project_identifier: "TRIB",
  project_name: "Tributos",
};

const evento = (tipo: TEventoDaHome["tipo"], extra: Partial<TEventoDaHome> = {}): TEventoDaHome => ({
  id: "e1",
  tipo,
  criado_em: AGORA.toISOString(),
  chamado,
  ...extra,
});

describe("grupos de prazo das tarefas", () => {
  it("separa em Hoje, Amanhã, Esta semana, Depois e Atrasados, nesta ordem, sem grupo vazio", () => {
    const grupos = groupTarefasPorPrazo(
      [
        tarefa("atrasada", emDias(-2)),
        tarefa("hoje", emDias(0, 18)),
        tarefa("amanha", emDias(1)),
        tarefa("sexta", emDias(2)),
        tarefa("domingo", emDias(4)),
        tarefa("segunda", emDias(5)),
      ],
      AGORA
    );
    expect(grupos.map((g) => g.rotulo)).toEqual(["Hoje", "Amanhã", "Esta semana", "Depois", "Atrasados"]);
    expect(grupos.map((g) => g.tarefas.map((t) => t.id))).toEqual([
      ["hoje"],
      ["amanha"],
      ["sexta", "domingo"],
      ["segunda"],
      ["atrasada"],
    ]);
  });

  it("o que venceu hoje mais cedo já está atrasado", () => {
    const grupos = groupTarefasPorPrazo([tarefa("cedo", emDias(0, 8))], AGORA);
    expect(grupos).toEqual([
      { chave: "atrasados", rotulo: "Atrasados", tarefas: [expect.objectContaining({ id: "cedo" })] },
    ]);
  });

  it("tarefa sem prazo não entra e lista vazia não tem grupo", () => {
    expect(groupTarefasPorPrazo([tarefa("sem", null)], AGORA)).toEqual([]);
    expect(groupTarefasPorPrazo([], AGORA)).toEqual([]);
  });
});

describe("prazo relativo", () => {
  it("fala em dias de calendário, em pt-BR", () => {
    expect(formatPrazoRelativo(emDias(0, 18), AGORA)).toBe("hoje");
    expect(formatPrazoRelativo(emDias(1), AGORA)).toBe("amanhã");
    expect(formatPrazoRelativo(emDias(5), AGORA)).toBe("em 5 dias");
    expect(formatPrazoRelativo(emDias(-1), AGORA)).toBe("ontem");
    expect(formatPrazoRelativo(emDias(-2), AGORA)).toBe("há 2 dias");
    expect(formatPrazoRelativo(emDias(2), AGORA)).toBe("em 2 dias");
  });
});

describe("tempo relativo da atividade", () => {
  const antes = (ms: number) => new Date(AGORA.getTime() - ms).toISOString();
  const MIN = 60_000;

  it("minutos e horas no mesmo dia", () => {
    expect(formatTempoRelativo(antes(20_000), AGORA)).toBe("agora mesmo");
    expect(formatTempoRelativo(antes(5 * MIN), AGORA)).toBe("há 5 minutos");
    expect(formatTempoRelativo(antes(2 * 60 * MIN), AGORA)).toBe("há 2 horas");
  });

  it("dias de calendário e, depois de uma semana, a data", () => {
    expect(formatTempoRelativo(new Date(2026, 8, 22, 18, 0).toISOString(), AGORA)).toBe("ontem");
    expect(formatTempoRelativo(new Date(2026, 8, 20, 9, 0).toISOString(), AGORA)).toBe("há 3 dias");
    expect(formatTempoRelativo(new Date(2026, 7, 12, 9, 0).toISOString(), AGORA)).toBe("12 de ago.");
  });
});

describe("texto do evento", () => {
  it("cada tipo tem o seu verbo, e o chamado vai pelo número", () => {
    expect(readTextoDoEvento(evento("abertura"))).toBe("Abriu o chamado 1248-2025");
    expect(readTextoDoEvento(evento("conclusao"))).toBe("Concluiu o chamado 1248-2025");
    expect(readTextoDoEvento(evento("comentario"))).toBe("Comentou no chamado 1248-2025");
    expect(readTextoDoEvento(evento("solicitacao_atendida"))).toBe("Atendeu a solicitação do chamado 1248-2025");
  });

  it("mudança de etapa diz para onde o chamado foi", () => {
    expect(readTextoDoEvento(evento("etapa", { etapa: "Em andamento" }))).toBe(
      "Moveu o chamado 1248-2025 para Em andamento"
    );
    expect(readTextoDoEvento(evento("etapa", { etapa: null }))).toBe("Moveu o chamado 1248-2025");
  });

  it("chamado sem número anual cai no identificador do sistema", () => {
    expect(readReferenciaDoChamado({ ...chamado, numero: null })).toBe("TRIB-7");
  });
});

describe("números do cartão da pessoa", () => {
  it("posição no ranking", () => {
    expect(formatRanking({ posicao: 2, total_pessoas: 3 })).toEqual({ valor: "2º", detalhe: "de 3 pessoas" });
    expect(formatRanking({ posicao: 1, total_pessoas: 1 })).toEqual({ valor: "1º", detalhe: "de 1 pessoa" });
    expect(formatRanking({ posicao: null, total_pessoas: 4 })).toEqual({
      valor: "–",
      detalhe: "sem encerrados no mês",
    });
  });

  it("duração média em horas ou dias", () => {
    expect(formatDuracao(null)).toBe("–");
    expect(formatDuracao(0.4)).toBe("< 1 h");
    expect(formatDuracao(18.4)).toBe("18 h");
    expect(formatDuracao(60)).toBe("2,5 dias");
  });
});

describe("eixo da série", () => {
  it("o dia sai como dd/mm", () => {
    expect(formatDiaDoEixo("2026-09-07")).toBe("07/09");
  });
});

describe("detalhes da pessoa", () => {
  it("data por extenso, em pt-BR", () => {
    expect(formatDataLonga(new Date(2024, 2, 12, 15, 0).toISOString())).toBe("12 de março de 2024");
  });
});

describe("tempo real", () => {
  it("revalida com mudança em chamado e com comentário da própria pessoa", () => {
    expect(isEventoDoPainel({ entity: "issue", actor: "bia" }, "ana")).toBe(true);
    expect(isEventoDoPainel({ entity: "comment", actor: "ana" }, "ana")).toBe(true);
    expect(isEventoDoPainel({ entity: "comment", actor: "bia" }, "ana")).toBe(false);
    expect(isEventoDoPainel({ entity: "mural", actor: "ana" }, "ana")).toBe(false);
  });
});

const resumo = (meus_atrasados: number, meus_vencem_hoje: number, meus_abertos: number) => ({
  meus_atrasados,
  meus_vencem_hoje,
  meus_abertos,
});

describe("resumo do dia na saudação", () => {
  it("o atraso vem antes do que vence hoje, que vem antes do total aberto", () => {
    expect(buildResumoDoDia(resumo(1, 3, 9))).toBe("1 chamado passou do prazo");
    expect(buildResumoDoDia(resumo(2, 3, 9))).toBe("2 chamados passaram do prazo");
    expect(buildResumoDoDia(resumo(0, 1, 9))).toBe("1 chamado vence hoje");
    expect(buildResumoDoDia(resumo(0, 3, 9))).toBe("3 chamados vencem hoje");
    expect(buildResumoDoDia(resumo(0, 0, 1))).toBe("1 chamado aberto com você");
    expect(buildResumoDoDia(resumo(0, 0, 9))).toBe("9 chamados abertos com você");
    expect(buildResumoDoDia(resumo(0, 0, 0))).toBe("Nenhum chamado aberto com você");
  });

  it("sem resumo, sem frase", () => {
    expect(buildResumoDoDia(undefined)).toBeUndefined();
  });
});
