/**
 * Quem mexe numa linha da lista de membros do sistema.
 *
 * Trocar a função e remover outra pessoa é o que PATCH e DELETE
 * /projects/:id/members/:pk/ conferem (`member.manage`). Sair do sistema pela
 * própria linha vale para todo membro (POST /members/leave/).
 */
type TMemberRow = {
  canManageMembers: boolean;
  isCurrentUser: boolean;
};

type TRoleRow = TMemberRow & {
  /** O admin do espaço tem nível de admin em todo sistema: a função dele no sistema não muda. */
  isRowWorkspaceAdmin: boolean;
};

export const isProjectRoleEditable = ({ canManageMembers, isCurrentUser, isRowWorkspaceAdmin }: TRoleRow): boolean =>
  canManageMembers && !isCurrentUser && !isRowWorkspaceAdmin;

export const isProjectMemberRemovable = ({ canManageMembers, isCurrentUser }: TMemberRow): boolean =>
  canManageMembers || isCurrentUser;
