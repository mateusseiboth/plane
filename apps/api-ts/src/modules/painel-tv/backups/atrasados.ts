/**
 * Lista "Backup atrasado" da lateral do painel do mapa: quantos dias faz que o
 * último backup chegou, a gravidade do atraso e o corte da lista.
 *
 * Quem diz QUEM está atrasado é a fonte de backups (`fonte.ts`); aqui só se
 * ordena, classifica e corta. Puro.
 */

import type { BackupDaEntidade } from "@modules/painel-tv/backups/fonte";

export const GRAVIDADES = ["atencao", "alerta", "critico"] as const;
export type GravidadeDoAtraso = (typeof GRAVIDADES)[number];

const DIA_MS = 86_400_000;
const LIMITE_PADRAO = 15;

/** Faixas do atraso, da mais branda para a mais grave. */
const FAIXAS: { ate: number; gravidade: GravidadeDoAtraso }[] = [
  { ate: 3, gravidade: "atencao" },
  { ate: 7, gravidade: "alerta" },
];

/** Sem data de envio o atraso é desconhecido, e desconhecido é o pior caso. */
export const readGravidade = (dias: number | null): GravidadeDoAtraso =>
  dias === null ? "critico" : (FAIXAS.find((f) => dias <= f.ate)?.gravidade ?? "critico");

const readDias = (ultimoEm: string | null, agora: Date): number | null =>
  ultimoEm === null ? null : Math.max(0, Math.floor((agora.getTime() - new Date(ultimoEm).getTime()) / DIA_MS));

export type ItemDoBackup = {
  entity_id: string;
  entidade: string;
  sistema: string;
  ultimo_em: string | null;
  dias: number | null;
  gravidade: GravidadeDoAtraso;
};

type Opcoes = { agora: Date; limite?: number };

/** Do mais atrasado para o menos; `total` conta a lista inteira, não a fatia. */
export function buildBackupsAtrasados(
  atrasados: BackupDaEntidade[],
  { agora, limite = LIMITE_PADRAO }: Opcoes
): { total: number; itens: ItemDoBackup[] } {
  const itens = atrasados
    .map((b): ItemDoBackup => {
      const dias = readDias(b.ultimoEm, agora);
      return {
        entity_id: b.entityId,
        entidade: b.entidade,
        sistema: b.sistema,
        ultimo_em: b.ultimoEm,
        dias,
        gravidade: readGravidade(dias),
      };
    })
    .toSorted((a, b) => (b.dias ?? Number.MAX_SAFE_INTEGER) - (a.dias ?? Number.MAX_SAFE_INTEGER));

  return { total: itens.length, itens: itens.slice(0, limite) };
}
