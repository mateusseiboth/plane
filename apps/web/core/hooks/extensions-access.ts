/**
 * Quem gerencia extensões (plugins e widgets da instância): o admin da instância,
 * ou quem tem `extension.upload` ou `plugin.manage` em QUALQUER espaço de que
 * participa. Espelha `isUploader` de apps/api-ts/src/utils/registry-access.ts.
 */
import { isActionAllowed } from "@/lib/permissoes/acao-efetiva";

const EXTENSION_ACTIONS = ["extension.upload", "plugin.manage"] as const;

type TWorkspaceActions = { permissions: readonly string[] } | undefined;

const hasExtensionAction = (actions: TWorkspaceActions): boolean =>
  !!actions && EXTENSION_ACTIONS.some((action) => isActionAllowed(action, actions.permissions, undefined));

export const isExtensionManager = (
  isInstanceAdmin: boolean,
  workspacesActions: readonly TWorkspaceActions[]
): boolean => isInstanceAdmin || workspacesActions.some(hasExtensionAction);
