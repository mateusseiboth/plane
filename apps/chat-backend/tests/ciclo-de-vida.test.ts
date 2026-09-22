/**
 * Regras puras do ciclo de vida do atendimento: tipo de abandono (os 5 do SAC),
 * resposta do cliente à pergunta de inatividade, horário de corte do fim do dia
 * e prazo da pausa. Sem banco e sem servidor.
 */
import { describe, expect, it } from "bun:test";
import {
  CAUSA_DO_FIM,
  TIPO_ABANDONO,
  classifyAbandono,
  isAbandonado,
  rotuloDoAbandono,
} from "@/ciclo-de-vida/abandono";
import {
  RESPOSTA_DE_INATIVIDADE,
  parseRespostaDeInatividade,
  isAguardandoCliente,
} from "@/ciclo-de-vida/inatividade-regras";
import { buildCorteDoDia } from "@/ciclo-de-vida/fim-do-dia-regras";
import { PRAZO_DA_PAUSA_MS, isPausaVencida } from "@/ciclo-de-vida/pausa-regras";
import { parseCatalogoDeMotivos, validateEncerramento } from "@/ciclo-de-vida/encerramento-regras";

describe("classifyAbandono", () => {
  it("cliente que sai com a conversa em andamento: durante a conversa (1)", () => {
    expect(classifyAbandono(CAUSA_DO_FIM.CLIENTE_SAIU, { status: "active", hasAttendantMessage: true })).toBe(
      TIPO_ABANDONO.DURANTE_A_CONVERSA
    );
  });

  it("atendente escolhido que nunca escreveu: antes de iniciar (2)", () => {
    expect(classifyAbandono(CAUSA_DO_FIM.CLIENTE_SAIU, { status: "active", hasAttendantMessage: false })).toBe(
      TIPO_ABANDONO.ANTES_DE_INICIAR
    );
    expect(classifyAbandono(CAUSA_DO_FIM.INATIVIDADE, { status: "active", hasAttendantMessage: false })).toBe(
      TIPO_ABANDONO.ANTES_DE_INICIAR
    );
  });

  it("ainda no robô ou na fila: fila de espera (3)", () => {
    expect(classifyAbandono(CAUSA_DO_FIM.INATIVIDADE, { status: "queued", hasAttendantMessage: false })).toBe(
      TIPO_ABANDONO.NA_FILA
    );
    expect(classifyAbandono(CAUSA_DO_FIM.CLIENTE_SAIU, { status: "bot", hasAttendantMessage: false })).toBe(
      TIPO_ABANDONO.NA_FILA
    );
  });

  it("pausa que venceu sem o cliente voltar: não retornou da pausa (4)", () => {
    expect(classifyAbandono(CAUSA_DO_FIM.PAUSA_VENCIDA, { status: "paused", hasAttendantMessage: true })).toBe(
      TIPO_ABANDONO.NAO_VOLTOU_DA_PAUSA
    );
  });

  it("silêncio depois da mensagem do atendente: inatividade (5)", () => {
    expect(classifyAbandono(CAUSA_DO_FIM.INATIVIDADE, { status: "active", hasAttendantMessage: true })).toBe(
      TIPO_ABANDONO.INATIVIDADE
    );
  });

  it("encerramento pelo atendente, pelo cliente (99) e no fim do dia não é abandono", () => {
    for (const causa of [
      CAUSA_DO_FIM.ATENDENTE,
      CAUSA_DO_FIM.CLIENTE_ENCERROU,
      CAUSA_DO_FIM.FIM_DO_DIA,
      CAUSA_DO_FIM.ROBO,
    ])
      expect(classifyAbandono(causa, { status: "active", hasAttendantMessage: true })).toBeNull();
  });

  it("todo tipo tem rótulo", () => {
    for (const tipo of Object.values(TIPO_ABANDONO)) expect(rotuloDoAbandono(tipo)).toBeTruthy();
    expect(rotuloDoAbandono(null)).toBe("Não informado");
  });

  it("abandono do histórico do SAC (sem tipo gravado) também conta", () => {
    expect(isAbandonado({ abandonType: 3, endKind: "inatividade" })).toBe(true);
    expect(isAbandonado({ abandonType: null, endKind: "abandono" })).toBe(true);
    expect(isAbandonado({ abandonType: null, endKind: "atendente" })).toBe(false);
  });
});

describe("parseRespostaDeInatividade", () => {
  it("99 encerra, 1 continua, o resto é inválido", () => {
    expect(parseRespostaDeInatividade(" 99 ")).toBe(RESPOSTA_DE_INATIVIDADE.ENCERRAR);
    expect(parseRespostaDeInatividade("*1*")).toBe(RESPOSTA_DE_INATIVIDADE.CONTINUAR);
    expect(parseRespostaDeInatividade("oi, voltei")).toBe(RESPOSTA_DE_INATIVIDADE.INVALIDA);
  });
});

describe("isAguardandoCliente", () => {
  const agora = new Date("2026-09-22T15:00:00Z").getTime();
  const min = 60_000;

  it("a última palavra foi do atendente há mais de 10 minutos", () => {
    expect(
      isAguardandoCliente(
        { lastAttendantMessageAt: new Date(agora - 11 * min), lastClientMessageAt: new Date(agora - 20 * min) },
        agora
      )
    ).toBe(true);
  });

  it("o cliente respondeu depois do atendente: não pergunta", () => {
    expect(
      isAguardandoCliente(
        { lastAttendantMessageAt: new Date(agora - 20 * min), lastClientMessageAt: new Date(agora - 11 * min) },
        agora
      )
    ).toBe(false);
  });

  it("menos de 10 minutos ou atendente que nunca escreveu: não pergunta", () => {
    expect(
      isAguardandoCliente({ lastAttendantMessageAt: new Date(agora - 5 * min), lastClientMessageAt: null }, agora)
    ).toBe(false);
    expect(isAguardandoCliente({ lastAttendantMessageAt: null, lastClientMessageAt: null }, agora)).toBe(false);
  });
});

describe("buildCorteDoDia", () => {
  const horario = [
    { weekday: 2, start_time: "07:30", end_time: "11:30" },
    { weekday: 2, start_time: "13:00", end_time: "17:30" },
  ];

  it("usa o horário informado, no fuso da empresa", () => {
    // 22/09/2026 é terça (2). 18:00 em Campo Grande (UTC-4) = 22:00 UTC.
    const corte = buildCorteDoDia({
      agora: new Date("2026-09-22T23:00:00Z"),
      fuso: "America/Campo_Grande",
      horario: "18:00",
      expediente: horario,
    });
    expect(corte?.toISOString()).toBe("2026-09-22T22:00:00.000Z");
  });

  it("sem horário informado, usa o fim do expediente do dia", () => {
    const corte = buildCorteDoDia({
      agora: new Date("2026-09-22T23:00:00Z"),
      fuso: "America/Campo_Grande",
      horario: null,
      expediente: horario,
    });
    expect(corte?.toISOString()).toBe("2026-09-22T21:30:00.000Z");
  });

  it("antes do corte, ou dia sem expediente e sem horário: nada a encerrar", () => {
    expect(
      buildCorteDoDia({
        agora: new Date("2026-09-22T15:00:00Z"),
        fuso: "America/Campo_Grande",
        horario: "18:00",
        expediente: horario,
      })
    ).toBeNull();
    expect(
      buildCorteDoDia({
        agora: new Date("2026-09-20T23:00:00Z"),
        fuso: "America/Campo_Grande",
        horario: null,
        expediente: horario,
      })
    ).toBeNull();
  });
});

describe("isPausaVencida", () => {
  it("vence 3 dias depois da última palavra do cliente (ou da pausa)", () => {
    const pausa = new Date("2026-09-01T12:00:00Z");
    expect(PRAZO_DA_PAUSA_MS).toBe(3 * 24 * 60 * 60 * 1000);
    expect(
      isPausaVencida({ pausedAt: pausa, lastClientMessageAt: null }, pausa.getTime() + PRAZO_DA_PAUSA_MS + 1)
    ).toBe(true);
    expect(
      isPausaVencida({ pausedAt: pausa, lastClientMessageAt: null }, pausa.getTime() + PRAZO_DA_PAUSA_MS - 1)
    ).toBe(false);
    expect(isPausaVencida({ pausedAt: null, lastClientMessageAt: null }, Date.now())).toBe(false);
  });
});

describe("validateEncerramento", () => {
  const catalogo = parseCatalogoDeMotivos([
    { key: "duvida", label: "Dúvida" },
    { key: "senha", label: "Senha" },
  ]);

  it("sem entidade não encerra", () => {
    expect(validateEncerramento({ entityId: null, motivo: "Dúvida", catalogo })).toBe(
      "Informe a entidade para encerrar."
    );
  });

  it("motivo fora do catálogo é recusado; sem motivo passa", () => {
    expect(validateEncerramento({ entityId: "e1", motivo: "Outro", catalogo })).toBe("Escolha um motivo da lista.");
    expect(validateEncerramento({ entityId: "e1", motivo: null, catalogo })).toBeNull();
    expect(validateEncerramento({ entityId: "e1", motivo: "Senha", catalogo })).toBeNull();
  });
});

describe("parseCatalogoDeMotivos", () => {
  it("descarta item sem rótulo, apara espaços e gera a chave", () => {
    expect(
      parseCatalogoDeMotivos([{ label: "  Acesso " }, { key: "x" }, "lixo", { key: "dup", label: "Dúvida" }])
    ).toEqual([
      { key: "acesso", label: "Acesso" },
      { key: "dup", label: "Dúvida" },
    ]);
  });

  it("valor que não é lista vira catálogo vazio", () => {
    expect(parseCatalogoDeMotivos(null)).toEqual([]);
  });
});
