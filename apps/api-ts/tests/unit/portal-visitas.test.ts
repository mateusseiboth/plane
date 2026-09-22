/**
 * Visitas técnicas vistas pelo cliente no portal: o filtro por situação e o que
 * do relatório interno chega até ele. Puro, sem banco.
 */
import { describe, expect, it } from "bun:test";
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";
import {
  SITUACOES_DE_VISITA,
  buildVisitaDoCliente,
  buildWhereDasVisitasDoCliente,
  readSituacaoDeVisita,
} from "@modules/portal/visitas";

const AGORA = new Date("2026-09-22T15:00:00Z");
const ENTIDADE = "0192f4b8-0000-7000-8000-000000000001";

describe("readSituacaoDeVisita", () => {
  it("aceita as três situações do suporte antigo e cai em abertas no resto", () => {
    expect(SITUACOES_DE_VISITA).toEqual(["abertas", "efetivadas", "vencidas"]);
    expect(readSituacaoDeVisita("efetivadas")).toBe("efetivadas");
    expect(readSituacaoDeVisita("vencidas")).toBe("vencidas");
    expect(readSituacaoDeVisita("qualquer")).toBe("abertas");
    expect(readSituacaoDeVisita(undefined)).toBe("abertas");
  });
});

describe("buildWhereDasVisitasDoCliente", () => {
  it("sempre recorta pela entidade da conta e nunca mostra cancelada", () => {
    for (const situacao of SITUACOES_DE_VISITA) {
      const where = buildWhereDasVisitasDoCliente("ws", ENTIDADE, situacao, AGORA) as any;
      expect(where.workspaceId).toBe("ws");
      expect(where.entityId).toBe(ENTIDADE);
      expect(where.deletedAt).toBeNull();
      const aceitaCancelada =
        where.status === VISIT_STATUS.CANCELADA || !(where.status?.notIn ?? [VISIT_STATUS.CANCELADA]).includes(5);
      expect(aceitaCancelada).toBe(false);
    }
  });

  it("efetivadas são as concluídas", () => {
    const where = buildWhereDasVisitasDoCliente("ws", ENTIDADE, "efetivadas", AGORA) as any;
    expect(where.status).toBe(VISIT_STATUS.CONCLUIDA);
  });

  it("vencidas: não encerradas e marcadas para antes de hoje", () => {
    const where = buildWhereDasVisitasDoCliente("ws", ENTIDADE, "vencidas", AGORA) as any;
    expect(where.status).toEqual({ notIn: [VISIT_STATUS.CONCLUIDA, VISIT_STATUS.CANCELADA] });
    expect(where.scheduledDate.lt).toBeInstanceOf(Date);
  });

  it("abertas: não encerradas, sem data ou de hoje em diante", () => {
    const where = buildWhereDasVisitasDoCliente("ws", ENTIDADE, "abertas", AGORA) as any;
    expect(where.status).toEqual({ notIn: [VISIT_STATUS.CONCLUIDA, VISIT_STATUS.CANCELADA] });
    expect(where.OR).toHaveLength(2);
  });
});

const visitaSerializada = (status: number) => ({
  id: "v1",
  visit_number: "7-2026",
  status,
  status_label: "Concluída",
  is_overdue: false,
  scheduled_date: "2026-09-10T12:00:00.000Z",
  started_at: "2026-09-10T12:00:00.000Z",
  finished_at: "2026-09-10T18:00:00.000Z",
  city: "Campo Grande",
  period: "Manhã",
  entity: { id: ENTIDADE, name: "Prefeitura" },
  technician: { id: "u1", display_name: "ana", first_name: "Ana", last_name: "Souza" },
  technician2: null,
  mot_update: true,
  mot_bug_fix: false,
  mot_training: true,
  mot_improvement: false,
  mot_commercial: false,
  mot_other: true,
  mot_other_description: "Reunião",
  summary: "<p>Resumo</p>",
  conclusion: "<p>Conclusão</p>",
  projects: [{ id: "p1", name: "SIART", identifier: "SIART" }],
  modules: [{ id: "m1", name: "IPTU", project_id: "p1" }],
  issues: [{ id: "i1", code: "SIART-3", name: "Erro", state: { name: "Concluído", group: "completed" } }],
  attachments: [{ id: "a1", name: "interno.pdf" }],
  contacts: "anotação interna",
  created_by: "u9",
  technician_id: "u1",
});

describe("buildVisitaDoCliente", () => {
  it("leva o relatório quando a visita já foi fechada", () => {
    const dto = buildVisitaDoCliente(visitaSerializada(VISIT_STATUS.CONCLUIDA));
    expect(dto).toMatchObject({
      id: "v1",
      numero: "7-2026",
      situacao: "Concluída",
      cidade: "Campo Grande",
      tecnicos: ["Ana Souza"],
      motivos: ["Atualização", "Acompanhamento ou treinamento", "Outros: Reunião"],
      sistemas: ["SIART"],
      funcionalidades: ["IPTU"],
      resumo_html: "<p>Resumo</p>",
      conclusao_html: "<p>Conclusão</p>",
      chamados: [{ codigo: "SIART-3", titulo: "Erro", situacao: "Concluído" }],
    });
  });

  it("relatório em elaboração não sai para o cliente", () => {
    const dto = buildVisitaDoCliente(visitaSerializada(VISIT_STATUS.RELATORIO));
    expect(dto.resumo_html).toBeNull();
    expect(dto.conclusao_html).toBeNull();
  });

  it("nada interno vaza: anexos, anotação de contato, ids de usuário", () => {
    const texto = JSON.stringify(buildVisitaDoCliente(visitaSerializada(VISIT_STATUS.CONCLUIDA)));
    expect(texto).not.toContain("interno.pdf");
    expect(texto).not.toContain("anotação interna");
    expect(texto).not.toContain("u9");
    expect(texto).not.toContain("technician_id");
  });
});
