/**
 * O que fazer com o upload de um plugin cujo slug talvez já exista.
 *
 * `Plugin.slug` é único na tabela inteira, incluindo as linhas com `deletedAt`.
 * Em vez de criar uma segunda linha, o upload reaproveita o cadastro: atualiza
 * (versão maior) ou reativa (depois de excluído). Reativar mantém o mesmo id, e
 * com ele a configuração e as permissões concedidas ao plugin.
 */
export const PLUGIN_UPLOAD_ACAO = {
  CREATE: "create",
  UPGRADE: "upgrade",
  REINSTALL: "reinstall",
} as const;

export type PluginUploadAcao = (typeof PLUGIN_UPLOAD_ACAO)[keyof typeof PLUGIN_UPLOAD_ACAO];

export interface IPluginCadastrado {
  version: string;
  deletedAt: Date | null;
}

export class PluginVersionRejectedError extends Error {
  readonly status = 409;

  constructor(slug: string, versaoAtual: string, versaoEnviada: string) {
    super(
      `O plugin "${slug}" já está na versão ${versaoAtual}. Envie uma versão maior que ${versaoAtual} (recebida: ${versaoEnviada}).`
    );
    this.name = new.target.name;
  }
}

const parseSemver = (version: string): number[] => version.split(".").map(Number);

/** Negativo se `a < b`, zero se iguais, positivo se `a > b`. Número a número: 1.10.0 > 1.9.0. */
export const compareSemver = (a: string, b: string): number => {
  const [partesA, partesB] = [parseSemver(a), parseSemver(b)];
  const diferenca = partesA.map((parte, i) => parte - (partesB[i] ?? 0)).find((d) => d !== 0);
  return diferenca ?? 0;
};

export const resolvePluginUploadAcao = (
  cadastrado: IPluginCadastrado | null,
  version: string,
  slug = ""
): PluginUploadAcao => {
  if (!cadastrado) return PLUGIN_UPLOAD_ACAO.CREATE;
  if (cadastrado.deletedAt) return PLUGIN_UPLOAD_ACAO.REINSTALL;
  if (compareSemver(version, cadastrado.version) > 0) return PLUGIN_UPLOAD_ACAO.UPGRADE;
  throw new PluginVersionRejectedError(slug, cadastrado.version, version);
};
