/**
 * Número ao lado do item Solicitação/Triagem do menu (pedido do cliente,
 * 23/10/2026): quantas solicitações que a própria pessoa abriu já estão
 * resolvidas e ela ainda não viu. A conta mora no api-ts
 * (`FILTRO_RESOLVIDA_NAO_VISTA`); aqui só se lê a resposta, se decide quando
 * buscar de novo e quando a tela marca a solicitação como vista.
 */
import type { RealtimeEvent } from "@/hooks/use-realtime";

export type TResumoDaTriagem = { resolvidas_nao_vistas: number };

export const readResolvidasNaoVistas = (resumo: TResumoDaTriagem | undefined): number =>
  resumo?.resolvidas_nao_vistas ?? 0;

// Mexer na solicitação (atender, aceitar) ou no chamado (concluir, reabrir) muda a conta.
const ENTIDADES_DO_RESUMO: ReadonlySet<string> = new Set(["intake", "issue"]);

export const isEventoDoResumoDaTriagem = (evento: Pick<RealtimeEvent, "entity" | "action">): boolean =>
  ENTIDADES_DO_RESUMO.has(evento.entity);

const ACEITA = 1;
const ATENDIDA = 3;

/** Mesmo corte da aba Concluído (`readSituacao` no api-ts): atendida, ou aceita com o chamado concluído. */
export const isSolicitacaoResolvida = (status: number | undefined, grupoDaEtapa: string | undefined | null): boolean =>
  status === ATENDIDA || (status === ACEITA && grupoDaEtapa === "completed");

type TQuemVe = { autorId: string | null | undefined; userId: string | undefined; isResolvida: boolean };

/** Só quem abriu a solicitação, e só depois de resolvida, marca como vista ao abrir. */
export const isMarcarComoVisto = ({ autorId, userId, isResolvida }: TQuemVe): boolean =>
  isResolvida && !!userId && autorId === userId;
