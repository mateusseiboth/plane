/**
 * Fonte de backups do MySQL legado (base `backup`, tabela `envio_autom`), a
 * mesma que o relatório da intranet lê. SÓ LEITURA.
 *
 * Ligações, porque nenhuma é óbvia:
 *  - `envio_autom.id_entidade` é o código da entidade no SAC DESKTOP
 *    (`entidades.entidades_sac_desktop_id`), que NÃO é o id legado que o Plane
 *    guarda (`entities.legacy_id` = `entidades.entidades_id`). A tradução sai da
 *    base da intranet, por isso as duas bases aparecem aqui.
 *  - o nome do sistema vem de `sistemas.sistemas_nome` pelo
 *    `sistemas_cod_sac_desktop`; o código 8 é sempre "Integração".
 *
 * Sem `LEGACY_BACKUP_DB_URL` a factory devolve a fonte vazia — as telas mostram
 * "Sem dados de backup" e nada tenta conectar. A senha vive só no ambiente.
 *
 * O MySQL do legado não aceita TLS, por isso `ssl` fica desligado de propósito.
 */

import mysql from "mysql2/promise";
import {
  buildAtrasadosDoLegado,
  buildEnviosDoLegado,
  buildStaleSince,
  type EnvioAutom,
} from "@modules/painel-tv/backups/legado";
import {
  FONTE_VAZIA,
  type BackupDaEntidade,
  type EnvioDeBackup,
  type FonteDeBackups,
} from "@modules/painel-tv/backups/fonte";

/** Fuso em que o legado gravou os DATETIME (Campo Grande, sem horário de verão). */
const TZ_PADRAO = "-04:00";
const DIAS_DE_TOLERANCIA = 1;
const CACHE_MS = 5 * 60_000;
const NOME_DE_BASE = /^[A-Za-z0-9_]+$/;

type Opcoes = {
  url: string;
  /** Base da intranet, onde estão `entidades` e `sistemas`. */
  intranetDb: string;
  tz?: string;
  agora?: () => Date;
};

type Linha = Record<string, string | number | bigint | null>;

const texto = (valor: string | number | bigint | null): string => (valor === null ? "" : String(valor));

const toEnvio = (linha: Linha): EnvioAutom => ({
  id: texto(linha.id),
  id_entidade: texto(linha.id_entidade),
  id_sistema: texto(linha.id_sistema),
  datahora_envio: texto(linha.datahora_envio),
  tamanho_banco: linha.tamanho_banco as number | null,
  corrompido: linha.corrompido as number | null,
  envio_ftp: linha.envio_ftp as number | null,
  erro_backup: linha.erro_backup as string | null,
  erro_restore: linha.erro_restore as string | null,
});

/**
 * Uma leitura do MySQL por chave a cada `CACHE_MS`: os painéis recarregam a
 * cada minuto e a cada mudança de chamado, e backup não muda de minuto em minuto.
 */
function createCache<T>(agora: () => Date) {
  const guardadas = new Map<string, { em: number; dados: Promise<T> }>();
  return (chave: string, carregar: () => Promise<T>): Promise<T> => {
    const instante = agora().getTime();
    const atual = guardadas.get(chave);
    if (atual && instante - atual.em <= CACHE_MS) return atual.dados;
    const dados = carregar();
    guardadas.set(chave, { em: instante, dados });
    return dados;
  };
}

/** `2026-09-21 00:00:00` no fuso do legado, como a coluna está gravada. */
const comoDataDoLegado = (instante: Date, tz: string): string => {
  const offsetMinutos = Number(tz.slice(1, 3)) * 60 + Number(tz.slice(4, 6));
  const sinal = tz.startsWith("-") ? -1 : 1;
  const local = new Date(instante.getTime() + sinal * offsetMinutos * 60_000);
  return local.toISOString().slice(0, 19).replace("T", " ");
};

export function createFonteMysqlDeBackups({
  url,
  intranetDb,
  tz = TZ_PADRAO,
  agora = () => new Date(),
}: Opcoes): FonteDeBackups {
  if (!NOME_DE_BASE.test(intranetDb)) throw new Error(`Base da intranet inválida: ${intranetDb}`);
  const pool = mysql.createPool({ uri: url, connectionLimit: 2, ssl: undefined });
  const cache = createCache<unknown>(agora);

  const consulta = async (sql: string, params: unknown[] = []): Promise<Linha[]> => {
    const [linhas] = await pool.query(sql, params);
    return linhas as Linha[];
  };

  // `tamanho_banco > 100`: o relatório legado descarta envios desse tamanho
  // (banco vazio ou arquivo quebrado) — eles não contam como backup feito. A
  // data sai formatada pelo MySQL para o driver não escolher um fuso por nós.
  const COLUNAS = `e.id, e.id_entidade, e.id_sistema,
             DATE_FORMAT(e.datahora_envio, '%Y-%m-%d %H:%i:%s') AS datahora_envio,
             e.tamanho_banco, e.corrompido, e.envio_ftp, e.erro_backup, e.erro_restore`;

  const lerUltimos = () =>
    cache("ultimos", async () => {
      const linhas = await consulta(`
        SELECT ${COLUNAS}
          FROM envio_autom e
          JOIN (SELECT u.id_entidade, u.id_sistema, MAX(u.datahora_envio) AS ultimo
                  FROM envio_autom u
                 WHERE u.tamanho_banco > 100
                 GROUP BY u.id_entidade, u.id_sistema) m
            ON m.id_entidade = e.id_entidade
           AND m.id_sistema = e.id_sistema
           AND m.ultimo = e.datahora_envio
         WHERE e.tamanho_banco > 100`);
      return linhas.map(toEnvio);
    }) as Promise<EnvioAutom[]>;

  const lerDesde = (desde: string) =>
    cache(`desde:${desde}`, async () => {
      const linhas = await consulta(
        `SELECT ${COLUNAS}
           FROM envio_autom e
          WHERE e.datahora_envio >= ? AND e.tamanho_banco > 100
          ORDER BY e.id DESC`,
        [desde]
      );
      return linhas.map(toEnvio);
    }) as Promise<EnvioAutom[]>;

  const lerCodigoPorLegado = () =>
    cache("codigos", async () => {
      const linhas = await consulta(`
        SELECT entidades_id, entidades_sac_desktop_id
          FROM ${intranetDb}.entidades
         WHERE entidades_sac_desktop_id > 0`);
      return new Map(linhas.map((l) => [Number(l.entidades_id), texto(l.entidades_sac_desktop_id)]));
    }) as Promise<Map<number, string>>;

  const lerNomes = () =>
    cache("nomes", async () => {
      const linhas = await consulta(`
        SELECT sistemas_cod_sac_desktop, sistemas_nome
          FROM ${intranetDb}.sistemas
         WHERE sistemas_cod_sac_desktop > 0 AND categoria = 0`);
      return new Map(linhas.map((l) => [texto(l.sistemas_cod_sac_desktop), texto(l.sistemas_nome)]));
    }) as Promise<Map<string, string>>;

  return {
    async findAtrasados(entidades, instante, dias = DIAS_DE_TOLERANCIA): Promise<BackupDaEntidade[]> {
      const [envios, codigoPorLegado, nomes] = await Promise.all([lerUltimos(), lerCodigoPorLegado(), lerNomes()]);
      return buildAtrasadosDoLegado({
        entidades,
        codigoPorLegado,
        envios,
        nomes,
        staleSince: buildStaleSince(instante, dias, tz),
        tz,
      });
    },

    async findEnviosRecentes(entidades, instante, dias = DIAS_DE_TOLERANCIA): Promise<EnvioDeBackup[]> {
      const staleSince = buildStaleSince(instante, dias, tz);
      const [envios, codigoPorLegado, nomes] = await Promise.all([
        lerDesde(comoDataDoLegado(staleSince, tz)),
        lerCodigoPorLegado(),
        lerNomes(),
      ]);
      return buildEnviosDoLegado({ entidades, codigoPorLegado, envios, nomes, staleSince, tz });
    },
  };
}

/** Backup fora do ar não pode derrubar o painel: a lista volta vazia. */
const semQuebrar = <T>(promessa: Promise<T[]>): Promise<T[]> =>
  promessa.catch((erro) => {
    console.error("[painel-tv] backups do legado indisponíveis:", erro?.message ?? erro);
    return [];
  });

/**
 * Qual fonte vale neste ambiente. Sem `LEGACY_BACKUP_DB_URL`, a vazia; falha de
 * conexão também cai na vazia, porque backup atrasado não pode derrubar o mapa.
 */
export function createFonteDeBackups(env: Record<string, string | undefined> = process.env): FonteDeBackups {
  const url = env.LEGACY_BACKUP_DB_URL?.trim();
  if (!url) return FONTE_VAZIA;
  const intranetDb = env.LEGACY_INTRANET_DB?.trim() || env.MYSQL_DB?.trim() || "quality_site_dev";
  const fonte = createFonteMysqlDeBackups({ url, intranetDb, tz: env.LEGACY_BACKUP_TZ?.trim() || TZ_PADRAO });
  return {
    findAtrasados: (entidades, instante, dias) => semQuebrar(fonte.findAtrasados(entidades, instante, dias)),
    findEnviosRecentes: (entidades, instante, dias) => semQuebrar(fonte.findEnviosRecentes(entidades, instante, dias)),
  };
}
