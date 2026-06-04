// Controle de quem pode enviar (upload) extensões — plugins e widgets.
// Além de admins de instância / superusuários, usuários do grupo **TI** (role 12,
// ver custom-role-model) podem enviar SEM necessidade de aprovação (uploads ficam
// ACTIVE diretamente). Plugins/widgets são globais da instância, então "ser TI" é
// possuir o papel TI em qualquer workspace ativo.

import prisma from "@db";

// Valor do papel TI no enum de permissões (mantido em sincronia com
// packages/constants e packages/types). Ver memória custom-role-model.
const TI_ROLE = 12;

export interface MaybeAdminUser {
  id: string;
  isInstanceAdmin: boolean;
  isSuperuser: boolean;
}

/** True se o usuário pode enviar extensões (admin de instância, superuser ou TI). */
export async function isUploader(user: MaybeAdminUser): Promise<boolean> {
  if (user.isInstanceAdmin || user.isSuperuser) return true;
  try {
    const membership = await prisma.workspaceMember.findFirst({
      where: { memberId: user.id, role: TI_ROLE, isActive: true, deletedAt: null },
      select: { id: true },
    });
    return Boolean(membership);
  } catch {
    return false;
  }
}

export async function requireUploader(user: MaybeAdminUser, set: { status?: number | string }): Promise<void> {
  if (!(await isUploader(user))) {
    set.status = 403;
    throw Object.assign(new Error("Apenas administradores da instância ou usuários do grupo TI podem enviar extensões."), {
      status: 403,
    });
  }
}
