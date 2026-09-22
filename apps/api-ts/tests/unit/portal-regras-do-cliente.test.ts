/**
 * O que o cliente pode fazer com uma solicitação no portal, para onde o chamado
 * vai quando ele reabre ou encerra, e a leitura da avaliação. Puro, sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  EXPECTATIVAS,
  NOTAS_DE_ATENDIMENTO,
  pickEstadoDeEncerramento,
  pickEstadoDeReabertura,
  readAcoesDoCliente,
  readAvaliacao,
  readTextoDaInteracao,
} from "@modules/portal/regras-do-cliente";

const PENDENTE = -2;
const ACEITA = 1;
const RECUSADA = -1;
const DUPLICADA = 2;
const ATENDIDA = 3;

const NENHUMA = { responder: false, reabrir: false, encerrar: false, avaliar: false };

describe("readAcoesDoCliente", () => {
  it("em andamento: responde e encerra, não reabre nem avalia", () => {
    expect(readAcoesDoCliente({ intakeStatus: ACEITA, grupo: "started", avaliada: false })).toEqual({
      responder: true,
      reabrir: false,
      encerrar: true,
      avaliar: false,
    });
  });

  it("ainda na triagem também aceita resposta e encerramento", () => {
    expect(readAcoesDoCliente({ intakeStatus: PENDENTE, grupo: "triage", avaliada: false })).toMatchObject({
      responder: true,
      encerrar: true,
    });
  });

  it("concluída: reabre e avalia enquanto não avaliou", () => {
    expect(readAcoesDoCliente({ intakeStatus: ATENDIDA, grupo: "completed", avaliada: false })).toEqual({
      responder: false,
      reabrir: true,
      encerrar: false,
      avaliar: true,
    });
  });

  it("concluída e já avaliada: só reabre", () => {
    expect(readAcoesDoCliente({ intakeStatus: ATENDIDA, grupo: "completed", avaliada: true })).toEqual({
      ...NENHUMA,
      reabrir: true,
    });
  });

  it("cancelada pela equipe: nada a fazer", () => {
    expect(readAcoesDoCliente({ intakeStatus: ACEITA, grupo: "cancelled", avaliada: false })).toEqual(NENHUMA);
  });

  it("recusada ou duplicada na triagem: nada a fazer, qualquer que seja o estado", () => {
    expect(readAcoesDoCliente({ intakeStatus: RECUSADA, grupo: "started", avaliada: false })).toEqual(NENHUMA);
    expect(readAcoesDoCliente({ intakeStatus: DUPLICADA, grupo: "completed", avaliada: false })).toEqual(NENHUMA);
  });
});

const estado = (name: string, group: string, sequence: number, isDefault = false) => ({
  id: name,
  name,
  group,
  sequence,
  default: isDefault,
});

const PADRAO = [
  estado("Triagem", "triage", 1000),
  estado("Pendências", "backlog", 5000, true),
  estado("A Fazer", "unstarted", 10000),
  estado("Em Análise", "started", 20000),
  estado("Em Desenvolvimento", "started", 25000),
  estado("Concluído", "completed", 40000),
  estado("Cancelado", "cancelled", 50000),
];

describe("pickEstadoDeReabertura", () => {
  it("volta para Em Análise, a mesma etapa de quando a triagem aceita", () => {
    expect(pickEstadoDeReabertura(PADRAO)?.name).toBe("Em Análise");
  });

  it("sem Em Análise, cai no primeiro estado em andamento", () => {
    const semAnalise = PADRAO.filter((e) => e.name !== "Em Análise");
    expect(pickEstadoDeReabertura(semAnalise)?.name).toBe("Em Desenvolvimento");
  });

  it("sem estado em andamento, cai no padrão do projeto", () => {
    const soBasico = PADRAO.filter((e) => e.group !== "started");
    expect(pickEstadoDeReabertura(soBasico)?.name).toBe("Pendências");
  });

  it("sem nada que sirva, devolve null", () => {
    expect(pickEstadoDeReabertura([estado("Concluído", "completed", 1)])).toBeNull();
  });
});

describe("pickEstadoDeEncerramento", () => {
  it("vai para Concluído", () => {
    expect(pickEstadoDeEncerramento(PADRAO)?.name).toBe("Concluído");
  });

  it("sem Concluído, usa o primeiro estado do grupo de conclusão", () => {
    const renomeado = [estado("Feito", "completed", 3), estado("Entregue", "completed", 2)];
    expect(pickEstadoDeEncerramento(renomeado)?.name).toBe("Entregue");
  });

  it("projeto sem estado de conclusão devolve null", () => {
    expect(pickEstadoDeEncerramento([estado("A Fazer", "unstarted", 1)])).toBeNull();
  });
});

describe("readAvaliacao", () => {
  it("aceita nota e expectativa dentro das escalas, com comentário opcional", () => {
    expect(readAvaliacao({ nota_atendimento: 3, expectativa: 4, comentario: "  Resolveu rápido.  " })).toEqual({
      notaAtendimento: 3,
      expectativa: 4,
      comentario: "Resolveu rápido.",
    });
    expect(readAvaliacao({ nota_atendimento: "1", expectativa: "2" })).toEqual({
      notaAtendimento: 1,
      expectativa: 2,
      comentario: null,
    });
  });

  it("recusa com o erro no campo que faltou", () => {
    const recusa = (() => {
      try {
        readAvaliacao({ nota_atendimento: 9 });
        return null;
      } catch (erro) {
        return erro as any;
      }
    })();
    expect(recusa.status).toBe(400);
    expect(recusa.errors.map((e: any) => e.path).toSorted()).toEqual(["expectativa", "nota_atendimento"]);
  });

  it("as escalas são as do suporte antigo", () => {
    expect(NOTAS_DE_ATENDIMENTO).toEqual({ 1: "Ruim", 2: "Bom", 3: "Ótimo" });
    expect(EXPECTATIVAS).toEqual({ 1: "Não era o que eu precisava", 2: "Não", 3: "Parcialmente", 4: "Sim" });
  });
});

describe("readTextoDaInteracao", () => {
  it("limpa o HTML do cliente e devolve o texto puro junto", () => {
    expect(readTextoDaInteracao("<p>Ainda <b>dá</b> erro<script>x()</script></p>")).toEqual({
      html: "<p>Ainda <strong>dá</strong> erro</p>",
      texto: "Ainda dá erro",
    });
  });

  it("texto vazio (só marcação) devolve null", () => {
    expect(readTextoDaInteracao("<p> </p><p><br></p>")).toBeNull();
    expect(readTextoDaInteracao(undefined)).toBeNull();
  });
});
