// Controle de quem pode enviar (upload) extensões — plugins e widgets.
// Além de admins de instância / superusuários, usuários do grupo **TI** (role 12,
// ver custom-role-model) podem enviar SEM necessidade de aprovação (uploads ficam
// ACTIVE diretamente). Plugins/widgets são globais da instância, então "ser TI" é
// possuir o papel TI em qualquer workspace ativo.
//
// A tela de Configurações > Plugins acrescentou um terceiro caminho: quem tem a
// ação `plugin.manage` em ALGUM espaço ativo também envia. Sem isso o admin do
// espaço veria a tela e tomaria 403 no botão de enviar.

import prisma from "@db";
import { hasWorkspaceAction, EProjectAction } from "@utils/permission-checks";

// Valor do papel TI no enum de permissões (mantido em sincronia com
// packages/constants e packages/types). Ver memória custom-role-model.
const TI_ROLE = 12;

export interface MaybeAdminUser {
  id: string;
  isInstanceAdmin: boolean;
  isSuperuser: boolean;
}

/** True se o usuário tem `plugin.manage` em algum espaço de que participa. */
export async function canManagePlugins(userId: string): Promise<boolean> {
  try {
    const membros = await prisma.workspaceMember.findMany({
      where: { memberId: userId, isActive: true, deletedAt: null },
      select: { workspaceId: true },
    });
    const permitidos = await Promise.all(
      membros.map((m) => hasWorkspaceAction(m.workspaceId, userId, EProjectAction.PLUGIN_MANAGE))
    );
    return permitidos.some(Boolean);
  } catch {
    return false;
  }
}

/** True se o usuário pode enviar extensões (admin de instância, superuser, TI ou `plugin.manage`). */
export async function isUploader(user: MaybeAdminUser): Promise<boolean> {
  if (user.isInstanceAdmin || user.isSuperuser) return true;
  try {
    const membership = await prisma.workspaceMember.findFirst({
      where: { memberId: user.id, role: TI_ROLE, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (membership) return true;
  } catch {
    return false;
  }
  return canManagePlugins(user.id);
}

export async function requireUploader(user: MaybeAdminUser, set: { status?: number | string }): Promise<void> {
  if (!(await isUploader(user))) {
    set.status = 403;
    throw Object.assign(new Error("Você não tem permissão para enviar extensões. Peça a quem administra o espaço."), {
      status: 403,
    });
  }
}
