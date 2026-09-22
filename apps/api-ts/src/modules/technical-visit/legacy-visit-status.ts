/**
 * Tradução da situação de uma visita do SAC legado (tabela `visita`) para o
 * `VISIT_STATUS` do Plane. Usada pelo importador (`scripts/migrate-sac.ts`) e pelo
 * script de correção (`scripts/fix-legacy-visit-status.ts`).
 *
 * No PHP legado (`sac_visitas.php`, `criaRelatorioVisita.php`,
 * `includes/funcoesAjax.php` case 11) são DUAS colunas:
 *   - `visita_situacao`: 0 = agendada, 1 = concluída;
 *   - `visita_status`:   0 = cancelada (exclusão lógica), 1 = ativa.
 */
import { VISIT_STATUS, type VisitStatus } from "@modules/technical-visit/visit-status";

export interface ILegacyVisitaSituacao {
  visita_situacao: unknown;
  visita_status: unknown;
}

export interface ILegacyVisita extends ILegacyVisitaSituacao {
  visita_id: unknown;
}

export interface IVisitStatusCorrection {
  from: number;
  to: VisitStatus;
  legacyIds: number[];
}

const LEGACY_STATUS_CANCELADA = 0;

const STATUS_POR_SITUACAO: Record<number, VisitStatus> = {
  0: VISIT_STATUS.AGENDADA,
  1: VISIT_STATUS.CONCLUIDA,
};

/** Filtro do SELECT: as ativas e as canceladas. Linhas com status nulo ou fora disso ficam de fora. */
export const LEGACY_VISITA_STATUS_SQL = "v.visita_status IN (0, 1)";

// `Number(null)` é 0: sem esta checagem, status nulo viraria "cancelada".
const toLegacyNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  return Number(value);
};

const isLegacyVisitaCancelada = (visita: ILegacyVisitaSituacao): boolean =>
  toLegacyNumber(visita.visita_status) === LEGACY_STATUS_CANCELADA;

export const mapLegacyVisitStatus = (visita: ILegacyVisitaSituacao): VisitStatus => {
  if (isLegacyVisitaCancelada(visita)) return VISIT_STATUS.CANCELADA;
  return STATUS_POR_SITUACAO[toLegacyNumber(visita.visita_situacao) ?? -1] ?? VISIT_STATUS.AGENDADA;
};

/**
 * O que a primeira versão do importador gravou (`visita_situacao === 1 ? 1 : 0`).
 * A correção só mexe na visita cujo status ainda é este: se alguém já alterou a
 * visita pela tela, ela fica como está.
 */
export const getLegacyImportStatusV1 = (visita: ILegacyVisitaSituacao): number =>
  toLegacyNumber(visita.visita_situacao) === 1 ? 1 : 0;

const buildCorrectionKey = (from: number, to: number): string => `${from}->${to}`;

/** Agrupa as visitas legadas por (status antigo, status certo), só onde os dois diferem. */
export const planVisitStatusCorrections = (visitas: ILegacyVisita[]): IVisitStatusCorrection[] => {
  const grupos = new Map<string, IVisitStatusCorrection>();

  for (const visita of visitas) {
    const legacyId = toLegacyNumber(visita.visita_id);
    if (legacyId === null) continue;

    const from = getLegacyImportStatusV1(visita);
    const to = mapLegacyVisitStatus(visita);
    if (from === to) continue;

    const key = buildCorrectionKey(from, to);
    const grupo = grupos.get(key) ?? { from, to, legacyIds: [] };
    grupo.legacyIds.push(legacyId);
    grupos.set(key, grupo);
  }

  return [...grupos.values()];
};
