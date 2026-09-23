/**
 * De onde saem os backups dos painéis (a lateral do mapa e o painel de backups).
 *
 * O painel não conhece o MySQL legado: ele pede à FONTE. Hoje existem duas — a
 * vazia (sem banco configurado, a tela mostra "Sem dados de backup") e a do
 * MySQL legado (`backup.envio_autom`). Uma fonte nova, como o backend do plugin
 * backup-manager, é mais uma entrada na factory.
 */

export type BackupDaEntidade = {
  /** Id da entidade NO PLANE (não o código legado). */
  entityId: string;
  entidade: string;
  sistema: string;
  /** ISO do último backup recebido; `null` quando nunca chegou nenhum. */
  ultimoEm: string | null;
};

/** Um envio, com os sinalizadores que o relatório legado mostra. */
export type EnvioDeBackup = {
  entityId: string;
  /** Código do sistema já normalizado (o grupo de integração vira 8). */
  sistema: number;
  sistemaNome: string;
  enviadoEm: string;
  tamanhoBytes: number;
  /** 0 não corrompido, 1 corrompido, 2 não conseguiu enviar para o FTP. */
  corrompido: number;
  envioFtp: boolean;
  erroBackup: boolean;
  erroRestore: boolean;
};

import type { EnvioDetalhado } from "@modules/painel-tv/backups/historico";

/** `sacCode` é o código no SAC desktop: é por ele que o `envio_autom` fala. */
export type EntidadeParaBackup = { id: string; nome: string; legacyId: number | null; sacCode: number | null };

/** O que a gaveta do painel interativo pede: uma entidade, um sistema, N dias. */
export type ConsultaDoHistorico = {
  entidade: EntidadeParaBackup;
  /** Código já normalizado (o grupo da integração é o 8); `null` traz todos. */
  sistema: number | null;
  agora: Date;
  dias: number;
};

export interface FonteDeBackups {
  /** Último backup de cada par entidade × sistema que ficou para trás do corte. */
  findAtrasados(entidades: EntidadeParaBackup[], agora: Date, dias?: number): Promise<BackupDaEntidade[]>;
  /** Envios dos últimos `dias`, um por entidade × sistema, o mais recente. */
  findEnviosRecentes(entidades: EntidadeParaBackup[], agora: Date, dias?: number): Promise<EnvioDeBackup[]>;
  /** Todos os envios de uma entidade no período, inclusive os quebrados. */
  findHistorico(consulta: ConsultaDoHistorico): Promise<EnvioDetalhado[]>;
}

/** Sem banco configurado: nenhuma linha, e a tela diz "Sem dados de backup". */
export const FONTE_VAZIA: FonteDeBackups = {
  findAtrasados: async () => [],
  findEnviosRecentes: async () => [],
  findHistorico: async () => [],
};
