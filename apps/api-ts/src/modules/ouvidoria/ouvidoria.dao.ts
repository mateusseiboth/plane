/**
 * DAO da ouvidoria: só acesso a dados. Regra (tipo, CNPJ, quem leu) vive em
 * `ouvidoria.rules.ts` e `ouvidoria.service.ts`.
 */
import prisma from "@db";
import type { Prisma } from "@prisma/client";

export type OuvidoriaRow = Prisma.OuvidoriaGetPayload<object>;

const SELECT_PESSOA = { id: true, displayName: true } as const;
const SELECT_ENTIDADE = { id: true, name: true } as const;

export const ouvidoriaDao = {
  /** O CNPJ do cadastro pode estar com máscara: compara só os dígitos. */
  findEntidadePorCnpj: async (workspaceId: string, cnpj: string) => {
    const linhas = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id::text AS id, name FROM entities
       WHERE workspace_id = ${workspaceId}::uuid AND deleted_at IS NULL
         AND regexp_replace(coalesce(cnpj, ''), '\\D', '', 'g') = ${cnpj}
       ORDER BY is_active DESC, created_at ASC
       LIMIT 1`;
    return linhas[0] ?? null;
  },

  create: (data: Prisma.OuvidoriaUncheckedCreateInput) => prisma.ouvidoria.create({ data }),

  findMany: (where: Prisma.OuvidoriaWhereInput, skip: number, take: number) =>
    prisma.ouvidoria.findMany({ where, skip, take, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),

  count: (where: Prisma.OuvidoriaWhereInput) => prisma.ouvidoria.count({ where }),

  findOne: (workspaceId: string, id: string) => prisma.ouvidoria.findFirst({ where: { id, workspaceId } }),

  markRead: (id: string, data: { readAt: Date; readById: string }) => prisma.ouvidoria.update({ where: { id }, data }),

  findEntidades: (ids: string[]) => prisma.entity.findMany({ where: { id: { in: ids } }, select: SELECT_ENTIDADE }),

  findUsuarios: (ids: string[]) => prisma.user.findMany({ where: { id: { in: ids } }, select: SELECT_PESSOA }),

  /** As solicitações criadas a partir das ouvidorias, com o que o processo precisa. */
  findSolicitacoes: (ids: string[]) =>
    prisma.issue.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        name: true,
        projectId: true,
        sequenceId: true,
        project: { select: { identifier: true, name: true } },
        state: { select: { group: true, name: true } },
        assignees: { where: { deletedAt: null }, select: { assigneeId: true }, orderBy: { createdAt: "asc" } },
        intakeIssues: { where: { deletedAt: null }, select: { status: true }, take: 1 },
        activities: {
          where: { deletedAt: null },
          select: { field: true, newValue: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),

  linkSolicitacao: (id: string, issueId: string) =>
    prisma.ouvidoria.update({ where: { id }, data: { solicitacaoIssueId: issueId } }),
};

export type OuvidoriaDao = typeof ouvidoriaDao;
