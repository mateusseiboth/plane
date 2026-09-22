/**
 * Motor de marcos por etapa dos relatórios (atribuído, início e fim no TI,
 * homologação, encerramento e devoluções), lido do histórico de etapa
 * (`issue_activities` field=state). Puro, sem banco.
 */
import { describe, expect, it } from "bun:test";
import { buildMarcos, type ChamadoParaMarcos } from "@modules/reports/marcos/marcos";
import { DEFAULT_STATES } from "@utils/project-defaults";
import { STATE } from "@utils/permissions";

const GRUPO_DA_ETAPA: Record<string, string> = Object.fromEntries(DEFAULT_STATES.map((s) => [s.name, s.group]));
const grupoDaEtapa = (nome: string | null) => (nome ? (GRUPO_DA_ETAPA[nome] ?? null) : null);

const dia = (d: number, h = 12) => new Date(Date.UTC(2026, 8, d, h));

const chamado = (over: Partial<ChamadoParaMarcos> = {}): ChamadoParaMarcos => ({
  criadoEm: dia(1),
  concluidoEm: null,
  etapaAtual: STATE.EM_DESENVOLVIMENTO,
  transicoes: [],
  atribuicoes: [],
  ...over,
});

const t = (de: string | null, para: string | null, em: Date, por = "u1") => ({ de, para, em, por });

describe("buildMarcos", () => {
  it("as etapas usadas existem no fluxo padrão", () => {
    for (const nome of [STATE.EM_DESENVOLVIMENTO, STATE.EM_TESTE, STATE.CONCLUIDO, STATE.CANCELADO]) {
      expect(GRUPO_DA_ETAPA[nome]).toBeDefined();
    }
  });

  it("atribuído é a primeira atribuição", () => {
    const m = buildMarcos(
      chamado({
        atribuicoes: [
          { usuarioId: "b", em: dia(5) },
          { usuarioId: "a", em: dia(3) },
        ],
      }),
      grupoDaEtapa
    );
    expect(m.atribuidoEm).toEqual(dia(3));
    expect(m.abertoEm).toEqual(dia(1));
  });

  it("início do TI é a primeira entrada em Em Desenvolvimento", () => {
    const m = buildMarcos(
      chamado({
        transicoes: [
          t(STATE.A_FAZER, STATE.EM_DESENVOLVIMENTO, dia(4)),
          t(STATE.EM_DESENVOLVIMENTO, STATE.EM_TESTE, dia(6)),
          t(STATE.EM_TESTE, STATE.EM_DESENVOLVIMENTO, dia(7)),
        ],
      }),
      grupoDaEtapa
    );
    expect(m.inicioTiEm).toEqual(dia(4));
  });

  it("finalizado TI é a ÚLTIMA saída de Em Desenvolvimento, com quem moveu", () => {
    const m = buildMarcos(
      chamado({
        etapaAtual: STATE.EM_TESTE,
        transicoes: [
          t(STATE.A_FAZER, STATE.EM_DESENVOLVIMENTO, dia(4)),
          t(STATE.EM_DESENVOLVIMENTO, STATE.EM_TESTE, dia(6), "dev1"),
          t(STATE.EM_TESTE, STATE.EM_DESENVOLVIMENTO, dia(7), "qld"),
          t(STATE.EM_DESENVOLVIMENTO, STATE.EM_TESTE, dia(9), "dev2"),
        ],
      }),
      grupoDaEtapa
    );
    expect(m.finalizadoTiEm).toEqual(dia(9));
    expect(m.finalizadoTiPor).toBe("dev2");
  });

  it("cancelar direto de Em Desenvolvimento não é finalizar no TI", () => {
    const m = buildMarcos(
      chamado({ etapaAtual: STATE.CANCELADO, transicoes: [t(STATE.EM_DESENVOLVIMENTO, STATE.CANCELADO, dia(5))] }),
      grupoDaEtapa
    );
    expect(m.finalizadoTiEm).toBeNull();
  });

  it("homologado é a saída de Em Teste para uma etapa concluída", () => {
    const m = buildMarcos(
      chamado({
        etapaAtual: STATE.CONCLUIDO,
        transicoes: [
          t(STATE.EM_DESENVOLVIMENTO, STATE.EM_TESTE, dia(6)),
          t(STATE.EM_TESTE, STATE.CONCLUIDO, dia(8), "qld"),
        ],
      }),
      grupoDaEtapa
    );
    expect(m.homologadoEm).toEqual(dia(8));
    expect(m.homologadoPor).toBe("qld");
  });

  it("encerrado é a última entrada numa etapa encerrada, enquanto ele continua encerrado", () => {
    const m = buildMarcos(
      chamado({
        etapaAtual: STATE.CONCLUIDO,
        transicoes: [t(STATE.EM_TESTE, STATE.CONCLUIDO, dia(8), "qld")],
      }),
      grupoDaEtapa
    );
    expect(m.encerradoEm).toEqual(dia(8));
    expect(m.encerradoPor).toBe("qld");
  });

  it("chamado reaberto não tem encerramento", () => {
    const m = buildMarcos(
      chamado({
        etapaAtual: STATE.EM_DESENVOLVIMENTO,
        concluidoEm: dia(8),
        transicoes: [t(STATE.EM_TESTE, STATE.CONCLUIDO, dia(8)), t(STATE.CONCLUIDO, STATE.EM_DESENVOLVIMENTO, dia(9))],
      }),
      grupoDaEtapa
    );
    expect(m.encerradoEm).toBeNull();
  });

  it("sem histórico, o encerramento vem de completed_at (chamado migrado)", () => {
    const m = buildMarcos(chamado({ etapaAtual: STATE.CONCLUIDO, concluidoEm: dia(20) }), grupoDaEtapa);
    expect(m.encerradoEm).toEqual(dia(20));
    expect(m.encerradoPor).toBeNull();
  });

  it("devolução é cada volta de Em Teste para Em Desenvolvimento", () => {
    const m = buildMarcos(
      chamado({
        transicoes: [
          t(STATE.EM_DESENVOLVIMENTO, STATE.EM_TESTE, dia(6)),
          t(STATE.EM_TESTE, STATE.EM_DESENVOLVIMENTO, dia(7), "q1"),
          t(STATE.EM_DESENVOLVIMENTO, STATE.EM_TESTE, dia(8)),
          t(STATE.EM_TESTE, STATE.EM_DESENVOLVIMENTO, dia(9), "q2"),
        ],
      }),
      grupoDaEtapa
    );
    expect(m.devolucoes).toEqual([
      { em: dia(7), por: "q1" },
      { em: dia(9), por: "q2" },
    ]);
  });

  it("ordena o histórico antes de ler, qualquer que seja a ordem recebida", () => {
    const m = buildMarcos(
      chamado({
        etapaAtual: STATE.EM_TESTE,
        transicoes: [
          t(STATE.EM_DESENVOLVIMENTO, STATE.EM_TESTE, dia(9), "tarde"),
          t(STATE.EM_DESENVOLVIMENTO, STATE.EM_TESTE, dia(6), "cedo"),
        ],
      }),
      grupoDaEtapa
    );
    expect(m.finalizadoTiPor).toBe("tarde");
  });
});
