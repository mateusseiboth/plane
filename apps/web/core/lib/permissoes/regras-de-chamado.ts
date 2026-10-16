/**
 * Decisões de tela sobre o chamado que juntam mais de uma ação da matriz
 * (as mesmas chaves que o api-ts confere). Nada de nível fixo de papel aqui:
 * `can` vem de `useMyWorkspaceActions(slug)`.
 */
type TCan = (action: string) => boolean;

/** Editar chamados no quadro, na lista, no detalhe: quem edita qualquer um ou os próprios. */
export const isIssueEditAllowed = (can: TCan): boolean => can("issue.edit.all") || can("issue.edit.own");

/** Excluir: quem exclui qualquer chamado, ou quem abriu este e exclui os próprios. */
export const isIssueDeleteAllowed = (can: TCan, isCreator: boolean): boolean =>
  can("issue.delete.all") || (isCreator && can("issue.delete.own"));

/** Quem abre pedido de chamado mas não cria chamado (o atalho "novo" vira "nova solicitação"). */
export const isIntakeOnlyOperator = (can: TCan): boolean => can("intake.create") && !can("issue.create");
