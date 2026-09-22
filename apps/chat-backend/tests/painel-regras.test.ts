/**
 * Regras do painel de TV do atendimento: em que aba cada conversa cai, o tempo
 * que a aba mostra, o contato e a ordem dos atendentes. Puro — sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  ABAS_DO_PAINEL,
  classifyAbaDoPainel,
  readContato,
  readSituacaoDoAtendente,
  readTempoDaLinha,
  sortAtendentes,
  type SessaoDoPainel,
} from "@/painel/painel-regras";

const AGORA = new Date("2026-09-22T15:00:00.000Z");

const sessao = (over: Partial<SessaoDoPainel> = {}): SessaoDoPainel => ({
  status: "active",
  endKind: null,
  createdAt: new Date("2026-09-22T14:00:00.000Z"),
  closedAt: null,
  pausedAt: null,
  lastClientMessageAt: null,
  lastAttendantMessageAt: null,
  ...over,
});

describe("abas", () => {
  it("são as seis do SAC, nessa ordem", () => {
    expect(ABAS_DO_PAINEL.map((a) => a.rotulo)).toEqual([
      "Em Atendimento",
      "Pausa",
      "Não Iniciado",
      "Espera",
      "Inativo",
      "Fechou Chat",
    ]);
  });

  it("atribuída sem nenhuma palavra do atendente é 'Não Iniciado'", () => {
    expect(classifyAbaDoPainel(sessao())).toBe("nao_iniciado");
    expect(classifyAbaDoPainel(sessao({ lastAttendantMessageAt: AGORA }))).toBe("em_atendimento");
  });

  it("fila e robô ficam em 'Espera', e a pausada em 'Pausa'", () => {
    expect(classifyAbaDoPainel(sessao({ status: "queued" }))).toBe("espera");
    expect(classifyAbaDoPainel(sessao({ status: "bot" }))).toBe("espera");
    expect(classifyAbaDoPainel(sessao({ status: "paused", pausedAt: AGORA }))).toBe("pausa");
  });

  it("encerrada por silêncio é 'Inativo'; o resto do dia é 'Fechou Chat'", () => {
    const encerrada = { status: "closed", closedAt: AGORA };
    expect(classifyAbaDoPainel(sessao({ ...encerrada, endKind: "inatividade" }))).toBe("inativo");
    expect(classifyAbaDoPainel(sessao({ ...encerrada, endKind: "pausa_vencida" }))).toBe("inativo");
    expect(classifyAbaDoPainel(sessao({ ...encerrada, endKind: "abandono" }))).toBe("inativo");
    expect(classifyAbaDoPainel(sessao({ ...encerrada, endKind: "cliente_saiu" }))).toBe("fechou_chat");
    expect(classifyAbaDoPainel(sessao({ ...encerrada, endKind: "atendente" }))).toBe("fechou_chat");
  });
});

describe("tempo da linha", () => {
  it("em espera conta desde a abertura", () => {
    expect(readTempoDaLinha("espera", sessao({ status: "queued" }), AGORA)).toBe(3600);
  });

  it("em atendimento conta desde a última mensagem de qualquer lado", () => {
    const parada = sessao({ lastAttendantMessageAt: new Date("2026-09-22T14:50:00.000Z") });
    expect(readTempoDaLinha("em_atendimento", parada, AGORA)).toBe(600);
  });

  it("pausada conta desde a pausa", () => {
    const pausada = sessao({ status: "paused", pausedAt: new Date("2026-09-22T14:30:00.000Z") });
    expect(readTempoDaLinha("pausa", pausada, AGORA)).toBe(1800);
  });

  it("encerrada mostra quanto durou, não quanto tempo faz", () => {
    const encerrada = sessao({ status: "closed", closedAt: new Date("2026-09-22T14:20:00.000Z") });
    expect(readTempoDaLinha("fechou_chat", encerrada, AGORA)).toBe(1200);
  });
});

const atendente = (name: string, conectado: boolean, em_atendimento: number) => ({
  id: name,
  name,
  conectado,
  invisivel: false,
  em_atendimento,
  aguardando: 0,
});

describe("contato e atendentes", () => {
  it("mostra telefone, senão e-mail, senão o nome", () => {
    expect(readContato({ clientPhone: "5567999", clientEmail: "a@b.c", clientName: "Ana" })).toBe("5567999");
    expect(readContato({ clientPhone: null, clientEmail: "a@b.c", clientName: "Ana" })).toBe("a@b.c");
    expect(readContato({ clientPhone: null, clientEmail: null, clientName: "Ana" })).toBe("Ana");
    expect(readContato({ clientPhone: null, clientEmail: null, clientName: null })).toBe("—");
  });

  it("conectado e visível é online; escondido pelo administrador é invisível", () => {
    expect(readSituacaoDoAtendente({ conectado: true, invisivel: false })).toBe("online");
    expect(readSituacaoDoAtendente({ conectado: true, invisivel: true })).toBe("invisivel");
    expect(readSituacaoDoAtendente({ conectado: false, invisivel: true })).toBe("offline");
  });

  it("ordena online primeiro, depois quem tem mais conversa", () => {
    const ordem = sortAtendentes([
      atendente("Carlos", false, 5),
      atendente("Ana", true, 1),
      atendente("Bruno", true, 3),
    ]).map((a) => a.name);
    expect(ordem).toEqual(["Bruno", "Ana", "Carlos"]);
  });
});
