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
