/**
 * Leituras de tabelas do api-ts (entidades e sistemas do responsável) usadas
 * pelas ferramentas do atendente. SQL puro, como o resto do chat faz com as
 * tabelas que não são dele (ver src/responsaveis.ts). Só acesso a dados.
 *
 * O `workspaceId` do chat é o SLUG; as tabelas do api-ts guardam o UUID.
 */

import prisma from "@db";

export type EntidadeDoEspaco = { id: string; name: string };

export async function findEntidadeDoEspaco(slug: string, entityId: string): Promise<EntidadeDoEspaco | null> {
  const linhas = (await prisma.$queryRaw`
    SELECT e.id::text AS id, e.name
      FROM entities e JOIN workspaces w ON w.id = e.workspace_id
     WHERE w.slug = ${slug} AND e.deleted_at IS NULL AND e.id::text = ${entityId}
     LIMIT 1`) as EntidadeDoEspaco[];
  return linhas[0] ?? null;
}

export async function findEntidadesPorId(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const linhas = (await prisma.$queryRaw`
    SELECT id::text AS id, name FROM entities WHERE id::text = ANY(${ids}::text[])`) as EntidadeDoEspaco[];
  return new Map(linhas.map((e) => [e.id, e.name]));
}

/** Sistemas (projetos) de que o responsável cuida no cliente. */
export async function findSistemasDoResponsavel(entityContactId: string): Promise<string[]> {
  const linhas = (await prisma.$queryRaw`
    SELECT ecp.project_id::text AS id
      FROM entity_contact_projects ecp JOIN projects p ON p.id = ecp.project_id
     WHERE ecp.contact_id::text = ${entityContactId} AND p.deleted_at IS NULL
     ORDER BY ecp.created_at ASC`) as Array<{ id: string }>;
  return linhas.map((l) => l.id);
}

export async function saveFotoDoResponsavel(entityContactId: string, photo: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE entity_contacts SET photo = ${photo}, updated_at = now() WHERE id::text = ${entityContactId}`;
}
