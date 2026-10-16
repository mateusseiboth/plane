/**
 * Mesma regra do backend (`applyMemberOverrides` em apps/api-ts/src/utils/permissions.ts):
 * permissões da função, mais o que foi concedido à pessoa, menos o que foi negado.
 * A negação vence. É só para decidir o que MOSTRAR; quem barra é a API.
 */
export type TActionOverrides = { granted: string[]; revoked: string[] };

export const isActionAllowed = (
  action: string,
  rolePermissions: readonly string[],
  overrides: TActionOverrides | undefined
): boolean => {
  if (overrides?.revoked.includes(action)) return false;
  if (overrides?.granted.includes(action)) return true;
  return rolePermissions.includes(action);
};

/**
 * Ação que um item de menu ou uma tela exige: uma chave do catálogo, ou uma
 * lista (qualquer uma libera). Sem exigência, basta participar do espaço.
 */
export type TRequiredAction = string | readonly string[] | undefined;

const toActionList = (required: TRequiredAction): readonly string[] =>
  typeof required === "string" ? [required] : (required ?? []);

export const isRequiredActionAllowed = (required: TRequiredAction, can: (action: string) => boolean): boolean => {
  const actions = toActionList(required);
  return actions.length === 0 || actions.some(can);
};
