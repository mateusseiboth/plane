// Controle de quem pode enviar (upload) extensões — plugins e widgets.
// Além de admins de instância / superusuários, quem tem a ação `extension.upload`
// (TI por padrão) envia SEM necessidade de aprovação (uploads ficam ACTIVE
// diretamente). Plugins/widgets são globais da instância, então basta ter a
// ação em QUALQUER espaço ativo. Antes era o número do papel TI (12); a ação
// respeita a função configurada na tela e as exceções por pessoa (W44).
//
// A tela de Configurações > Plugins acrescentou um terceiro caminho: quem tem a
// ação `plugin.manage` em ALGUM espaço ativo também envia. Sem isso o admin do
// espaço veria a tela e tomaria 403 no botão de enviar.

import prisma from "@db";
import { hasWorkspaceAction, EProjectAction } from "@utils/permission-checks";

export interface MaybeAdminUser {
  id: string;
  isInstanceAdmin: boolean;
  isSuperuser: boolean;
}

/** True se o usuário tem alguma das ações em algum espaço ativo de que participa. */
async function hasActionInAnyWorkspace(userId: string, actions: readonly EProjectAction[]): Promise<boolean> {
  try {
    const membros = await prisma.workspaceMember.findMany({
      where: { memberId: userId, isActive: true, deletedAt: null },
      select: { workspaceId: true },
    });
    const permitidos = await Promise.all(
      membros.flatMap((m) => actions.map((action) => hasWorkspaceAction(m.workspaceId, userId, action)))
    );
    return permitidos.some(Boolean);
  } catch {
    return false;
  }
}

/** True se o usuário tem `plugin.manage` em algum espaço de que participa. */
export const canManagePlugins = (userId: string): Promise<boolean> =>
  hasActionInAnyWorkspace(userId, [EProjectAction.PLUGIN_MANAGE]);

/** True se o usuário pode enviar extensões (admin de instância, superuser, `extension.upload` ou `plugin.manage`). */
export async function isUploader(user: MaybeAdminUser): Promise<boolean> {
  if (user.isInstanceAdmin || user.isSuperuser) return true;
  return hasActionInAnyWorkspace(user.id, [EProjectAction.EXTENSION_UPLOAD, EProjectAction.PLUGIN_MANAGE]);
}

export async function requireUploader(user: MaybeAdminUser, set: { status?: number | string }): Promise<void> {
  if (!(await isUploader(user))) {
    set.status = 403;
    throw Object.assign(new Error("Você não tem permissão para enviar extensões. Peça a quem administra o espaço."), {
      status: 403,
    });
  }
}
