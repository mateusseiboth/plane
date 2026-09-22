/**
 * DAO do pós-atendimento: só acesso a dados. Os `where` vêm prontos de
 * `pos-atendimento.query.ts`; regra (concluído, conflito, verificação) vive no service.
 */
import prisma from "@db";
import type { Prisma } from "@prisma/client";

const SELECT_PESSOA = { id: true, displayName: true, firstName: true, lastName: true } as const;
const SELECT_REFERENCIA = { id: true, name: true } as const;

/** O chamado como a fila e o relatório mostram. */
export const SELECT_ISSUE_ITEM = {
  id: true,
  name: true,
  sequenceId: true,
  ticketSequence: true,
  ticketYear: true,
  projectId: true,
  project: { select: { id: true, name: true, identifier: true } },
  entity: { select: SELECT_REFERENCIA },
  completedAt: true,
  updatedAt: true,
  state: { select: { group: true } },
  assignees: { where: { deletedAt: null }, select: { assignee: { select: SELECT_PESSOA } } },
} as const satisfies Prisma.IssueSelect;

/** A visita como a fila e o relatório mostram. */
export const SELECT_VISIT_ITEM = {
  id: true,
  visitNumber: true,
  status: true,
  entity: { select: SELECT_REFERENCIA },
  finishedAt: true,
  updatedAt: true,
  projectIds: true,
  technician: { select: SELECT_PESSOA },
  technician2: { select: SELECT_PESSOA },
} as const satisfies Prisma.TechnicalVisitSelect;

const SELECT_ISSUE_COM_POS = { ...SELECT_ISSUE_ITEM, posAtendimento: true } as const;
const SELECT_VISIT_COM_POS = { ...SELECT_VISIT_ITEM, posAtendimento: true } as const;

export type PosRow = Prisma.PosAtendimentoGetPayload<object>;
export type PosPessoa = Prisma.UserGetPayload<{ select: typeof SELECT_PESSOA }>;
export type IssueItemRow = Prisma.IssueGetPayload<{ select: typeof SELECT_ISSUE_ITEM }>;
export type VisitItemRow = Prisma.TechnicalVisitGetPayload<{ select: typeof SELECT_VISIT_ITEM }>;
export type IssueComPosRow = Prisma.IssueGetPayload<{ select: typeof SELECT_ISSUE_COM_POS }>;
export type VisitComPosRow = Prisma.TechnicalVisitGetPayload<{ select: typeof SELECT_VISIT_COM_POS }>;

const ISSUE_ORDER: Prisma.IssueOrderByWithRelationInput[] = [
  { completedAt: { sort: "desc", nulls: "last" } },
  { updatedAt: "desc" },
  { id: "desc" },
];

const VISIT_ORDER: Prisma.TechnicalVisitOrderByWithRelationInput[] = [
  { finishedAt: { sort: "desc", nulls: "last" } },
  { updatedAt: "desc" },
  { id: "desc" },
];

const SELECT_RELATORIO = {
  classificacao: true,
  expectativa: true,
  issue: { select: { project: { select: SELECT_REFERENCIA }, entity: { select: SELECT_REFERENCIA } } },
  visit: { select: { projectIds: true, entity: { select: SELECT_REFERENCIA } } },
} as const satisfies Prisma.PosAtendimentoSelect;

const INCLUDE_ITEM_DO_RELATORIO = {
  issue: { select: SELECT_ISSUE_ITEM },
  visit: { select: SELECT_VISIT_ITEM },
} as const satisfies Prisma.PosAtendimentoInclude;

export type PosRelatorioRow = Prisma.PosAtendimentoGetPayload<{ select: typeof SELECT_RELATORIO }>;
export type PosComAlvoRow = Prisma.PosAtendimentoGetPayload<{ include: typeof INCLUDE_ITEM_DO_RELATORIO }>;

export const posAtendimentoDao = {
  /** Chamado do espaço, num dos sistemas da pessoa. */
  findIssueAlvo: (workspaceId: string, issueId: string, projectIds: string[]): Promise<IssueComPosRow | null> =>
    prisma.issue.findFirst({
      where: { id: issueId, workspaceId, deletedAt: null, projectId: { in: projectIds } },
      select: SELECT_ISSUE_COM_POS,
    }),

  findVisitAlvo: (workspaceId: string, visitId: string): Promise<VisitComPosRow | null> =>
    prisma.technicalVisit.findFirst({
      where: { id: visitId, workspaceId, deletedAt: null },
      select: SELECT_VISIT_COM_POS,
    }),

  createPos: (data: Prisma.PosAtendimentoUncheckedCreateInput) => prisma.posAtendimento.create({ data }),

  findPos: (workspaceId: string, id: string) =>
    prisma.posAtendimento.findFirst({
      where: { id, workspaceId },
      include: { issue: { select: { projectId: true } } },
    }),

  updatePos: (id: string, data: Prisma.PosAtendimentoUncheckedUpdateInput) =>
    prisma.posAtendimento.update({ where: { id }, data }),

  findIssues: (where: Prisma.IssueWhereInput, take: number): Promise<IssueComPosRow[]> =>
    prisma.issue.findMany({ where, take, orderBy: ISSUE_ORDER, select: SELECT_ISSUE_COM_POS }),

  countIssues: (where: Prisma.IssueWhereInput) => prisma.issue.count({ where }),

  findVisits: (where: Prisma.TechnicalVisitWhereInput, take: number): Promise<VisitComPosRow[]> =>
    prisma.technicalVisit.findMany({ where, take, orderBy: VISIT_ORDER, select: SELECT_VISIT_COM_POS }),

  countVisits: (where: Prisma.TechnicalVisitWhereInput) => prisma.technicalVisit.count({ where }),

  findProjects: (ids: string[]) =>
    prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, identifier: true } }),

  findUsuarios: (ids: string[]): Promise<PosPessoa[]> =>
    prisma.user.findMany({ where: { id: { in: ids } }, select: SELECT_PESSOA }),

  findPosParaRelatorio: (where: Prisma.PosAtendimentoWhereInput): Promise<PosRelatorioRow[]> =>
    prisma.posAtendimento.findMany({ where, select: SELECT_RELATORIO }),

  findPosDoRelatorio: (where: Prisma.PosAtendimentoWhereInput, skip: number, take: number): Promise<PosComAlvoRow[]> =>
    prisma.posAtendimento.findMany({
      where,
      skip,
      take,
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
      include: INCLUDE_ITEM_DO_RELATORIO,
    }),

  countPosDoRelatorio: (where: Prisma.PosAtendimentoWhereInput) => prisma.posAtendimento.count({ where }),
};

export type PosAtendimentoDao = typeof posAtendimentoDao;
