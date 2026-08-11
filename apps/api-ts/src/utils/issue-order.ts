/**
 * Ordenação das listagens de chamados.
 *
 * O front manda `order_by` no vocabulário do Django (`-created_at`,
 * `estimate_point__key`, …) e cada listagem traduzia isso com um mapa próprio,
 * cada um cobrindo um punhado diferente de campos. Resultado: `estimate_point__key`
 * — que os tipos compartilhados já declaravam — não ordenava em lugar nenhum.
 *
 * Mapa único de estratégias: acrescentar uma ordenação é acrescentar uma linha.
 * O que não estiver no mapa cai no padrão de quem chamou, em vez de virar um
 * campo inexistente e derrubar a consulta.
 */

type Direcao = "asc" | "desc";
type Ordenacao = Record<string, unknown>;

/** Cada chave (sem o "-") sabe montar seu `orderBy` a partir da direção. */
const ORDENACOES: Record<string, (dir: Direcao) => Ordenacao> = {
  created_at: (dir) => ({createdAt: dir}),
  updated_at: (dir) => ({updatedAt: dir}),
  completed_at: (dir) => ({completedAt: dir}),
  start_date: (dir) => ({startDate: dir}),
  target_date: (dir) => ({targetDate: dir}),
  priority: (dir) => ({priority: dir}),
  name: (dir) => ({name: dir}),
  sort_order: (dir) => ({sortOrder: dir}),
  sequence_id: (dir) => ({sequenceId: dir}),
  state__name: (dir) => ({state: {name: dir}}),
  // A escala é ordinal: quem ordena por estimativa quer a ordem dos pontos
  // (`key`), não a ordem alfabética do rótulo ("G" antes de "M" antes de "P").
  estimate_point__key: (dir) => ({estimatePoint: {key: dir}}),
};

/**
 * Traduz `order_by` para o `orderBy` do Prisma. `padrao` é usado quando o
 * parâmetro vem vazio ou com um campo que não sabemos ordenar.
 */
export function resolverOrdenacao(orderBy: unknown, padrao: Ordenacao): Ordenacao {
  const bruto = typeof orderBy === "string" ? orderBy.trim() : "";
  if (!bruto) return padrao;
  const dir: Direcao = bruto.startsWith("-") ? "desc" : "asc";
  const montar = ORDENACOES[bruto.replace(/^-/, "")];
  return montar ? montar(dir) : padrao;
}
