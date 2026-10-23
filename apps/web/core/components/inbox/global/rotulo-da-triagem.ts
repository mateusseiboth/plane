/**
 * Nome das solicitações do espaço no menu, no título da página e no breadcrumb.
 * Pedido do cliente (23/10/2026): quem tria (`intake.review`) vê "Triagem"; quem
 * só abre pedidos vê "Solicitação". Devolve a chave de tradução.
 */
type TCan = (action: string) => boolean;

export const ROTULO_DA_TRIAGEM = {
  triagem: "sidebar.global_intake",
  solicitacao: "sidebar.global_intake_requester",
} as const;

export const readRotuloDaTriagem = (can: TCan): string =>
  can("intake.review") ? ROTULO_DA_TRIAGEM.triagem : ROTULO_DA_TRIAGEM.solicitacao;
