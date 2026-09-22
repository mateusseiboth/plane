/**
 * Regras puras da visita técnica: número N-AAAA, trava de encerramento, quem pode
 * mexer em quê (matriz + técnico dono), vencida e filtros da lista. Sem banco.
 */
import { describe, expect, it } from "bun:test";
import { inicioDeHoje } from "@utils/prazo";
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";
import { findMaiorSequencial, formatVisitNumber, getAnoDaVisita } from "@modules/technical-visit/visit-number";
import {
  findClosingErrors,
  isChamadoAberto,
  isTextoVazio,
  requiresClosingCheck,
} from "@modules/technical-visit/visit-closing";
import { findReportDenial, findVisitDenial } from "@modules/technical-visit/visit-access";
import { buildVisitListWhere, isVisitOverdue } from "@modules/technical-visit/visit-filters";

describe("número da visita", () => {
  it("formata como N-AAAA", () => {
    expect(formatVisitNumber(3, 2026)).toBe("3-2026");
  });

  it("conta o ano no fuso do escritório, não em UTC", () => {
    // 02:00 UTC de 1º de janeiro ainda é 31 de dezembro em Campo Grande.
    expect(getAnoDaVisita(new Date("2027-01-01T02:00:00Z"))).toBe(2026);
    expect(getAnoDaVisita(new Date("2027-01-01T05:00:00Z"))).toBe(2027);
  });

  it("acha o maior sequencial do ano, ignorando outros anos e lixo do SAC", () => {
    expect(findMaiorSequencial(["12-2026", "3-2026", "40-2025", "abc", null, " 7-2026 "], 2026)).toBe(12);
  });

  it("sem número no ano o maior é zero", () => {
    expect(findMaiorSequencial(["9-2025"], 2026)).toBe(0);
  });
});

const RELATORIO_COMPLETO = {
  startedAt: new Date("2026-05-04T12:00:00Z"),
  finishedAt: new Date("2026-05-04T18:00:00Z"),
  summary: "<p>Sistema parado</p>",
  conclusion: "<p>Sistema funcionando</p>",
  motUpdate: false,
  motBugFix: true,
  motTraining: false,
  motImprovement: false,
  motCommercial: false,
  motOther: false,
};

describe("trava ao encerrar", () => {
  it("relatório completo e sem chamado aberto passa", () => {
    expect(findClosingErrors(RELATORIO_COMPLETO, [{ codigo: "ESIC-1", isOpen: false }])).toEqual([]);
  });

  it("aponta cada campo que falta, no caminho que a tela usa", () => {
    const erros = findClosingErrors(
      {
        ...RELATORIO_COMPLETO,
        startedAt: null,
        finishedAt: null,
        summary: "<p></p>",
        conclusion: null,
        motBugFix: false,
      },
      []
    );
    expect(erros.map((e) => e.path)).toEqual(["started_at", "finished_at", "summary", "conclusion", "motivos"]);
    expect(erros.every((e) => !e.message.includes("—"))).toBe(true);
  });

  it("fim antes do início é recusado", () => {
    const erros = findClosingErrors({ ...RELATORIO_COMPLETO, finishedAt: new Date("2026-05-04T10:00:00Z") }, []);
    expect(erros.map((e) => e.path)).toEqual(["finished_at"]);
  });

  it("chamado vinculado aberto trava e é citado pelo código", () => {
    const erros = findClosingErrors(RELATORIO_COMPLETO, [
      { codigo: "ESIC-1", isOpen: true },
      { codigo: "ESIC-2", isOpen: false },
      { codigo: "ALMOXA-9", isOpen: true },
    ]);
    expect(erros).toHaveLength(1);
    expect(erros[0].path).toBe("issues");
    expect(erros[0].message).toContain("ESIC-1");
    expect(erros[0].message).toContain("ALMOXA-9");
    expect(erros[0].message).not.toContain("ESIC-2");
  });

  it("texto do editor sem conteúdo conta como vazio", () => {
    expect(isTextoVazio("<p></p>")).toBe(true);
    expect(isTextoVazio("<p>&nbsp; </p><p><br></p>")).toBe(true);
    expect(isTextoVazio(null)).toBe(true);
    expect(isTextoVazio("<p>ok</p>")).toBe(false);
  });

  it("chamado concluído ou cancelado não está aberto; sem etapa está", () => {
    expect(isChamadoAberto("completed")).toBe(false);
    expect(isChamadoAberto("cancelled")).toBe(false);
    expect(isChamadoAberto("started")).toBe(true);
    expect(isChamadoAberto("triage")).toBe(true);
    expect(isChamadoAberto(null)).toBe(true);
  });

  it("confere ao concluir e ao mandar para assinatura", () => {
    expect(requiresClosingCheck(VISIT_STATUS.CONCLUIDA)).toBe(true);
    expect(requiresClosingCheck(VISIT_STATUS.AGUARDANDO_ASSINATURA)).toBe(true);
    expect(requiresClosingCheck(VISIT_STATUS.RELATORIO)).toBe(false);
    expect(requiresClosingCheck(VISIT_STATUS.CANCELADA)).toBe(false);
  });
});

const DONO = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";
const VISITA = {
  technicianId: DONO,
  scheduledDate: new Date("2026-05-04T12:00:00Z"),
  status: VISIT_STATUS.EM_ANDAMENTO,
};
const tecnico = { userId: DONO, canManageAll: false };
const colega = { userId: OUTRO, canManageAll: false };
const gestor = { userId: OUTRO, canManageAll: true };

describe("quem mexe em quê", () => {
  it("o técnico dono preenche o relatório", () => {
    expect(findVisitDenial({ summary: "<p>x</p>", mot_training: true }, VISITA, tecnico)).toBeNull();
  });

  it("outro técnico não preenche o relatório de quem não é dele", () => {
    expect(findVisitDenial({ summary: "<p>x</p>" }, VISITA, colega)?.status).toBe(403);
    expect(findReportDenial(VISITA, colega)?.status).toBe(403);
    expect(findReportDenial(VISITA, tecnico)).toBeNull();
  });

  it("o dono não troca técnico, data nem cancela", () => {
    expect(findVisitDenial({ technician_id: OUTRO }, VISITA, tecnico)?.status).toBe(403);
    expect(findVisitDenial({ scheduled_date: "2026-06-01T12:00:00Z" }, VISITA, tecnico)?.status).toBe(403);
    expect(findVisitDenial({ status: VISIT_STATUS.CANCELADA }, VISITA, tecnico)?.status).toBe(403);
  });

  it("reenviar o técnico e a data que já estão gravados não é troca", () => {
    const corpo = { technician_id: DONO, scheduled_date: "2026-05-04T12:00:00.000Z", summary: "<p>x</p>" };
    expect(findVisitDenial(corpo, VISITA, tecnico)).toBeNull();
  });

  it("quem gerencia troca técnico e data, cancela e edita qualquer relatório", () => {
    expect(findVisitDenial({ technician_id: DONO, scheduled_date: null }, VISITA, gestor)).toBeNull();
    expect(findVisitDenial({ status: VISIT_STATUS.CANCELADA }, VISITA, gestor)).toBeNull();
    expect(findVisitDenial({ summary: "<p>x</p>" }, VISITA, gestor)).toBeNull();
  });

  it("visita encerrada só muda por quem gerencia", () => {
    const encerrada = { ...VISITA, status: VISIT_STATUS.CONCLUIDA };
    expect(findVisitDenial({ summary: "<p>x</p>" }, encerrada, tecnico)?.status).toBe(409);
    expect(findReportDenial(encerrada, tecnico)?.status).toBe(409);
    expect(findVisitDenial({ status: VISIT_STATUS.RELATORIO }, encerrada, gestor)).toBeNull();
  });
});

describe("vencida e filtros da lista", () => {
  const agora = new Date("2026-05-10T15:00:00Z");

  it("vencida é a que ficou para um dia anterior e não foi encerrada", () => {
    const ontem = new Date("2026-05-09T15:00:00Z");
    const hojeCedo = new Date("2026-05-10T11:00:00Z");
    expect(isVisitOverdue({ scheduledDate: ontem, status: VISIT_STATUS.AGENDADA }, agora)).toBe(true);
    expect(isVisitOverdue({ scheduledDate: ontem, status: VISIT_STATUS.RELATORIO }, agora)).toBe(true);
    expect(isVisitOverdue({ scheduledDate: hojeCedo, status: VISIT_STATUS.AGENDADA }, agora)).toBe(false);
    expect(isVisitOverdue({ scheduledDate: ontem, status: VISIT_STATUS.CONCLUIDA }, agora)).toBe(false);
    expect(isVisitOverdue({ scheduledDate: ontem, status: VISIT_STATUS.CANCELADA }, agora)).toBe(false);
    expect(isVisitOverdue({ scheduledDate: null, status: VISIT_STATUS.AGENDADA }, agora)).toBe(false);
  });

  it("monta o filtro por técnico, entidade, período e situação", () => {
    const where = buildVisitListWhere(
      "ws",
      { technician_id: DONO, entity_id: OUTRO, date_from: "2026-05-01", date_to: "2026-05-31", status: "0" },
      agora
    );
    expect(where).toMatchObject({ workspaceId: "ws", deletedAt: null, technicianId: DONO, entityId: OUTRO, status: 0 });
    expect(where.scheduledDate.gte.toISOString()).toBe("2026-05-01T04:00:00.000Z");
    expect(where.scheduledDate.lte.toISOString()).toBe("2026-06-01T03:59:59.999Z");
  });

  it("vencidas somam a borda de hoje ao período e cortam as encerradas", () => {
    const where = buildVisitListWhere("ws", { overdue: "true", date_from: "2026-01-01" }, agora);
    expect(where.scheduledDate.lt).toEqual(inicioDeHoje(0, agora));
    expect(where.scheduledDate.gte).toBeInstanceOf(Date);
    expect(where.status).toEqual({ notIn: [VISIT_STATUS.CONCLUIDA, VISIT_STATUS.CANCELADA] });
  });

  it("situação que não é número é ignorada em vez de virar erro", () => {
    expect(buildVisitListWhere("ws", { status: "abc" }, agora).status).toBeUndefined();
  });
});
