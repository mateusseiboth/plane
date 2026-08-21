/**
 * Papéis do espaço de trabalho, no modelo DESTE fork.
 *
 * O Plane original tinha três papéis (admin 20, membro 15, convidado 5) e o chat
 * nasceu perguntando `role >= 15` em todo lugar onde precisava saber "essa
 * pessoa é da equipe?". A Quality acrescentou papéis ABAIXO de membro — TI (12),
 * Qualidade (8) e Atendimento (6) — e a pergunta ficou errada justamente para
 * quem mais atende: o papel *Atendimento* não aparecia em nenhuma lista de
 * atendentes, mesmo com a pessoa conectada.
 *
 * São três perguntas diferentes, e antes as três usavam o mesmo número:
 *
 *  - `ehAtendente`  — pode atender, aparece nas listas e recebe conversa da fila.
 *  - `podeGerenciar` — transfere atendimento e lê os relatórios (membro acima).
 *  - `ehAdmin`      — vê a fila, o robô e a avaliação dada pelo cliente.
 *
 * Os valores espelham `EUserPermissions` (`packages/constants/src/user.ts`).
 * Mudou lá, muda aqui.
 */

import prisma from "@db";

export const PAPEL = {
  CONVIDADO: 5,
  ATENDIMENTO: 6,
  QUALIDADE: 8,
  TI: 12,
  MEMBRO: 15,
  GESTOR: 18,
  ADMIN: 20,
} as const;

/** Quem atende: do papel Atendimento para cima. Convidado não atende. */
export function ehAtendente(papel: number): boolean {
  return papel >= PAPEL.ATENDIMENTO;
}

/** Quem transfere atendimento e lê relatórios. */
export function podeGerenciar(papel: number): boolean {
  return papel >= PAPEL.MEMBRO;
}

/** Quem vê a fila, o robô e a avaliação que o cliente deu. */
export function ehAdmin(papel: number): boolean {
  return papel >= PAPEL.ADMIN;
}

/**
 * O papel da pessoa no espaço, ou 0 quando ela não é do espaço.
 *
 * `slug` é o slug do workspace do Plane — é o que o chat carrega como
 * `workspaceId` em todo lugar.
 */
export async function papelNoEspaco(slug: string, userId: string): Promise<number> {
  try {
    const linhas = (await prisma.$queryRaw`
      SELECT wm.role AS role
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE w.slug = ${slug} AND wm.member_id::text = ${userId}
        AND wm.deleted_at IS NULL AND wm.is_active = true
      LIMIT 1`) as Array<{ role: number }>;
    return Number(linhas[0]?.role ?? 0);
  } catch (e) {
    console.error("[papeis] papelNoEspaco", e);
    return 0;
  }
}

export type Atendente = { id: string; name: string };

/**
 * Todo mundo do espaço que pode atender, em ordem alfabética.
 *
 * Fonte única das listas de atendentes: transferência, fila e qualquer outra que
 * venha depois. Banco fora do ar devolve lista vazia — lista vazia é uma tela
 * sem opção, e não uma tela com a equipe errada.
 */
export async function listarAtendentes(slug: string): Promise<Atendente[]> {
  try {
    return (await prisma.$queryRaw`
      SELECT u.id::text AS id,
             COALESCE(NULLIF(u.display_name, ''), NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email) AS name
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      JOIN users u ON u.id = wm.member_id
      WHERE w.slug = ${slug} AND wm.deleted_at IS NULL AND wm.is_active = true
        AND wm.role >= ${PAPEL.ATENDIMENTO}
      ORDER BY name ASC`) as Atendente[];
  } catch (e) {
    console.error("[papeis] listarAtendentes", e);
    return [];
  }
}
