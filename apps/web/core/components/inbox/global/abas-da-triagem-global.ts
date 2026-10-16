/**
 * Abas das Solicitações globais e a situação de cada solicitação da lista.
 *
 * A chave de cada aba é o valor que vai no filtro `status` do
 * `GET /workspaces/:slug/global-intake-issues/`: o número do status ou
 * `concluido` (solicitação cujo chamado já terminou; ver
 * `apps/api-ts/src/utils/situacao-da-solicitacao.ts`). A API devolve a mesma
 * chave em `situacao` em cada item.
 */

export type AbaDaTriagemGlobal = { chave: string; rotulo: string; cor: string };

export const ABAS_DA_TRIAGEM_GLOBAL: readonly AbaDaTriagemGlobal[] = [
  { chave: "-2", rotulo: "Pendente", cor: "bg-yellow-100 text-yellow-800" },
  { chave: "-1", rotulo: "Recusado", cor: "bg-red-100 text-red-800" },
  { chave: "0", rotulo: "Adiado", cor: "bg-gray-100 text-gray-700" },
  { chave: "1", rotulo: "Aceito", cor: "bg-green-100 text-green-800" },
  { chave: "concluido", rotulo: "Concluído", cor: "bg-emerald-100 text-emerald-800" },
  { chave: "2", rotulo: "Duplicado", cor: "bg-blue-100 text-blue-800" },
];

/**
 * A aba que abre com a tela. Pedido do dono do produto (16/10/2026): abrir em
 * Concluído. Para voltar a abrir em Pendente, troque aqui por "-2".
 */
export const ABA_PADRAO_DA_TRIAGEM_GLOBAL = "concluido";

const ABA_POR_CHAVE = new Map(ABAS_DA_TRIAGEM_GLOBAL.map((aba) => [aba.chave, aba]));

export const readAba = (chave: string): AbaDaTriagemGlobal | undefined => ABA_POR_CHAVE.get(chave);

/** A aba de uma solicitação da lista: pela `situacao` da API e, sem ela, pelo status. */
export const readAbaDaSolicitacao = (item: { situacao?: string; status: number }): AbaDaTriagemGlobal | undefined =>
  readAba(item.situacao ?? String(item.status));
