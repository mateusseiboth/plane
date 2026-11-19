/**
 * O número do chamado no sistema SEMPRE com o nome do sistema
 * ("Recursos Humanos · RECUR1-7"). A sigla é gerada na importação a partir do
 * nome (RECUR1, LICITA2) e sozinha não diz em que sistema o chamado está.
 */
type Sistema = { name?: string | null; identifier?: string | null };

const buildNumero = (sistema: Sistema, numero: number | string): string | null =>
  typeof numero === "string" ? numero : sistema.identifier ? `${sistema.identifier}-${numero}` : null;

export const formatNumeroNoSistema = (
  sistema: Sistema | null | undefined,
  numero: number | string | null | undefined
): string | null => {
  if (!sistema || numero === null || numero === undefined) return null;
  const noSistema = buildNumero(sistema, numero);
  if (!noSistema) return null;
  return sistema.name ? `${sistema.name} · ${noSistema}` : noSistema;
};
