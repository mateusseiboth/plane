/**
 * Painel de TV dos backups, no formato do relatório legado
 * (`siteintranet/backup/relatorio_backup.php`): quem está sem backup há mais de
 * N dias e, para quem enviou, cada backup com os sinalizadores de banco, FTP,
 * erro de backup e erro de restauração.
 *
 * Só os quatro sistemas que fazem backup no relatório: Contabilidade (1), ARH
 * (3), SIART (4) e Integração (8) — o grupo do banco de integração já chega
 * normalizado como 8 (`legado.ts`).
 *
 * Puro: entidades, envios e atrasos entram prontos.
 */

import type { BackupDaEntidade, EnvioDeBackup } from "@modules/painel-tv/backups/fonte";

export const SISTEMAS_DO_PAINEL = [1, 3, 4, 8] as const;
const DO_PAINEL = new Set<number>(SISTEMAS_DO_PAINEL);

const DIA_MS = 86_400_000;

export type EntidadeDoBackup = {
  id: string;
  /** Código no SAC desktop; sem ele a entidade não existe para o backup. */
  codigo: number | null;
  nome: string;
  cidade: string | null;
  uf: string | null;
  /** Data de liberação/expiração do SAC; ainda sem fonte aqui (ver .claude/paineis-tv.md). */
  expiraEm: string | null;
};

type Entrada = {
  entidades: EntidadeDoBackup[];
  envios: EnvioDeBackup[];
  atrasados: BackupDaEntidade[];
  agora: Date;
  dias: number;
  uf?: string | null;
};

const UNIDADES: { limite: number; divisor: number; sufixo: string }[] = [
  { limite: 1024, divisor: 1, sufixo: "B" },
  { limite: 1_048_576, divisor: 1024, sufixo: "KB" },
  { limite: 1_073_741_824, divisor: 1_048_576, sufixo: "MB" },
  { limite: Number.MAX_SAFE_INTEGER, divisor: 1_073_741_824, sufixo: "GB" },
];

/** "5 MB", como o relatório legado escreve. */
export function formatTamanho(bytes: number): string {
  const unidade = UNIDADES.find((u) => bytes < u.limite) ?? UNIDADES[UNIDADES.length - 1]!;
  const valor = Math.round((bytes / unidade.divisor) * 100) / 100;
  return `${valor} ${unidade.sufixo}`;
}

const diasDesde = (instante: string | null, agora: Date): number | null =>
  instante === null ? null : Math.max(0, Math.floor((agora.getTime() - new Date(instante).getTime()) / DIA_MS));

/** Verde no legado: banco íntegro, FTP enviado e nenhum erro. */
const isEnvioOk = (envio: EnvioDeBackup) =>
  envio.corrompido === 0 && envio.envioFtp && !envio.erroBackup && !envio.erroRestore;

const serializeEnvio = (envio: EnvioDeBackup) => ({
  sistema: envio.sistema,
  sistema_nome: envio.sistemaNome,
  enviado_em: envio.enviadoEm,
  tamanho_bytes: envio.tamanhoBytes,
  tamanho: formatTamanho(envio.tamanhoBytes),
  corrompido: envio.corrompido,
  envio_ftp: envio.envioFtp,
  erro_backup: envio.erroBackup,
  erro_restore: envio.erroRestore,
  ok: isEnvioOk(envio),
});

const readUf = (entidade: EntidadeDoBackup) => (entidade.uf ?? "").trim().toUpperCase();

export function buildPainelDeBackups({ entidades, envios, atrasados, agora, dias, uf }: Entrada) {
  const doSac = entidades.filter((e) => e.codigo !== null);
  const ufs = [...new Set(doSac.map(readUf).filter(Boolean))].toSorted();
  const filtro = (uf ?? "").trim().toUpperCase();
  const escolhidas = filtro ? doSac.filter((e) => readUf(e) === filtro) : doSac;

  const doPainel = envios.filter((e) => DO_PAINEL.has(e.sistema));
  const porEntidade = new Map<string, EnvioDeBackup[]>();
  for (const envio of doPainel) porEntidade.set(envio.entityId, [...(porEntidade.get(envio.entityId) ?? []), envio]);

  // O "último backup" de quem ficou de fora é o mais recente entre os sistemas.
  const ultimoPorEntidade = new Map<string, string | null>();
  for (const atrasado of atrasados) {
    const atual = ultimoPorEntidade.get(atrasado.entityId) ?? null;
    if (!atual || (atrasado.ultimoEm && atrasado.ultimoEm > atual)) {
      ultimoPorEntidade.set(atrasado.entityId, atrasado.ultimoEm);
    }
  }

  const semBackup = escolhidas
    .filter((entidade) => !porEntidade.has(entidade.id))
    .map((entidade) => {
      const ultimo = ultimoPorEntidade.get(entidade.id) ?? null;
      return {
        id: entidade.id,
        codigo: entidade.codigo,
        nome: entidade.nome,
        cidade: entidade.cidade,
        uf: entidade.uf,
        expira_em: entidade.expiraEm,
        ultimo_em: ultimo,
        dias: diasDesde(ultimo, agora),
      };
    })
    // Quem nunca enviou nada vem primeiro: é o atraso que ninguém sabe medir.
    .toSorted((a, b) => (b.dias ?? Number.MAX_SAFE_INTEGER) - (a.dias ?? Number.MAX_SAFE_INTEGER));

  const enviados = escolhidas
    .filter((entidade) => porEntidade.has(entidade.id))
    .map((entidade) => {
      const backups = (porEntidade.get(entidade.id) ?? [])
        .toSorted((a, b) => a.sistema - b.sistema)
        .map(serializeEnvio);
      return {
        id: entidade.id,
        codigo: entidade.codigo,
        nome: entidade.nome,
        cidade: entidade.cidade,
        uf: entidade.uf,
        expira_em: entidade.expiraEm,
        backups,
        com_problema: backups.filter((b) => !b.ok).length,
      };
    })
    .toSorted((a, b) => b.com_problema - a.com_problema || a.nome.localeCompare(b.nome, "pt-BR"));

  const recebidos = enviados.flatMap((e) => e.backups);

  return {
    uf: filtro || null,
    ufs,
    dias,
    sem_backup: semBackup,
    enviados,
    contadores: {
      entidades_atrasadas: semBackup.length,
      entidades_com_backup: enviados.length,
      backups_recebidos: recebidos.length,
      maior_atraso_dias: semBackup.reduce<number>((maior, e) => Math.max(maior, e.dias ?? 0), 0),
      com_problema: recebidos.filter((b) => !b.ok).length,
    },
  };
}
