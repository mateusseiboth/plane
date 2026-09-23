/**
 * Situação da entidade na intranet legada (`quality_site.entidades`).
 *
 * A intranet guarda dois campos: `entidades_status` (1 ativa, 0 excluída) e
 * `entidades_situacao` ("descongelado" é cliente em dia; "congelado" deixou de
 * ser cliente). Todas as telas do legado que listam clientes filtram por
 * `entidades_situacao = 'descongelado'`, então é essa a regra de "ainda é
 * cliente" que o Plane espelha em `is_active` e `frozen_at`.
 */

export type SituacaoNaIntranet = { situacao: string | null; status: number | null };
export type SituacaoNoPlane = { isActive: boolean; congelada: boolean };

const DESCONGELADO = "descongelado";

export function readSituacaoDaEntidade({ situacao, status }: SituacaoNaIntranet): SituacaoNoPlane {
  const congelada = (situacao ?? "").trim().toLowerCase() !== DESCONGELADO;
  return { isActive: !congelada && status === 1, congelada };
}

/** Motivo gravado em `frozen_reason` por quem sincroniza; é por ele que o descongelamento automático reconhece o que foi dele. */
export const MOTIVO_DA_SINCRONIZACAO = "Congelada na intranet legada";
