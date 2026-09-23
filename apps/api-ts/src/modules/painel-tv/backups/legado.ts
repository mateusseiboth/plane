/**
 * Regras do relatório de backup do legado (`siteintranet/backup/relatorio_backup.php`),
 * as mesmas que o plugin backup-manager já implementou e testou. Puras: entram
 * as linhas de `backup.envio_autom` em texto, sai o último envio por par.
 *
 * Duas armadilhas que a tabela legada guarda:
 *  - o DATETIME vem sem fuso; o legado grava em `-04:00`, então a leitura tem
 *    de dizer o fuso, e não deixar o driver decidir;
 *  - todo sistema que usa o banco de INTEGRAÇÃO grava um backup só, com o
 *    código 8. Sem isso, dez sistemas apareceriam sem backup.
 */

import type { BackupDaEntidade, EntidadeParaBackup, EnvioDeBackup } from "@modules/painel-tv/backups/fonte";

const SISTEMAS_DO_BANCO_INTEGRACAO = new Set(["8", "9", "10", "11", "12", "13", "15", "18", "21", "22", "23"]);
const SISTEMA_INTEGRACAO = "8";
/** Os sistemas que fazem backup (já normalizados): o resto do legado não conta. */
const SISTEMAS_ACOMPANHADOS = new Set(["1", "3", "4", SISTEMA_INTEGRACAO]);
export const ROTULO_INTEGRACAO = "Integração";

/**
 * Nomes dos sistemas acompanhados, sem depender da tabela `sistemas` da
 * intranet: em produção o banco de backups e a intranet moram em servidores
 * diferentes, e a lista é fechada (1, 3, 4 e o grupo do banco de integração).
 */
export const NOMES_FIXOS_DOS_SISTEMAS: ReadonlyMap<string, string> = new Map([
  ["1", "Contabilidade"],
  ["3", "ARH"],
  ["4", "SIART"],
  [SISTEMA_INTEGRACAO, ROTULO_INTEGRACAO],
]);

/**
 * Sem a intranet, o código que o `envio_autom` usa é o `sacCode` gravado na
 * entidade (código do SAC desktop, que a sincronização com a intranet mantém).
 * O `legacyId` é OUTRO número (id da intranet): só 41 das 269 coincidem.
 */
export const buildCodigoPorSac = (entidades: EntidadeParaBackup[]): Map<number, string> =>
  new Map(
    entidades
      .filter(
        (e): e is EntidadeParaBackup & { legacyId: number; sacCode: number } =>
          e.legacyId !== null && e.sacCode !== null
      )
      .map((e) => [e.legacyId, String(e.sacCode)])
  );

const DATA_HORA_LEGADO = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;
const OFFSET = /^([+-])(\d{2}):(\d{2})$/;
const DIA_MS = 86_400_000;

export const normalizeSistemaBackup = (sistema: string): string => {
  const codigo = sistema.trim();
  return SISTEMAS_DO_BANCO_INTEGRACAO.has(codigo) ? SISTEMA_INTEGRACAO : codigo;
};

const parseOffsetMinutos = (tzOffset: string): number => {
  const partes = OFFSET.exec(tzOffset.trim());
  if (!partes) return 0;
  const minutos = Number(partes[2]) * 60 + Number(partes[3]);
  return partes[1] === "-" ? -minutos : minutos;
};

/** DATETIME do MySQL legado (hora local, sem fuso) → ISO em UTC. */
export function parseDataHoraLegado(valor: string, tzOffset: string): string | null {
  const partes = DATA_HORA_LEGADO.exec(valor.trim());
  if (!partes) return null;
  const [ano = 0, mes = 0, dia = 0, hora = 0, minuto = 0, segundo = 0] = partes.slice(1).map(Number);
  if (!ano || !mes || !dia) return null;
  const utc = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo) - parseOffsetMinutos(tzOffset) * 60_000;
  return new Date(utc).toISOString();
}

/** Meia-noite local de (hoje − N dias): backup a partir daí está em dia. */
export function buildStaleSince(agora: Date, dias: number, tzOffset: string): Date {
  const atraso = Math.max(1, Math.floor(dias) || 1);
  const offsetMs = parseOffsetMinutos(tzOffset) * 60_000;
  const local = new Date(agora.getTime() + offsetMs);
  const meiaNoiteLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(meiaNoiteLocal - atraso * DIA_MS - offsetMs);
}

export type EnvioAutom = {
  id: string;
  id_entidade: string;
  id_sistema: string;
  datahora_envio: string;
  /** Só nas consultas do painel de backups; a lateral do mapa não precisa. */
  tamanho_banco?: string | number | null;
  corrompido?: string | number | null;
  envio_ftp?: string | number | null;
  erro_backup?: string | null;
  erro_restore?: string | null;
};

const isMaisRecente = (novo: EnvioAutom, atual: EnvioAutom | undefined) => {
  if (!atual) return true;
  if (novo.datahora_envio !== atual.datahora_envio) return novo.datahora_envio > atual.datahora_envio;
  return Number(novo.id) > Number(atual.id);
};

/** Chave `<entidade>|<sistema já normalizado>` → último envio. */
export function readUltimoEnvioPorPar(envios: EnvioAutom[]): Map<string, EnvioAutom> {
  return envios.reduce((mapa, envio) => {
    const chave = `${envio.id_entidade.trim()}|${normalizeSistemaBackup(envio.id_sistema)}`;
    if (isMaisRecente(envio, mapa.get(chave))) mapa.set(chave, envio);
    return mapa;
  }, new Map<string, EnvioAutom>());
}

const nomeDoSistema = (codigo: string, nomes: ReadonlyMap<string, string>): string => {
  if (codigo === SISTEMA_INTEGRACAO) return ROTULO_INTEGRACAO;
  return nomes.get(codigo) ?? `Sistema ${codigo}`;
};

type EntradaDoLegado = {
  entidades: EntidadeParaBackup[];
  /** Id legado da entidade no Plane (`entidades_id`) → código do SAC desktop. */
  codigoPorLegado: Map<number, string>;
  envios: EnvioAutom[];
  nomes: ReadonlyMap<string, string>;
  staleSince: Date;
  tz: string;
};

/**
 * Entidades atrasadas, como o relatório legado conta: o atraso é da ENTIDADE,
 * não do par entidade × sistema. Basta um dos quatro sistemas ter enviado
 * dentro da janela para ela estar em dia; parada é quem não enviou nada. O que
 * volta é o envio mais recente da entidade, com o sistema dele. Quem nunca
 * enviou nos quatro sistemas não faz backup e fica de fora. Envio de entidade
 * que não foi migrada é ignorado: a lateral só fala de cliente que existe aqui.
 */
export function buildAtrasadosDoLegado(entrada: EntradaDoLegado): BackupDaEntidade[] {
  const porCodigo = indexEntidadesPorCodigo(entrada.entidades, entrada.codigoPorLegado);
  const ultimos = [...readUltimoEnvioPorPar(entrada.envios).values()].filter((envio) =>
    SISTEMAS_ACOMPANHADOS.has(normalizeSistemaBackup(envio.id_sistema))
  );
  const maisRecentePorEntidade = ultimos.reduce((mapa, envio) => {
    const codigo = envio.id_entidade.trim();
    if (isMaisRecente(envio, mapa.get(codigo))) mapa.set(codigo, envio);
    return mapa;
  }, new Map<string, EnvioAutom>());

  return [...maisRecentePorEntidade.entries()].flatMap(([codigo, envio]) => {
    const entidade = porCodigo.get(codigo);
    if (!entidade) return [];
    const ultimoEm = parseDataHoraLegado(envio.datahora_envio, entrada.tz);
    if (ultimoEm && new Date(ultimoEm) >= entrada.staleSince) return [];
    return [
      {
        entityId: entidade.id,
        entidade: entidade.nome,
        sistema: nomeDoSistema(normalizeSistemaBackup(envio.id_sistema), entrada.nomes),
        ultimoEm,
      },
    ];
  });
}

/**
 * Entidade do Plane de cada envio, pelo código do SAC. Envio de entidade que
 * não foi migrada é ignorado: os painéis só falam de cliente que existe aqui.
 */
export function indexEntidadesPorCodigo(
  entidades: EntidadeParaBackup[],
  codigoPorLegado: Map<number, string>
): Map<string, EntidadeParaBackup> {
  return new Map(
    entidades
      .map((e) => [e.legacyId === null ? undefined : codigoPorLegado.get(e.legacyId), e] as const)
      .filter((par): par is readonly [string, EntidadeParaBackup] => par[0] !== undefined)
  );
}

const isSim = (valor: unknown) =>
  String(valor ?? "")
    .trim()
    .toUpperCase() === "S";

/** Os envios recentes com os sinalizadores do relatório legado. */
export function buildEnviosDoLegado(entrada: EntradaDoLegado): EnvioDeBackup[] {
  const porCodigo = indexEntidadesPorCodigo(entrada.entidades, entrada.codigoPorLegado);

  return [...readUltimoEnvioPorPar(entrada.envios).values()].flatMap((envio) => {
    const entidade = porCodigo.get(envio.id_entidade.trim());
    const enviadoEm = parseDataHoraLegado(envio.datahora_envio, entrada.tz);
    if (!entidade || !enviadoEm) return [];
    const sistema = normalizeSistemaBackup(envio.id_sistema);
    return [
      {
        entityId: entidade.id,
        sistema: Number(sistema),
        sistemaNome: nomeDoSistema(sistema, entrada.nomes),
        enviadoEm,
        tamanhoBytes: Number(envio.tamanho_banco ?? 0),
        corrompido: Number(envio.corrompido ?? 0),
        envioFtp: Number(envio.envio_ftp ?? 0) === 1,
        erroBackup: isSim(envio.erro_backup),
        erroRestore: isSim(envio.erro_restore),
      },
    ];
  });
}
