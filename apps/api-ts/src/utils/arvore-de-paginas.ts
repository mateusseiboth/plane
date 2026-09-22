/**
 * Regras da hierarquia de páginas (`pages.parent_id`), usadas pelas páginas de
 * sistema e pela wiki do espaço. Só dados e regra: quem decide o escopo (qual
 * wiki, qual sistema) é o módulo de páginas, que passa o filtro pronto.
 *
 * O que vive aqui:
 *  - a subárvore de uma página (ela e todas as descendentes vivas);
 *  - a validação do pai: precisa existir no MESMO escopo e não pode ser a
 *    própria página nem uma descendente dela (um ciclo some com a subárvore
 *    inteira da tela, porque nenhuma delas chega a ser raiz);
 *  - a posição de uma página nova, depois das irmãs;
 *  - arquivar e restaurar levando a subárvore junto, como o Django fazia
 *    (`unarchive_archive_page_and_descendants`);
 *  - soltar as filhas de uma página excluída.
 */
import prisma from "@db";

/** Erro de regra da árvore. O `errorHandler` do app responde com este status. */
export class ArvoreDePaginasError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Distância entre irmãs novas: sobra espaço para reordenar entre duas sem renumerar. */
export const SORT_ORDER_STEP = 10_000;

/** Filtro Prisma de "páginas deste escopo" (wiki do espaço ou um sistema). */
export type EscopoDaArvore = Record<string, unknown>;

/** Ids da página e de toda a descendência viva, a própria página primeiro. */
export async function findSubarvore(pageId: string): Promise<string[]> {
  const linhas = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE descendentes AS (
      SELECT id FROM pages WHERE id = ${pageId}::uuid
      UNION ALL
      SELECT p.id FROM pages p JOIN descendentes d ON p.parent_id = d.id WHERE p.deleted_at IS NULL
    )
    SELECT id FROM descendentes
  `;
  return linhas.map((l) => l.id);
}

/**
 * Confere o pai pedido para a página. `parentId` nulo ou ausente é "raiz" e
 * sempre vale. `pageId` ausente é criação: não há subárvore a conferir.
 */
export async function requireParentValido(params: {
  escopo: EscopoDaArvore;
  parentId: string | null | undefined;
  pageId?: string;
}): Promise<void> {
  const { escopo, parentId, pageId } = params;
  if (!parentId) return;

  const pai = await prisma.page.findFirst({ where: { ...escopo, id: parentId }, select: { id: true } });
  if (!pai) throw new ArvoreDePaginasError("A página mãe não foi encontrada neste espaço.");
  if (!pageId) return;

  const descendentes = await findSubarvore(pageId);
  if (descendentes.includes(parentId)) {
    throw new ArvoreDePaginasError("Uma página não pode ficar dentro dela mesma.");
  }
}

/** Posição para uma página nova: depois da última irmã do mesmo pai. */
export async function getNextSortOrder(workspaceId: string, parentId: string | null): Promise<number> {
  const ultima = await prisma.page.aggregate({
    where: { workspaceId, parentId, deletedAt: null },
    _max: { sortOrder: true },
  });
  return (ultima._max.sortOrder ?? 0) + SORT_ORDER_STEP;
}

/** Arquiva a página e a descendência inteira (ou restaura, com `null`). */
export async function setArchivedSubarvore(pageId: string, archivedAt: Date | null): Promise<void> {
  const ids = await findSubarvore(pageId);
  await prisma.page.updateMany({ where: { id: { in: ids } }, data: { archivedAt } });
}

/**
 * Restaurar a filha de um pai que continua arquivado a solta do pai: presa a
 * ele, ela voltaria para uma árvore em que nenhum ancestral aparece.
 */
export async function detachFromParentArquivado(page: { id: string; parentId: string | null }): Promise<void> {
  if (!page.parentId) return;
  const pai = await prisma.page.findUnique({ where: { id: page.parentId }, select: { archivedAt: true } });
  if (!pai?.archivedAt) return;
  await prisma.page.update({ where: { id: page.id }, data: { parentId: null } });
}

/** Excluir não leva as filhas: elas sobem para a raiz, como no Django. */
export function detachFilhas(pageId: string) {
  return prisma.page.updateMany({ where: { parentId: pageId, deletedAt: null }, data: { parentId: null } });
}
