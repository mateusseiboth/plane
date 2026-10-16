/**
 * Ações do menu da linha de um membro do espaço.
 *
 * Redefinir senha, congelar e remover outra pessoa são o que as rotas de membro
 * conferem (`workspace.members`). Sair do espaço pela própria linha vale para todos.
 */
export type TMemberAction = "reset-password" | "freeze" | "remove";

type TMemberRow = {
  canManageMembers: boolean;
  isCurrentUser: boolean;
  isSuspended: boolean;
};

export const buildMemberMenuActions = ({
  canManageMembers,
  isCurrentUser,
  isSuspended,
}: TMemberRow): TMemberAction[] => {
  const canActOnOther = canManageMembers && !isCurrentUser;
  const accountActions: TMemberAction[] = canActOnOther && !isSuspended ? ["reset-password", "freeze"] : [];
  const removeActions: TMemberAction[] = canActOnOther || isCurrentUser ? ["remove"] : [];
  return [...accountActions, ...removeActions];
};
