/** DAO do log consolidado: atividades e comentários dos chamados do filtro. */
import prisma from "@db";
import type { Prisma } from "@prisma/client";

const SELECT_CHAMADO_DO_LOG = {
  id: true,
  name: true,
  sequenceId: true,
  ticketSequence: true,
  ticketYear: true,
  project: { select: { name: true, identifier: true } },
  state: { select: { name: true } },
} satisfies Prisma.IssueSelect;

export type ChamadoDoLog = Prisma.IssueGetPayload<{ select: typeof SELECT_CHAMADO_DO_LOG }>;

export type FiltroDoLog = {
  issue: Prisma.IssueWhereInput;
  criadoEm?: { gte?: Date; lte?: Date };
  /** Só estes autores (filtro por função ou pessoa); ausente = todos. */
  autores?: string[];
  limite: number;
};

const whereDoAutor = (f: FiltroDoLog) => ({
  deletedAt: null,
  issue: f.issue,
  ...(f.criadoEm ? { createdAt: f.criadoEm } : {}),
  ...(f.autores ? { actorId: { in: f.autores } } : {}),
});

export async function findAtividadesDoLog(f: FiltroDoLog) {
  const where = whereDoAutor(f);
  const [linhas, total] = await Promise.all([
    prisma.issueActivity.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        verb: true,
        field: true,
        oldValue: true,
        newValue: true,
        actorId: true,
        issue: { select: SELECT_CHAMADO_DO_LOG },
      },
      orderBy: { createdAt: "desc" },
      take: f.limite,
    }),
    prisma.issueActivity.count({ where }),
  ]);
  return { linhas, total };
}

export async function findComentariosDoLog(f: FiltroDoLog) {
  const where = whereDoAutor(f);
  const [linhas, total] = await Promise.all([
    prisma.issueComment.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        commentStripped: true,
        actorId: true,
        issue: { select: SELECT_CHAMADO_DO_LOG },
      },
      orderBy: { createdAt: "desc" },
      take: f.limite,
    }),
    prisma.issueComment.count({ where }),
  ]);
  return { linhas, total };
}
