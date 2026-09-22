/**
 * Relatórios de atendimento (legado `relatorio/chatSemanal*`,
 * `relatorioMotivoEncerramento`, `relatorioChatAbandSiste`,
 * `relatorioChatAtendimento`): a agregação é pura e roda sem banco; o filtro dos
 * registros vira o `where` do Prisma.
 */
import { describe, expect, it } from "bun:test";
import { aggregateAtendimentos, buildFiltroDosRegistros, readPeriodo } from "@/relatorios/atendimentos";

const h = (iso: string) => new Date(iso);
const linha = (over: Record<string, unknown>) => ({
  assignedAttendantId: "ana",
  createdAt: h("2026-09-21T13:00:00Z"),
  closedAt: h("2026-09-21T13:30:00Z"),
  abandonType: null,
  endKind: "atendente",
  projectName: "SIART",
  closeReason: "Dúvida",
  ...over,
});

const nomes = new Map([
  ["ana", "Ana"],
  ["bia", "Bia"],
]);

describe("aggregateAtendimentos", () => {
  const sessoes = [
    linha({}),
    linha({ closeReason: "Acesso", createdAt: h("2026-09-22T13:00:00Z"), closedAt: h("2026-09-22T13:10:00Z") }),
    linha({
      assignedAttendantId: "bia",
      abandonType: 5,
      endKind: "inatividade",
      closeReason: null,
      projectName: "ALMOXA",
    }),
    linha({ assignedAttendantId: null, abandonType: 3, endKind: "inatividade", closeReason: null, projectName: null }),
    linha({ assignedAttendantId: "bia", abandonType: null, endKind: "abandono", closeReason: null }),
  ];
  const r = aggregateAtendimentos(sessoes as any, { fuso: "America/Campo_Grande", nomes });

  it("finalizados x abandonados (abandono do SAC sem tipo conta como abandono)", () => {
    expect(r.finalizacao).toEqual({ total: 5, finalizados: 2, abandonados: 3 });
  });

  it("por atendente, com duração média em minutos dos finalizados", () => {
    expect(r.por_atendente).toEqual([
      { user_id: "ana", name: "Ana", total: 2, finalizados: 2, abandonados: 0, duracao_media_min: 20 },
      { user_id: "bia", name: "Bia", total: 2, finalizados: 0, abandonados: 2, duracao_media_min: null },
      { user_id: null, name: "Sem atendente", total: 1, finalizados: 0, abandonados: 1, duracao_media_min: null },
    ]);
  });

  it("por tipo de abandono, com rótulo", () => {
    expect(r.por_tipo_abandono).toEqual([
      { tipo: 3, rotulo: "Na fila de espera", total: 1 },
      { tipo: 5, rotulo: "Inatividade", total: 1 },
      { tipo: null, rotulo: "Não informado", total: 1 },
    ]);
  });

  it("por sistema e por motivo", () => {
    expect(r.por_sistema).toEqual([
      { sistema: "SIART", total: 3, finalizados: 2, abandonados: 1 },
      { sistema: "ALMOXA", total: 1, finalizados: 0, abandonados: 1 },
      { sistema: "Sem sistema", total: 1, finalizados: 0, abandonados: 1 },
    ]);
    expect(r.por_motivo).toEqual([
      { motivo: "Acesso", total: 1 },
      { motivo: "Dúvida", total: 1 },
    ]);
  });

  it("por dia da semana no fuso da empresa (sete linhas, domingo primeiro)", () => {
    expect(r.por_dia_da_semana).toHaveLength(7);
    // 21/09/2026 é segunda; 22/09 terça.
    expect(r.por_dia_da_semana[1]).toEqual({ dia: 1, rotulo: "Segunda-feira", total: 4 });
    expect(r.por_dia_da_semana[2]).toEqual({ dia: 2, rotulo: "Terça-feira", total: 1 });
    expect(r.por_dia_da_semana[0]).toEqual({ dia: 0, rotulo: "Domingo", total: 0 });
  });
});

describe("readPeriodo", () => {
  it("padrão: últimos 7 dias até agora", () => {
    const agora = h("2026-09-22T12:00:00Z");
    const p = readPeriodo({}, agora);
    expect(p.ate.toISOString()).toBe(agora.toISOString());
    expect(p.de.toISOString()).toBe("2026-09-15T12:00:00.000Z");
  });

  it("aceita datas AAAA-MM-DD e fecha o dia final inteiro", () => {
    const p = readPeriodo({ from: "2026-09-01", to: "2026-09-10" }, new Date());
    expect(p.de.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(p.ate.toISOString()).toBe("2026-09-11T00:00:00.000Z");
  });

  it("data inválida cai no padrão", () => {
    const agora = h("2026-09-22T12:00:00Z");
    expect(readPeriodo({ from: "ontem" }, agora).de.toISOString()).toBe("2026-09-15T12:00:00.000Z");
  });
});

describe("buildFiltroDosRegistros", () => {
  const periodo = { de: h("2026-09-01T00:00:00Z"), ate: h("2026-09-11T00:00:00Z") };

  it("só encerrados do espaço, no período", () => {
    expect(buildFiltroDosRegistros("quality", {}, periodo)).toEqual({
      workspaceId: "quality",
      status: "closed",
      closedAt: { gte: periodo.de, lt: periodo.ate },
    });
  });

  it("filtra por entidade, sistema, motivo e atendente; ignora id que não é uuid", () => {
    const uuid = "019ffadb-aa94-7138-888a-d4ceabd3c2c1";
    expect(
      buildFiltroDosRegistros(
        "quality",
        { entity_id: uuid, project_id: "nao-e-uuid", motivo: "Dúvida", attendant_id: "ana" },
        periodo
      )
    ).toEqual({
      workspaceId: "quality",
      status: "closed",
      closedAt: { gte: periodo.de, lt: periodo.ate },
      entityId: uuid,
      closeReason: "Dúvida",
      assignedAttendantId: "ana",
    });
  });
});
