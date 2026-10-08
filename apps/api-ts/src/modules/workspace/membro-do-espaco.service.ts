// Membro do espaço visto pela tela de Configurações > Membros: detalhe, troca de
// função e remoção. O `:pk` destas rotas é o id do USUÁRIO (o mesmo de
// reset-password, freeze e de `member.id` na listagem). A tela mandava o id da
// associação, o `updateMany` não casava ninguém e a rota respondia 200 sem
// gravar. Por isso aqui tudo começa achando o vínculo e responde 404 sem ele.
import prisma from "@db";
import { syncFuncaoNosProjetos } from "@utils/permissions";

export const MEMBRO_NAO_ENCONTRADO = "Pessoa não encontrada neste espaço de trabalho.";

const MEMBRO_INCLUDE = {
  member: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      displayName: true,
      avatar: true,
      avatarUrl: true,
    },
  },
  workflowRole: { select: { id: true, key: true, name: true, level: true } },
} as const;

type Db = Pick<typeof prisma, "workspaceMember" | "workflowRole" | "projectMember">;

type MembroComFuncao = NonNullable<Awaited<ReturnType<typeof findMembroDoEspaco>>>;

export const findMembroDoEspaco = (workspaceId: string, userId: string, db: Db = prisma) =>
  db.workspaceMember.findFirst({ where: { workspaceId, memberId: userId, deletedAt: null }, include: MEMBRO_INCLUDE });

/** Mesmo formato da listagem de membros, mais a função configurável (permissões v2). */
export function serializeMembroDoEspaco(m: MembroComFuncao) {
  return {
    id: m.id,
    member: {
      id: m.member.id,
      email: m.member.email,
      display_name: m.member.displayName,
      avatar: m.member.avatar ?? "",
      avatar_url: m.member.avatarUrl ?? null,
      first_name: m.member.firstName,
      last_name: m.member.lastName,
      is_bot: false,
    },
    role: m.role,
    workflow_role: m.workflowRole,
    is_active: m.isActive,
    created_at: m.createdAt.toISOString(),
  };
}

/**
 * Grava o nível e a função que acompanha o nível, no espaço e nos sistemas.
 * Quem manda no quadro é a função do vínculo de projeto: sem propagar, a tela
 * mostrava "TI" e as transições seguiam a função antiga.
 */
export async function updateFuncaoDoMembro(workspaceId: string, userId: string, role: number) {
  return prisma.$transaction(async (tx) => {
    const funcao = await tx.workflowRole.findFirst({ where: { workspaceId, level: role, deletedAt: null } });
    await tx.workspaceMember.updateMany({
      where: { workspaceId, memberId: userId, deletedAt: null },
      data: { role, workflowRoleId: funcao?.id ?? null },
    });
    await syncFuncaoNosProjetos(tx as any, workspaceId, userId, role);
    return findMembroDoEspaco(workspaceId, userId, tx);
  });
}

export const removeMembroDoEspaco = (workspaceId: string, userId: string) =>
  prisma.workspaceMember.updateMany({
    where: { workspaceId, memberId: userId, deletedAt: null },
    data: { isActive: false, deletedAt: new Date() },
  });
