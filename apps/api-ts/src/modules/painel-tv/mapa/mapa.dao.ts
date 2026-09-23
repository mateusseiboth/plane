/**
 * DAO do painel do mapa: as entidades do espaço e quantos chamados ABERTOS
 * cada uma tem. Só acesso a dados.
 *
 * A contagem sai de um `groupBy` por entidade, não de `_count` de relação: com
 * `_count` o Prisma monta uma subconsulta por linha, e são centenas de
 * entidades numa tela que recarrega sozinha.
 */
import prisma from "@db";
import type { Prisma } from "@prisma/client";

/** Etapas que NÃO contam como chamado aberto. */
const GRUPOS_ENCERRADOS = ["completed", "cancelled"];

export type EntidadeDoEspaco = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  legacyId: number | null;
  sacCode: number | null;
};

export function findEntidadesDoEspaco(workspaceId: string): Promise<EntidadeDoEspaco[]> {
  return prisma.entity.findMany({
    where: { workspaceId, deletedAt: null, isActive: true },
    select: { id: true, name: true, city: true, state: true, legacyId: true, sacCode: true },
    orderBy: { name: "asc" },
  });
}

const whereAberto = (workspaceId: string, extra: Prisma.IssueWhereInput = {}): Prisma.IssueWhereInput => ({
  workspaceId,
  deletedAt: null,
  isDraft: false,
  entityId: { not: null },
  state: { group: { notIn: GRUPOS_ENCERRADOS } },
  ...extra,
});

async function countPorEntidade(where: Prisma.IssueWhereInput): Promise<Map<string, number>> {
  const linhas = await prisma.issue.groupBy({ by: ["entityId"], where, _count: { _all: true } });
  return new Map(linhas.filter((l) => l.entityId).map((l) => [l.entityId!, l._count._all]));
}

export const countChamadosAbertos = (workspaceId: string) => countPorEntidade(whereAberto(workspaceId));

export const countChamadosUrgentes = (workspaceId: string) =>
  countPorEntidade(whereAberto(workspaceId, { priority: "urgent" }));
