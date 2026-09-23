/**
 * Painel do mapa: junta as entidades do espaço, os chamados abertos de cada
 * uma, os backups atrasados e a situação dos servidores, e devolve os pontos
 * que a TV desenha.
 *
 * As fontes de backup e de status de servidor são INJETADAS: sem banco legado
 * nem gateway configurados, elas devolvem lista vazia e o mapa continua de pé.
 */

import { buildBackupsAtrasados } from "@modules/painel-tv/backups/atrasados";
import { FONTE_VAZIA, type EntidadeParaBackup, type FonteDeBackups } from "@modules/painel-tv/backups/fonte";
import { createFonteDeBackups } from "@modules/painel-tv/backups/mysql.fonte";
import { readEntidadesLegado, readMunicipiosDeMs } from "@modules/painel-tv/mapa/dados";
import { buildMapa, type EntidadeDoMapa } from "@modules/painel-tv/mapa/mapa";
import { countChamadosAbertos, countChamadosUrgentes, findEntidadesDoEspaco } from "@modules/painel-tv/mapa/mapa.dao";
import { FONTE_DE_STATUS_VAZIA, type FonteDeStatusDeServidor } from "@modules/painel-tv/servidores/status";
import { createFonteDeStatusDeServidor } from "@modules/painel-tv/servidores/status.gateway";

export type MapaDeps = {
  backups: FonteDeBackups;
  servidores: FonteDeStatusDeServidor;
  now: () => Date;
};

/**
 * As fontes do ambiente, resolvidas uma vez. Cada uma decide sozinha se tem
 * como responder (variável de ambiente configurada) ou se é a vazia.
 */
const padrao: MapaDeps = {
  backups: createFonteDeBackups(),
  servidores: createFonteDeStatusDeServidor(),
  now: () => new Date(),
};

export async function findMapa(workspaceId: string, deps: Partial<MapaDeps> = {}) {
  const { backups = padrao.backups, servidores = padrao.servidores, now = padrao.now } = deps;
  const agora = now();

  const [entidades, abertos, urgentes] = await Promise.all([
    findEntidadesDoEspaco(workspaceId),
    countChamadosAbertos(workspaceId),
    countChamadosUrgentes(workspaceId),
  ]);

  const paraFontes: EntidadeParaBackup[] = entidades.map((e) => ({
    id: e.id,
    nome: e.name,
    legacyId: e.legacyId,
    sacCode: e.sacCode,
  }));
  const [atrasados, status] = await Promise.all([
    backups.findAtrasados(paraFontes, agora),
    servidores.findStatus(paraFontes, agora),
  ]);
  const listaDeBackups = buildBackupsAtrasados(atrasados, { agora });

  const doMapa: EntidadeDoMapa[] = entidades.map((e) => ({
    id: e.id,
    nome: e.name,
    cidade: e.city,
    uf: e.state,
    legacyId: e.legacyId,
    abertos: abertos.get(e.id) ?? 0,
    urgentes: urgentes.get(e.id) ?? 0,
  }));

  const mapa = buildMapa({
    entidades: doMapa,
    municipios: readMunicipiosDeMs(),
    coordenadas: readEntidadesLegado(),
    backups: listaDeBackups.itens,
    servidores: status,
  });

  return {
    gerado_em: agora.toISOString(),
    ...mapa,
    total_entidades: entidades.length,
    servidores_offline: status.filter((s) => !s.online).length,
    backups: listaDeBackups,
  };
}

/** Só para teste: fontes vazias, sem MySQL e sem gateway. */
export const DEPS_SEM_FONTES: Pick<MapaDeps, "backups" | "servidores"> = {
  backups: FONTE_VAZIA,
  servidores: FONTE_DE_STATUS_VAZIA,
};
