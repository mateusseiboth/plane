/**
 * Regras puras da tela de Configurações > Plugins: a grade função × permissão e
 * a leitura dos erros de validação que a API devolve.
 *
 * Fora do React de propósito — é a parte que precisa de teste rápido, e é a que
 * garante que o erro do servidor volte para o CAMPO, não só para o toque.
 */

export type TGradeDeGrants = Record<string, string[]>;

export const isMarcadoNaGrade = (grade: TGradeDeGrants, roleId: string, permission: string): boolean =>
  (grade[roleId] ?? []).includes(permission);

/** Marca ou desmarca uma célula. Função sem nenhuma permissão sai da grade. */
export function toggleNaGrade(grade: TGradeDeGrants, roleId: string, permission: string): TGradeDeGrants {
  const atuais = grade[roleId] ?? [];
  const proximas = atuais.includes(permission) ? atuais.filter((p) => p !== permission) : [...atuais, permission];
  const { [roleId]: _removida, ...resto } = grade;
  return proximas.length ? { ...resto, [roleId]: proximas } : resto;
}

export const contarPermissoesDaFuncao = (grade: TGradeDeGrants, roleId: string): number => (grade[roleId] ?? []).length;

const MENSAGEM_GENERICA = "Não foi possível concluir. Tente de novo.";

type TCorpoDeErro = { errors?: unknown; detail?: unknown };

const readCorpo = (erro: unknown): TCorpoDeErro => {
  if (!erro || typeof erro !== "object") return {};
  const comResposta = erro as { response?: { data?: unknown } };
  const data = comResposta.response?.data;
  if (data && typeof data === "object") return data as TCorpoDeErro;
  return erro as TCorpoDeErro;
};

/**
 * `{path, message}` da API vira um mapa caminho → mensagem, pronto para colar no
 * campo. O que não tem caminho fica na chave vazia (o aviso do formulário).
 */
export function readErrosDeCampo(erro: unknown): Record<string, string> {
  const corpo = readCorpo(erro);
  const lista = Array.isArray(corpo.errors) ? corpo.errors : [];
  const porCampo: Record<string, string> = {};
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const { path, message } = item as { path?: unknown; message?: unknown };
    if (typeof path !== "string" || typeof message !== "string") continue;
    porCampo[path] ??= message;
  }
  if (Object.keys(porCampo).length) return porCampo;
  return { "": typeof corpo.detail === "string" ? corpo.detail : MENSAGEM_GENERICA };
}
