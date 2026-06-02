import type {Prisma, PrismaClient} from "@prisma/client";

/**
 * Compute the next per-project work-item sequence number (e.g. CONTAB-12).
 *
 * Plane scopes `sequence_id` to the project, so each new issue gets
 * `max(sequence_id) + 1` for its project. The schema defaults the column to 0,
 * which means any create path that forgets to set it produces PROJ-0 for every
 * item — call this helper instead.
 *
 * Pass a transaction client (`tx`) when creating inside a `$transaction` so the
 * read and the subsequent insert can't interleave with a concurrent create.
 */
export async function nextSequenceId(
  client: Prisma.TransactionClient | PrismaClient,
  projectId: string,
): Promise<number> {
  const maxSeq = await client.issue.aggregate({where: {projectId}, _max: {sequenceId: true}});
  return (maxSeq._max.sequenceId ?? 0) + 1;
}
