/**
 * Em que situação a ligação entra na caixa, conforme o PBX a reportou.
 *
 * Não atendida já nasce encerrada: não há conversa para acompanhar, só o
 * registro de que alguém ligou (e para quem, quando o ramal é conhecido).
 * Atendida fica com quem atendeu o ramal; sem ramal conhecido, espera alguém
 * assumir.
 */

import type { LigacaoStatus } from "@/ligacoes/payload";

export type SituacaoInicial = {
  status: "active" | "queued" | "closed";
  assignedAttendantId: string | null;
  closedAt: Date | null;
};

type SituacaoStrategy = (atendenteId: string | null, fim: Date) => SituacaoInicial;

const SITUACAO_POR_STATUS: Record<LigacaoStatus, SituacaoStrategy> = {
  answered: (atendenteId) => ({
    status: atendenteId ? "active" : "queued",
    assignedAttendantId: atendenteId,
    closedAt: null,
  }),
  missed: (atendenteId, fim) => ({ status: "closed", assignedAttendantId: atendenteId, closedAt: fim }),
};

export const resolveSituacaoInicial = (status: LigacaoStatus, atendenteId: string | null, fim: Date): SituacaoInicial =>
  SITUACAO_POR_STATUS[status](atendenteId, fim);
