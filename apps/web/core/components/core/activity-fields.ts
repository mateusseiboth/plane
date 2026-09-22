/**
 * Campo da trilha de atividades → a frase que a tela sabe contar.
 *
 * Puro de propósito: o mapa de frases mora em `activity.tsx` (JSX), e testar a
 * regra exigiria carregar meia interface. Aqui fica só a decisão.
 */

/** Campos que a trilha grava com outro nome, mas contam a mesma história. */
const CAMPO_EQUIVALENTE: Record<string, string> = {
  // A API grava o TIPO da estimativa no nome do campo (`estimate_points`,
  // `estimate_categories`): sem esta tradução a linha saía só com o avatar.
  estimate_points: "estimate_point",
  estimate_categories: "estimate_point",
};

/** Linha sem campo é a criação do chamado — é assim que a API grava. */
export function readActivityField(field: string | null | undefined): string {
  const campo = field || "issue";
  return CAMPO_EQUIVALENTE[campo] ?? campo;
}

/**
 * A tela tem frase para este campo? Marcador interno e campo novo não têm, e a
 * linha sairia sem texto nenhum — só o avatar e a hora.
 */
export function hasFraseDoCampo(field: string | null | undefined, camposNarrados: ReadonlySet<string>): boolean {
  return camposNarrados.has(readActivityField(field));
}
