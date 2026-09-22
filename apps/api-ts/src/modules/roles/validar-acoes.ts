import { isKnownAction } from "@utils/permissions";

export type ActionFieldError = { path: string; message: string };

/**
 * Erros das listas de ações de um corpo (`permissions`, `granted`, `revoked`),
 * cada um com o `path` do campo.
 *
 * Quem edita funções só concede o que ele mesmo tem: sem isso, quem recebeu
 * "Gerenciar funções" se daria "Configurar o espaço" e escalaria sozinho. Negar
 * não tem essa trava. Campos em `grantFields` são os que concedem.
 */
export function findActionErrors(
  body: Record<string, unknown>,
  callerActions: readonly string[],
  options: { grantFields?: string[] } = {}
): ActionFieldError[] {
  const grantFields = new Set(options.grantFields ?? ["granted", "permissions"]);
  return Object.entries(body).flatMap(([field, value]) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return [{ path: field, message: "Informe uma lista de permissões." }];
    return value.flatMap((acao, i): ActionFieldError[] => {
      if (!isKnownAction(acao)) return [{ path: `${field}[${i}]`, message: "Permissão desconhecida." }];
      if (grantFields.has(field) && !callerActions.includes(acao)) {
        return [{ path: `${field}[${i}]`, message: "Você não pode conceder uma permissão que não tem." }];
      }
      return [];
    });
  });
}
