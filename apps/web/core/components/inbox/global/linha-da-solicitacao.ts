import { formatNumeroNoSistema } from "@/helpers/numero-no-sistema.helper";

/**
 * O que cada linha da lista global de solicitações mostra: o número (o anual,
 * que o cliente recebe, e o do sistema), a entidade e onde o pedido está
 * (etapa e setor). Antes vinham só a sigla do sistema e o título.
 */

type ItemDaLista = {
  project: { identifier: string; name?: string | null } | null;
  issue: { sequence_id: number; ticket_number?: string | null; state_name?: string | null } | null;
  entity: { name: string } | null;
  setor: string | null;
};

export type LinhaDaSolicitacao = {
  numero: string | null;
  noSistema: string | null;
  entidade: string | null;
  ondeEsta: string | null;
};

export const buildLinhaDaSolicitacao = (item: ItemDaLista): LinhaDaSolicitacao => ({
  numero: item.issue?.ticket_number ?? null,
  noSistema: formatNumeroNoSistema(item.project, item.issue?.sequence_id),
  entidade: item.entity?.name ?? null,
  ondeEsta: [item.issue?.state_name, item.setor].filter(Boolean).join(" · ") || null,
});
