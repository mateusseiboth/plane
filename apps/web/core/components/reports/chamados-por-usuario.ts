/**
 * Regras da tela "Chamados por usuário" (relatório milestones-by-user).
 *
 * A API devolve, por pessoa, os totais e só uma AMOSTRA dos chamados mais
 * recentes: em produção são dezenas de milhares de chamados, e montar tudo de
 * uma vez travava o navegador. A lista completa de uma pessoa vem paginada por
 * `milestones-by-user/:userId/`. Aqui ficam só as contas e os rótulos; puro.
 */

/** Mesmo padrão da API (`per_page`). */
export const TAMANHO_DA_PAGINA = 50;

export type TUsuarioDoAnalitico = {
  user_id?: string;
  name?: string;
  total?: number;
  chamados_total?: number;
  abertos?: number;
  encerrados?: number;
  chamados: unknown[];
};

/** Quantos chamados a pessoa tem no filtro, mesmo que a amostra traga menos. */
export const readTotalDoUsuario = (u: TUsuarioDoAnalitico) => u.chamados_total ?? u.total ?? u.chamados.length;

/** Ficou chamado fora da amostra? Só então vale oferecer a lista completa. */
export const isAmostraParcial = (u: TUsuarioDoAnalitico) => readTotalDoUsuario(u) > u.chamados.length;

export const buildRotuloVerTodos = (u: TUsuarioDoAnalitico) => `Ver todos os ${readTotalDoUsuario(u)} chamados`;

export const buildRotuloDaAmostra = (u: TUsuarioDoAnalitico) =>
  `Mostrando os ${u.chamados.length} chamados mais recentes de ${readTotalDoUsuario(u)}.`;

export function buildResumoDoUsuario(u: TUsuarioDoAnalitico) {
  const total = `${readTotalDoUsuario(u)} chamado(s)`;
  if (u.abertos === undefined || u.encerrados === undefined) return total;
  return `${total} · ${u.abertos} em aberto · ${u.encerrados} encerrado(s)`;
}

export type TPaginacao = {
  pagina: number;
  totalPaginas: number;
  temAnterior: boolean;
  temProxima: boolean;
  rotulo: string;
};

export function buildPaginacao(total: number, pagina: number, porPagina = TAMANHO_DA_PAGINA): TPaginacao {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  return {
    pagina,
    totalPaginas,
    temAnterior: pagina > 1,
    temProxima: pagina < totalPaginas,
    rotulo: `Página ${pagina} de ${totalPaginas}`,
  };
}
