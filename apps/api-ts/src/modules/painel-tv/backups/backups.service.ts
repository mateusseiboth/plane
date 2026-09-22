/**
 * Painel de TV dos backups: junta as entidades do espaço (com o código delas no
 * SAC) com o que a fonte de backups sabe, e devolve as duas listas do relatório
 * legado.
 *
 * A fonte é INJETADA: sem `LEGACY_BACKUP_DB_URL`, ela devolve listas vazias e o
 * painel aparece dizendo "Sem dados de backup" em vez de quebrar.
 */

import { FONTE_VAZIA, type EntidadeParaBackup, type FonteDeBackups } from "@modules/painel-tv/backups/fonte";
import { createFonteDeBackups } from "@modules/painel-tv/backups/mysql.fonte";
import { buildPainelDeBackups, type EntidadeDoBackup } from "@modules/painel-tv/backups/painel-de-backups";
import { readEntidadesLegado } from "@modules/painel-tv/mapa/dados";
import { findEntidadesDoEspaco } from "@modules/painel-tv/mapa/mapa.dao";

const DIAS_PADRAO = 1;
const DIAS_MAXIMO = 30;

export type BackupsDeps = { fonte: FonteDeBackups; now: () => Date };

const padrao: BackupsDeps = { fonte: createFonteDeBackups(), now: () => new Date() };

/** `?dias=` do painel: inteiro de 1 a 30; qualquer outra coisa vale o padrão. */
export function readDiasDoPainel(valor: unknown): number {
  const dias = Number(valor);
  if (!Number.isFinite(dias) || dias < 1) return DIAS_PADRAO;
  return Math.min(Math.floor(dias), DIAS_MAXIMO);
}

type Consulta = { uf?: string | null; dias?: number };

export async function findPainelDeBackups(
  workspaceId: string,
  { uf = null, dias = DIAS_PADRAO }: Consulta = {},
  deps: Partial<BackupsDeps> = {}
) {
  const { fonte = padrao.fonte, now = padrao.now } = deps;
  const agora = now();

  const entidades = await findEntidadesDoEspaco(workspaceId);
  const legado = readEntidadesLegado();
  const paraFontes: EntidadeParaBackup[] = entidades.map((e) => ({ id: e.id, nome: e.name, legacyId: e.legacyId }));

  const [atrasados, envios] = await Promise.all([
    fonte.findAtrasados(paraFontes, agora, dias),
    fonte.findEnviosRecentes(paraFontes, agora, dias),
  ]);

  const doPainel: EntidadeDoBackup[] = entidades.map((e) => ({
    id: e.id,
    // O backup fala o código do SAC desktop, não o id legado da intranet.
    codigo: e.legacyId === null ? null : (legado[String(e.legacyId)]?.sac ?? null),
    nome: e.name,
    cidade: e.city,
    uf: e.state,
    expiraEm: null,
  }));

  return {
    gerado_em: agora.toISOString(),
    ...buildPainelDeBackups({ entidades: doPainel, envios, atrasados, agora, dias, uf }),
  };
}

/** Só para teste: fonte vazia, sem MySQL. */
export const DEPS_SEM_FONTE: Pick<BackupsDeps, "fonte"> = { fonte: FONTE_VAZIA };
