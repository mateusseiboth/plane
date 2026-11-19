/**
 * O motivo da recusa da solicitação. O servidor exige o mesmo mínimo
 * (`modules/solicitacao/recusa-da-solicitacao.rules.ts`) e manda o motivo para
 * quem abriu. As regras saem da fábrica comum (`regras-do-motivo`).
 */
import { REGRAS_DA_RECUSA } from "@/components/inbox/modals/regras-do-motivo";

export { MINIMO_DO_MOTIVO } from "@/components/inbox/modals/regras-do-motivo";

export const findPendenciaDoMotivo = REGRAS_DA_RECUSA.findPendencia;

export const readErroDoMotivo = REGRAS_DA_RECUSA.readErro;
