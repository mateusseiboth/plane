/**
 * DAO do painel da página inicial: só acesso a dados. Toda regra (janela,
 * ranking, tipo do evento) vive em `painel.rules.ts` e a orquestração em
 * `painel.service.ts`.
 *
 * "Do usuário" é sempre responsável OU criador (`chamadosDaPessoa`), numa
 * definição só, para a série, os sistemas e a atividade contarem a mesma coisa.
 */
import prisma from "@db";
import { Prisma } from "@prisma/client";
import type { ContagemPorDia, ContagemPorPessoa, Janela } from "@modules/home/painel.rules";
import { FUSO } from "@utils/prazo";

export type EscopoDaPessoa = { workspaceId: string; userId: string };

const GRUPOS_ABERTOS = ["backlog", "unstarted", "started", "triage"];

const SELECT_PESSOA = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  displayName: true,
  avatar: true,
  avatarUrl: true,
} as const;

const SELECT_CHAMADO = {
  id: true,
  name: true,
  projectId: true,
  sequenceId: true,
  ticketSequence: true,
  ticketYear: true,
  project: { select: { identifier: true, name: true } },
} as const;

export type ChamadoResumido = Prisma.IssueGetPayload<{ select: typeof SELECT_CHAMADO }>;

const baseDoEspaco = (workspaceId: string) =>
  ({ workspaceId, deletedAt: null, isDraft: false, archivedAt: null }) satisfies Prisma.IssueWhereInput;

const doResponsavel = (userId: string) => ({ assignees: { some: { assigneeId: userId, deletedAt: null } } });

const chamadosDaPessoa = ({ workspaceId, userId }: EscopoDaPessoa): Prisma.IssueWhereInput => ({
  ...baseDoEspaco(workspaceId),
  OR: [{ createdById: userId }, doResponsavel(userId)],
});

/** Encerrado de verdade: está numa etapa de conclusão e tem a data gravada. */
const encerradosNa = (janela: Janela): Prisma.IssueWhereInput => ({
  state: { group: "completed" },
  completedAt: { gte: janela.inicio, lte: janela.fim },
});

/** O mesmo recorte de `chamadosDaPessoa`, em SQL, para as contagens por dia. */
const sqlDaPessoa = ({ workspaceId, userId }: EscopoDaPessoa) => Prisma.sql`
  i.workspace_id = ${workspaceId}::uuid AND i.deleted_at IS NULL AND i.is_draft = false AND i.archived_at IS NULL
  AND (i.created_by_id = ${userId}::uuid OR EXISTS (
    SELECT 1 FROM issue_assignees a WHERE a.issue_id = i.id AND a.assignee_id = ${userId}::uuid AND a.deleted_at IS NULL
  ))`;

/** `YYYY-MM-DD` no fuso do escritório; as colunas são `timestamp` gravado em UTC. */
const diaLocal = (coluna: Prisma.Sql) =>
  Prisma.sql`to_char((${coluna} AT TIME ZONE 'UTC') AT TIME ZONE ${FUSO}, 'YYYY-MM-DD')`;

const toContagens = (linhas: { dia: string; total: number | bigint }[]): ContagemPorDia[] =>
  linhas.map((l) => ({ dia: l.dia, total: Number(l.total) }));

export const painelDao = {
  countAbertosPorDia: async (escopo: EscopoDaPessoa, janela: Janela): Promise<ContagemPorDia[]> =>
    toContagens(
      await prisma.$queryRaw<{ dia: string; total: bigint }[]>`
        SELECT ${diaLocal(Prisma.sql`i.created_at`)} AS dia, COUNT(*) AS total
        FROM issues i
        WHERE ${sqlDaPessoa(escopo)} AND i.created_at >= ${janela.inicio} AND i.created_at <= ${janela.fim}
        GROUP BY 1`
    ),

  countEncerradosPorDia: async (escopo: EscopoDaPessoa, janela: Janela): Promise<ContagemPorDia[]> =>
    toContagens(
      await prisma.$queryRaw<{ dia: string; total: bigint }[]>`
        SELECT ${diaLocal(Prisma.sql`i.completed_at`)} AS dia, COUNT(*) AS total
        FROM issues i JOIN states s ON s.id = i.state_id AND s."group" = 'completed'
        WHERE ${sqlDaPessoa(escopo)} AND i.completed_at >= ${janela.inicio} AND i.completed_at <= ${janela.fim}
        GROUP BY 1`
    ),

  findTarefas: ({ workspaceId, userId }: EscopoDaPessoa, limite: number) =>
    prisma.issue.findMany({
      where: {
        ...baseDoEspaco(workspaceId),
        ...doResponsavel(userId),
        state: { group: { in: GRUPOS_ABERTOS } },
        targetDate: { not: null },
      },
      orderBy: [{ targetDate: "asc" }, { id: "asc" }],
      take: limite,
      select: {
        ...SELECT_CHAMADO,
        priority: true,
        targetDate: true,
        entity: { select: { name: true } },
        state: { select: { name: true, group: true } },
      },
    }),

  /** Primeira etapa de conclusão de cada sistema, onde o checkbox da tarefa leva o chamado. */
  findEtapasDeConclusao: (projectIds: string[]) =>
    prisma.state.findMany({
      where: { projectId: { in: projectIds }, group: "completed", deletedAt: null },
      orderBy: { sequence: "asc" },
      select: { id: true, projectId: true },
    }),

  countEmAberto: ({ workspaceId, userId }: EscopoDaPessoa) =>
    prisma.issue.count({
      where: { ...baseDoEspaco(workspaceId), ...doResponsavel(userId), state: { group: { in: GRUPOS_ABERTOS } } },
    }),

  /** Encerrados no período por responsável, no espaço inteiro: a base do ranking. */
  countEncerradosPorPessoa: async (workspaceId: string, janela: Janela): Promise<ContagemPorPessoa[]> => {
    const grupos = await prisma.issueAssignee.groupBy({
      by: ["assigneeId"],
      where: {
        deletedAt: null,
        assignee: { isBotUser: false },
        issue: { ...baseDoEspaco(workspaceId), ...encerradosNa(janela) },
      },
      _count: { issueId: true },
    });
    return grupos.map((g) => ({ pessoaId: g.assigneeId, total: g._count.issueId }));
  },

  avgHorasDeResolucao: async ({ workspaceId, userId }: EscopoDaPessoa, janela: Janela): Promise<number | null> => {
    const [linha] = await prisma.$queryRaw<{ horas: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (i.completed_at - i.created_at))) / 3600 AS horas
      FROM issues i JOIN states s ON s.id = i.state_id AND s."group" = 'completed'
      WHERE i.workspace_id = ${workspaceId}::uuid AND i.deleted_at IS NULL AND i.is_draft = false
        AND i.completed_at >= ${janela.inicio} AND i.completed_at <= ${janela.fim}
        AND EXISTS (
          SELECT 1 FROM issue_assignees a
          WHERE a.issue_id = i.id AND a.assignee_id = ${userId}::uuid AND a.deleted_at IS NULL
        )`;
    return linha?.horas === null || linha?.horas === undefined ? null : Number(linha.horas);
  },

  countAbertosPorSistema: (escopo: EscopoDaPessoa, janela: Janela) =>
    prisma.issue.groupBy({
      by: ["projectId"],
      where: { ...chamadosDaPessoa(escopo), createdAt: { gte: janela.inicio, lte: janela.fim } },
      _count: { id: true },
    }),

  findProjetos: (ids: string[]) =>
    prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, identifier: true } }),

  findPessoa: (userId: string) => prisma.user.findUnique({ where: { id: userId }, select: SELECT_PESSOA }),

  findVinculoNoEspaco: ({ workspaceId, userId }: EscopoDaPessoa) =>
    prisma.workspaceMember.findFirst({
      where: { workspaceId, memberId: userId, deletedAt: null },
      select: { createdAt: true, role: true, companyRole: true, workflowRole: { select: { name: true } } },
    }),

  findSistemasDaPessoa: ({ workspaceId, userId }: EscopoDaPessoa) =>
    prisma.projectMember.findMany({
      where: {
        workspaceId,
        memberId: userId,
        isActive: true,
        deletedAt: null,
        project: { deletedAt: null, archivedAt: null },
      },
      select: { project: { select: { id: true, name: true, identifier: true } } },
      orderBy: { project: { name: "asc" } },
    }),

  /** Último login registrado na trilha LGPD (o login é auditado no primeiro espaço da pessoa). */
  findUltimoLogin: async (userId: string) =>
    (
      await prisma.auditLog.findFirst({
        where: { actorId: userId, action: "login" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      })
    )?.createdAt ?? null,

  findTrilhaDaPessoa: ({ workspaceId, userId }: EscopoDaPessoa, campos: string[], limite: number) =>
    prisma.issueActivity.findMany({
      where: { workspaceId, actorId: userId, deletedAt: null, field: { in: campos }, issue: baseDoEspaco(workspaceId) },
      orderBy: { createdAt: "desc" },
      take: limite,
      select: {
        id: true,
        createdAt: true,
        field: true,
        verb: true,
        newValue: true,
        projectId: true,
        issue: { select: SELECT_CHAMADO },
      },
    }),

  findComentariosDaPessoa: ({ workspaceId, userId }: EscopoDaPessoa, limite: number) =>
    prisma.issueComment.findMany({
      where: { workspaceId, actorId: userId, deletedAt: null, issue: baseDoEspaco(workspaceId) },
      orderBy: { createdAt: "desc" },
      take: limite,
      select: {
        id: true,
        createdAt: true,
        commentStripped: true,
        commentHtml: true,
        issue: { select: SELECT_CHAMADO },
      },
    }),

  /** Grupo das etapas por (sistema, nome): a trilha guarda o NOME da etapa, não o id. */
  findGruposDasEtapas: (projectIds: string[], nomes: string[]) =>
    prisma.state.findMany({
      where: { projectId: { in: projectIds }, name: { in: nomes }, deletedAt: null },
      select: { projectId: true, name: true, group: true },
    }),
};

export type PainelDao = typeof painelDao;
