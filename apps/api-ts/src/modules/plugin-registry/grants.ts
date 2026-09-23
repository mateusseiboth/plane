/**
 * Grade função × permissão do plugin: leitura, validação e o que mudar.
 *
 * Puro de propósito (nada de Prisma aqui): a regra de quem pode receber o quê é
 * a parte que precisa de teste rápido, e a gravação vira um diff, não um
 * apaga-tudo-e-grava — repetir a mesma grade não pode reescrever linha nenhuma.
 *
 * O `subject_id` gravado é o NÍVEL da função, porque é o que a associação da
 * pessoa carrega (`workspace_members.role`) e é por ele que o gateway resolve
 * as permissões em runtime.
 */

export type TFuncaoDoEspaco = { id: string; key: string; name: string; level: number };
export type TPermissaoDeclarada = { key: string; label: string; description?: string };
export type TErroDeCampo = { path: string; message: string };

export type TGradeDeGrants = Record<string, string[]>;

export type TLinhaDeGrant = { subjectId: string; permission: string };

const asStringList = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];

const pathDaFuncao = (roleId: string) => `grants.${roleId}`;

/**
 * Lê o corpo do PUT. Erro de validação volta com o caminho do campo (a linha da
 * função na grade), nunca um texto solto.
 */
export function parseGradeDeGrants(
  raw: unknown,
  funcoes: readonly TFuncaoDoEspaco[],
  permissoes: readonly TPermissaoDeclarada[]
): { grade: TGradeDeGrants; errors: TErroDeCampo[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { grade: {}, errors: [{ path: "grants", message: "Envie a grade de permissões por função." }] };
  }

  const porId = new Map(funcoes.map((f) => [f.id, f]));
  const declaradas = new Set(permissoes.map((p) => p.key));
  const errors: TErroDeCampo[] = [];
  const grade: TGradeDeGrants = {};

  for (const [roleId, valor] of Object.entries(raw as Record<string, unknown>)) {
    if (!porId.has(roleId)) {
      errors.push({ path: pathDaFuncao(roleId), message: "Função não encontrada neste espaço." });
      continue;
    }
    if (!Array.isArray(valor)) {
      errors.push({ path: pathDaFuncao(roleId), message: "Marque as permissões desta função." });
      continue;
    }
    const chaves = [...new Set(asStringList(valor))];
    const desconhecida = chaves.find((c) => !declaradas.has(c));
    if (desconhecida) {
      errors.push({ path: pathDaFuncao(roleId), message: `Permissão desconhecida: ${desconhecida}.` });
      continue;
    }
    if (chaves.length) grade[roleId] = chaves;
  }

  return { grade: errors.length ? {} : grade, errors };
}

/** Grade da tela (por id da função) a partir das linhas gravadas (por nível). */
export function buildGradeDasLinhas(
  linhas: readonly TLinhaDeGrant[],
  funcoes: readonly TFuncaoDoEspaco[]
): TGradeDeGrants {
  const idPorNivel = new Map(funcoes.map((f) => [String(f.level), f.id]));
  const grade: TGradeDeGrants = {};
  for (const linha of linhas) {
    const roleId = idPorNivel.get(linha.subjectId);
    if (!roleId) continue;
    (grade[roleId] ??= []).push(linha.permission);
  }
  for (const chaves of Object.values(grade)) chaves.sort();
  return grade;
}

const chaveDaLinha = (linha: TLinhaDeGrant) => `${linha.subjectId}\u0000${linha.permission}`;

/** Linhas que a grade pedida representa, no formato gravado. */
export function buildLinhasDaGrade(grade: TGradeDeGrants, funcoes: readonly TFuncaoDoEspaco[]): TLinhaDeGrant[] {
  const nivelPorId = new Map(funcoes.map((f) => [f.id, String(f.level)]));
  return Object.entries(grade).flatMap(([roleId, permissoes]) => {
    const subjectId = nivelPorId.get(roleId);
    if (!subjectId) return [];
    return permissoes.map((permission) => ({ subjectId, permission }));
  });
}

/** O que gravar e o que apagar para chegar na grade pedida. Repetir dá vazio. */
export function diffLinhasDeGrant(
  atuais: readonly TLinhaDeGrant[],
  desejadas: readonly TLinhaDeGrant[]
): { toAdd: TLinhaDeGrant[]; toRemove: TLinhaDeGrant[] } {
  const chavesAtuais = new Set(atuais.map(chaveDaLinha));
  const chavesDesejadas = new Set(desejadas.map(chaveDaLinha));
  return {
    toAdd: desejadas.filter((linha) => !chavesAtuais.has(chaveDaLinha(linha))),
    toRemove: atuais.filter((linha) => !chavesDesejadas.has(chaveDaLinha(linha))),
  };
}
