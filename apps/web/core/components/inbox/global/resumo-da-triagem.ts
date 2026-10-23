/**
 * Número ao lado do item Solicitação/Triagem do menu (pedido do cliente,
 * 23/10/2026): quantas solicitações que a própria pessoa abriu já estão
 * resolvidas e ainda não foram marcadas como atendidas. A regra mora no api-ts
 * (`FILTRO_RESOLVIDA_PARA_ATENDER`); aqui só se lê a resposta e se decide
 * quando buscar de novo.
 */
import type { RealtimeEvent } from "@/hooks/use-realtime";

export type TResumoDaTriagem = { resolvidas_para_atender: number };

export const readResolvidasParaAtender = (resumo: TResumoDaTriagem | undefined): number =>
  resumo?.resolvidas_para_atender ?? 0;

// Mexer na solicitação (atender, aceitar) ou no chamado (concluir, reabrir) muda a conta.
const ENTIDADES_DO_RESUMO: ReadonlySet<string> = new Set(["intake", "issue"]);

export const isEventoDoResumoDaTriagem = (evento: Pick<RealtimeEvent, "entity" | "action">): boolean =>
  ENTIDADES_DO_RESUMO.has(evento.entity);
