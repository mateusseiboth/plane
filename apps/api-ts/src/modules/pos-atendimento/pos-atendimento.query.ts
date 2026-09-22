/**
 * Pedaços de consulta do pós-atendimento, compostos por filtro. Puro (não importa
 * o `@db`): o DAO executa, o teste unitário confere o formato.
 *
 * A fila tem duas origens (chamado e visita) com o mesmo conjunto de filtros; cada
 * filtro vira um pedaço por origem e o `AND` final junta o que veio.
 */
import type { Prisma } from "@prisma/client";
import { POS_ORIGEM, POS_SITUACAO, type PosSituacao } from "@modules/pos-atendimento/pos-atendimento.codes";
import type { FilaFiltros, RelatorioFiltros } from "@modules/pos-atendimento/pos-atendimento.rules";
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";

/** Quem pergunta: o espaço e os sistemas de que participa (recorte dos chamados). */
export type PosEscopo = { workspaceId: string; projectIds: string[] };

type Periodo = { gte?: Date; lte?: Date };

const buildPeriodo = (filtros: { desde?: Date; ate?: Date }): Periodo | undefined => {
  if (!filtros.desde && !filtros.ate) return undefined;
  return { ...(filtros.desde ? { gte: filtros.desde } : {}), ...(filtros.ate ? { lte: filtros.ate } : {}) };
};

const compact = <T>(partes: (T | undefined)[]): T[] => partes.filter((p): p is T => p !== undefined);

// ── Chamado ──────────────────────────────────────────────────────────────────

// Pendente = concluído e sem pós. Nas outras abas o pós já existe e vale mesmo
// que o chamado tenha sido reaberto depois.
const ISSUE_POR_SITUACAO: Record<PosSituacao, Prisma.IssueWhereInput[]> = {
  [POS_SITUACAO.PENDENTE_POS]: [{ state: { group: "completed" } }, { posAtendimento: { is: null } }],
  [POS_SITUACAO.PENDENTE_VERIFICACAO]: [{ posAtendimento: { is: { verifiedAt: null } } }],
  [POS_SITUACAO.VERIFICADO]: [{ posAtendimento: { is: { verifiedAt: { not: null } } } }],
};

/** Sistema pedido fora do alcance da pessoa vira lista vazia, nunca vazamento. */
const buildIssueProjetos = (escopo: PosEscopo, projectId?: string): Prisma.IssueWhereInput => ({
  projectId: { in: projectId ? escopo.projectIds.filter((id) => id === projectId) : escopo.projectIds },
});

const buildIssuePeriodo = (periodo?: Periodo): Prisma.IssueWhereInput | undefined =>
  periodo && { OR: [{ completedAt: periodo }, { completedAt: null, updatedAt: periodo }] };

export function buildIssueWhere(escopo: PosEscopo, filtros: FilaFiltros): Prisma.IssueWhereInput {
  return {
    workspaceId: escopo.workspaceId,
    deletedAt: null,
    isDraft: false,
    AND: compact<Prisma.IssueWhereInput>([
      ...ISSUE_POR_SITUACAO[filtros.situacao],
      buildIssueProjetos(escopo, filtros.projectId),
      filtros.entityId ? { entityId: filtros.entityId } : undefined,
      filtros.responsavelId
        ? { assignees: { some: { assigneeId: filtros.responsavelId, deletedAt: null } } }
        : undefined,
      buildIssuePeriodo(buildPeriodo(filtros)),
    ]),
  };
}

// ── Visita ───────────────────────────────────────────────────────────────────

const VISIT_POR_SITUACAO: Record<PosSituacao, Prisma.TechnicalVisitWhereInput[]> = {
  [POS_SITUACAO.PENDENTE_POS]: [{ status: VISIT_STATUS.CONCLUIDA }, { posAtendimento: { is: null } }],
  [POS_SITUACAO.PENDENTE_VERIFICACAO]: [{ posAtendimento: { is: { verifiedAt: null } } }],
  [POS_SITUACAO.VERIFICADO]: [{ posAtendimento: { is: { verifiedAt: { not: null } } } }],
};

const buildVisitPeriodo = (periodo?: Periodo): Prisma.TechnicalVisitWhereInput | undefined =>
  periodo && { OR: [{ finishedAt: periodo }, { finishedAt: null, updatedAt: periodo }] };

/** Visita é do espaço inteiro (quem participa vê todas), por isso não recorta por sistema da pessoa. */
export function buildVisitWhere(escopo: PosEscopo, filtros: FilaFiltros): Prisma.TechnicalVisitWhereInput {
  return {
    workspaceId: escopo.workspaceId,
    deletedAt: null,
    AND: compact<Prisma.TechnicalVisitWhereInput>([
      ...VISIT_POR_SITUACAO[filtros.situacao],
      filtros.projectId ? { projectIds: { array_contains: [filtros.projectId] } } : undefined,
      filtros.entityId ? { entityId: filtros.entityId } : undefined,
      filtros.responsavelId
        ? { OR: [{ technicianId: filtros.responsavelId }, { technician2Id: filtros.responsavelId }] }
        : undefined,
      buildVisitPeriodo(buildPeriodo(filtros)),
    ]),
  };
}

// ── Relatório ────────────────────────────────────────────────────────────────

const POS_POR_ORIGEM: Record<RelatorioFiltros["origem"], Prisma.PosAtendimentoWhereInput | undefined> = {
  all: undefined,
  [POS_ORIGEM.CHAMADO]: { issueId: { not: null } },
  [POS_ORIGEM.VISITA]: { visitId: { not: null } },
};

/**
 * Pós-atendimentos do relatório: período é o dia em que o contato foi feito. Chamado
 * apagado ou fora dos sistemas da pessoa não entra; visita apagada também não.
 */
export function buildRelatorioWhere(escopo: PosEscopo, filtros: RelatorioFiltros): Prisma.PosAtendimentoWhereInput {
  const periodo = buildPeriodo(filtros);
  return {
    workspaceId: escopo.workspaceId,
    AND: compact<Prisma.PosAtendimentoWhereInput>([
      {
        OR: [
          { issue: { is: { deletedAt: null, projectId: { in: escopo.projectIds } } } },
          { visit: { is: { deletedAt: null } } },
        ],
      },
      POS_POR_ORIGEM[filtros.origem],
      periodo ? { recordedAt: periodo } : undefined,
      filtros.classificacao !== undefined ? { classificacao: filtros.classificacao } : undefined,
      filtros.projectId
        ? {
            OR: [
              { issue: { is: { projectId: filtros.projectId } } },
              { visit: { is: { projectIds: { array_contains: [filtros.projectId] } } } },
            ],
          }
        : undefined,
      filtros.entityId
        ? { OR: [{ issue: { is: { entityId: filtros.entityId } } }, { visit: { is: { entityId: filtros.entityId } } }] }
        : undefined,
    ]),
  };
}
