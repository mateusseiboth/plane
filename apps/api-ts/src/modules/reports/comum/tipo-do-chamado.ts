/**
 * Tipo do chamado (Correção, Melhoria, Projeto) lido das etiquetas. No SAC era a
 * coluna `chamados_atividade`; aqui é a etiqueta padrão de mesmo nome
 * (`DEFAULT_LABELS` de @utils/project-defaults). Chamado sem nenhuma delas é "Outros".
 */
export const TIPOS_DE_CHAMADO = ["correcao", "melhoria", "projeto", "outros"] as const;
export type TipoDoChamado = (typeof TIPOS_DE_CHAMADO)[number];

export const ROTULO_DO_TIPO: Record<TipoDoChamado, string> = {
  correcao: "Correção",
  melhoria: "Melhoria",
  projeto: "Projeto",
  outros: "Outros",
};

/** Ordem de desempate quando o chamado tem mais de uma etiqueta de tipo. */
const PRECEDENCIA: readonly TipoDoChamado[] = ["correcao", "melhoria", "projeto"];

export const normalizeTexto = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

export function resolveTipoDoChamado(etiquetas: string[]): TipoDoChamado {
  const normalizadas = new Set(etiquetas.map(normalizeTexto));
  return PRECEDENCIA.find((tipo) => normalizadas.has(tipo)) ?? "outros";
}

export type ContagemPorTipo = Record<TipoDoChamado, number> & { total: number };

export const createContagemPorTipo = (): ContagemPorTipo => ({
  correcao: 0,
  melhoria: 0,
  projeto: 0,
  outros: 0,
  total: 0,
});

export function addAoTipo(contagem: ContagemPorTipo, tipo: TipoDoChamado): void {
  contagem[tipo]++;
  contagem.total++;
}
