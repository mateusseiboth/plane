/**
 * Histórico de backups de UMA entidade (e, quando pedido, de um sistema só).
 *
 * É o detalhe que o painel interativo abre ao clicar numa célula entidade ×
 * sistema: cada envio com data, tamanho, nome do arquivo, de onde veio e os
 * quatro sinalizadores do relatório legado.
 *
 * Diferença proposital para o painel: aqui o envio QUEBRADO também aparece,
 * marcado. O painel esconde o que tem menos de 100 bytes porque não conta como
 * backup feito; quem está conferindo os envios precisa justamente ver isso.
 *
 * Puro: entram as linhas de `backup.envio_autom` em texto, sai a lista pronta.
 */

import { normalizeSistemaBackup, parseDataHoraLegado, ROTULO_INTEGRACAO } from "@modules/painel-tv/backups/legado";
import { SISTEMAS_DO_PAINEL } from "@modules/painel-tv/backups/painel-de-backups";

const DIAS_PADRAO = 30;
const DIAS_MAXIMO = 180;
/** Menos que isto é banco vazio ou arquivo quebrado (regra do relatório legado). */
const TAMANHO_MINIMO = 100;
/** O legado grava `0` em texto no lugar de vazio; na tela isso não é informação. */
const VAZIO_DO_LEGADO = new Set(["", "0"]);

const SISTEMA_INTEGRACAO = 8;
const CODIGOS_DO_PAINEL = new Set<number>(SISTEMAS_DO_PAINEL);

/** Uma linha de `envio_autom`, com as colunas que só o histórico usa. */
export type LinhaDoHistorico = {
  id: string;
  id_entidade: string;
  id_sistema: string;
  datahora_envio: string;
  tamanho_banco?: string | number | null;
  nome_arquivo?: string | null;
  host?: string | null;
  ip_externo?: string | null;
  versao_backup?: string | null;
  corrompido?: string | number | null;
  envio_ftp?: string | number | null;
  erro_backup?: string | null;
  erro_restore?: string | null;
};

export type EnvioDetalhado = {
  id: string;
  sistema: number;
  sistemaNome: string;
  enviadoEm: string;
  tamanhoBytes: number;
  arquivo: string | null;
  /** O computador que mandou o backup (`host` do legado: nome ou IP e porta). */
  origem: string | null;
  ipExterno: string | null;
  versao: string | null;
  corrompido: number;
  envioFtp: boolean;
  erroBackup: boolean;
  erroRestore: boolean;
  ok: boolean;
};

/** `?dias=` do histórico: inteiro de 1 a 180; qualquer outra coisa vale 30. */
export function readDiasDoHistorico(valor: unknown): number {
  const dias = Number(valor);
  if (!Number.isFinite(dias) || dias < 1) return DIAS_PADRAO;
  return Math.min(Math.floor(dias), DIAS_MAXIMO);
}

/**
 * `?sistema=`: um dos quatro do painel, ou nenhum (a entidade inteira).
 * Devolve `"invalido"` para o que não existe, porque a rota recusa no CAMPO.
 */
export function readSistemaDoHistorico(valor: unknown): number | null | "invalido" {
  if (valor === undefined || valor === null || String(valor).trim() === "") return null;
  const codigo = Number(valor);
  return CODIGOS_DO_PAINEL.has(codigo) ? codigo : "invalido";
}

const texto = (valor: string | null | undefined): string | null => {
  const limpo = String(valor ?? "").trim();
  return VAZIO_DO_LEGADO.has(limpo) ? null : limpo;
};

const isSim = (valor: unknown) =>
  String(valor ?? "")
    .trim()
    .toUpperCase() === "S";

const nomeDoSistema = (codigo: number, nomes: Map<string, string>): string =>
  codigo === SISTEMA_INTEGRACAO ? ROTULO_INTEGRACAO : (nomes.get(String(codigo)) ?? `Sistema ${codigo}`);

type Entrada = {
  linhas: LinhaDoHistorico[];
  nomes: Map<string, string>;
  /**
   * Código já normalizado (o grupo da integração é o 8). `null` traz os QUATRO
   * do painel: o legado guarda envio de outros sistemas, e mostrá-los aqui
   * faria a gaveta contar mais backups do que a grade que a abriu.
   */
  sistema: number | null;
  tz: string;
};

const isDoHistorico = (codigo: number, sistema: number | null) =>
  sistema === null ? CODIGOS_DO_PAINEL.has(codigo) : codigo === sistema;

export function buildHistoricoDoLegado({ linhas, nomes, sistema, tz }: Entrada): EnvioDetalhado[] {
  return linhas
    .flatMap((linha): EnvioDetalhado[] => {
      const codigo = Number(normalizeSistemaBackup(linha.id_sistema));
      if (!isDoHistorico(codigo, sistema)) return [];
      const enviadoEm = parseDataHoraLegado(linha.datahora_envio, tz);
      if (!enviadoEm) return [];

      const tamanhoBytes = Number(linha.tamanho_banco ?? 0);
      const corrompido = Number(linha.corrompido ?? 0);
      const envioFtp = Number(linha.envio_ftp ?? 0) === 1;
      const erroBackup = isSim(linha.erro_backup);
      const erroRestore = isSim(linha.erro_restore);

      return [
        {
          id: String(linha.id),
          sistema: codigo,
          sistemaNome: nomeDoSistema(codigo, nomes),
          enviadoEm,
          tamanhoBytes,
          arquivo: texto(linha.nome_arquivo),
          origem: texto(linha.host),
          ipExterno: texto(linha.ip_externo),
          versao: texto(linha.versao_backup),
          corrompido,
          envioFtp,
          erroBackup,
          erroRestore,
          ok: corrompido === 0 && envioFtp && !erroBackup && !erroRestore && tamanhoBytes > TAMANHO_MINIMO,
        },
      ];
    })
    .toSorted((a, b) => b.enviadoEm.localeCompare(a.enviadoEm) || Number(b.id) - Number(a.id));
}
