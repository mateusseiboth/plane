/**
 * Painel de TV dos backups: junta as entidades do espaço (com o código delas no
 * SAC) com o que a fonte de backups sabe, e devolve as duas listas do relatório
 * legado.
 *
 * A fonte é INJETADA: sem `LEGACY_BACKUP_DB_URL`, ela devolve listas vazias e o
 * painel aparece dizendo "Sem dados de backup" em vez de quebrar.
 */

import { FONTE_VAZIA, type EntidadeParaBackup, type FonteDeBackups } from "@modules/painel-tv/backups/fonte";
import { findEntidadeDoEspaco } from "@modules/painel-tv/backups/backups.dao";
import {
  EntidadeDoBackupNaoEncontradaError,
  ValidacaoDoHistoricoError,
} from "@modules/painel-tv/backups/backups.errors";
import { readDiasDoHistorico, readSistemaDoHistorico, type EnvioDetalhado } from "@modules/painel-tv/backups/historico";
import { createFonteDeBackups } from "@modules/painel-tv/backups/mysql.fonte";
import {
  buildPainelDeBackups,
  formatTamanho,
  type EntidadeDoBackup,
} from "@modules/painel-tv/backups/painel-de-backups";
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const serializeEnvioDetalhado = (envio: EnvioDetalhado) => ({
  id: envio.id,
  sistema: envio.sistema,
  sistema_nome: envio.sistemaNome,
  enviado_em: envio.enviadoEm,
  tamanho_bytes: envio.tamanhoBytes,
  tamanho: formatTamanho(envio.tamanhoBytes),
  arquivo: envio.arquivo,
  origem: envio.origem,
  ip_externo: envio.ipExterno,
  versao: envio.versao,
  corrompido: envio.corrompido,
  envio_ftp: envio.envioFtp,
  erro_backup: envio.erroBackup,
  erro_restore: envio.erroRestore,
  ok: envio.ok,
});

/**
 * Histórico de uma entidade (e, se pedido, de um sistema só): o detalhe que a
 * gaveta do painel interativo abre ao clicar numa célula entidade × sistema.
 *
 * Parâmetro recusado volta no CAMPO (`errors: [{ path, message }]`), porque a
 * barra de filtros precisa saber onde marcar o erro.
 */
export async function findHistoricoDeBackups(
  workspaceId: string,
  consulta: { entidade?: unknown; sistema?: unknown; dias?: unknown },
  deps: Partial<BackupsDeps> = {}
) {
  const { fonte = padrao.fonte, now = padrao.now } = deps;
  const entidadeId = String(consulta.entidade ?? "").trim();
  const sistema = readSistemaDoHistorico(consulta.sistema);

  const erros = [
    ...(UUID.test(entidadeId) ? [] : [{ path: "entidade", message: "Informe a entidade do backup." }]),
    ...(sistema === "invalido" ? [{ path: "sistema", message: "Escolha um dos sistemas do painel." }] : []),
  ];
  if (erros.length) throw new ValidacaoDoHistoricoError(erros);

  const entidade = await findEntidadeDoEspaco(workspaceId, entidadeId);
  if (!entidade) throw new EntidadeDoBackupNaoEncontradaError();

  const agora = now();
  const dias = readDiasDoHistorico(consulta.dias);
  const paraFonte: EntidadeParaBackup = { id: entidade.id, nome: entidade.name, legacyId: entidade.legacyId };
  const envios = await fonte.findHistorico({
    entidade: paraFonte,
    sistema: sistema === "invalido" ? null : sistema,
    agora,
    dias,
  });

  const legado = readEntidadesLegado();

  return {
    gerado_em: agora.toISOString(),
    dias,
    sistema: sistema === "invalido" ? null : sistema,
    entidade: {
      id: entidade.id,
      codigo: entidade.legacyId === null ? null : (legado[String(entidade.legacyId)]?.sac ?? null),
      nome: entidade.name,
      cidade: entidade.city,
      uf: entidade.state,
    },
    envios: envios.map(serializeEnvioDetalhado),
    total: envios.length,
  };
}
