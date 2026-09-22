/**
 * Painel do mapa: cada entidade cliente vira um marcador na cidade dela, com o
 * número de chamados abertos em cima.
 *
 * Onde a entidade cai, em ordem:
 *  1. coordenada gravada da entidade legada (`dados/entidades-legado.json`,
 *     extraída uma vez do `servermonitor.psm_adresses` pelo script
 *     `scripts/gerar-coordenadas-das-entidades.ts`);
 *  2. o município de MS cujo nome casa com a cidade da entidade
 *     (`dados/municipios-ms.json`, IBGE).
 * Sem nenhum dos dois, a entidade vai para a lista "Sem localização".
 *
 * Puro: os dados entram por parâmetro.
 */

export type Municipio = { ibge: number; nome: string; uf: string; lat: number; lon: number };
/** Uma linha de `dados/entidades-legado.json`: código do SAC e onde a entidade fica. */
export type EntidadeLegado = {
  sac: number;
  lat: number | null;
  lon: number | null;
  cidade: string;
  uf: string;
  ibge: number | null;
};
/** Chave = id legado da entidade (`entities.legacy_id`). */
export type CoordenadasPorEntidade = Record<string, EntidadeLegado>;

export type EntidadeDoMapa = {
  id: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  legacyId: number | null;
  abertos: number;
  urgentes: number;
};

export type BackupAtrasado = {
  entity_id: string;
  entidade: string;
  sistema: string;
  ultimo_em: string | null;
  dias: number | null;
  gravidade: string;
};

export type Local = {
  lat: number;
  lon: number;
  ibge: number | null;
  cidade: string;
  uf: string;
  fonte: "entidade" | "municipio";
};

const SUFIXO_DE_UF = /[-/\s]+[A-Za-z]{2}\s*$/;

/** "SÃO  Gabriel do Oeste/MS" → "sao gabriel do oeste". */
export function normalizeCidade(valor: string | null | undefined): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['´`.]/g, "")
    .trim()
    .replace(SUFIXO_DE_UF, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

type DadosDoMapa = { municipios: Municipio[]; coordenadas: CoordenadasPorEntidade };

const indexPorNome = (municipios: Municipio[]) =>
  new Map(municipios.map((m) => [`${normalizeCidade(m.nome)}|${m.uf.toLowerCase()}`, m]));

export function resolveLocalDaEntidade(entidade: EntidadeDoMapa, dados: DadosDoMapa): Local | null {
  const gravada = entidade.legacyId === null ? undefined : dados.coordenadas[String(entidade.legacyId)];
  if (gravada && gravada.lat !== null && gravada.lon !== null) {
    return {
      lat: gravada.lat,
      lon: gravada.lon,
      ibge: gravada.ibge,
      cidade: gravada.cidade,
      uf: gravada.uf,
      fonte: "entidade",
    };
  }
  const uf = (entidade.uf ?? "MS").toLowerCase();
  const municipio = indexPorNome(dados.municipios).get(`${normalizeCidade(entidade.cidade)}|${uf}`);
  if (!municipio) return null;
  return {
    lat: municipio.lat,
    lon: municipio.lon,
    ibge: municipio.ibge,
    cidade: municipio.nome,
    uf: municipio.uf,
    fonte: "municipio",
  };
}

/** Como o gateway vê o servidor da entidade; `null` = sem informação. */
export type SituacaoDoServidor = "online" | "offline";

type EntradaDoMapa = DadosDoMapa & {
  entidades: EntidadeDoMapa[];
  backups: BackupAtrasado[];
  /** Só as entidades que o gateway conhece; quem não aparece fica sem informação. */
  servidores?: { entityId: string; online: boolean }[];
};

type EntidadeDoPonto = {
  id: string;
  nome: string;
  abertos: number;
  urgentes: number;
  backup_atrasado: boolean;
  servidor: SituacaoDoServidor | null;
};

const TOP_ENTIDADES = 10;

const somaDe = (valores: number[]) => valores.reduce((total, v) => total + v, 0);

type Situacoes = { comBackupAtrasado: Set<string>; servidorPorEntidade: Map<string, SituacaoDoServidor> };

/** Ponto por cidade (IBGE), com a posição do município quando ele é conhecido. */
function buildPonto(locais: { entidade: EntidadeDoMapa; local: Local }[], situacoes: Situacoes) {
  const primeiro = locais[0]!.local;
  const entidades: EntidadeDoPonto[] = locais.map(({ entidade }) => ({
    id: entidade.id,
    nome: entidade.nome,
    abertos: entidade.abertos,
    urgentes: entidade.urgentes,
    backup_atrasado: situacoes.comBackupAtrasado.has(entidade.id),
    servidor: situacoes.servidorPorEntidade.get(entidade.id) ?? null,
  }));
  return {
    chave: primeiro.ibge === null ? `${primeiro.lat},${primeiro.lon}` : String(primeiro.ibge),
    ibge: primeiro.ibge,
    cidade: primeiro.cidade,
    uf: primeiro.uf,
    lat: primeiro.lat,
    lon: primeiro.lon,
    abertos: somaDe(entidades.map((e) => e.abertos)),
    urgentes: somaDe(entidades.map((e) => e.urgentes)),
    backups_atrasados: entidades.filter((e) => e.backup_atrasado).length,
    servidores_offline: entidades.filter((e) => e.servidor === "offline").length,
    entidades,
  };
}

export function buildMapa({ entidades, municipios, coordenadas, backups, servidores = [] }: EntradaDoMapa) {
  const dados = { municipios, coordenadas };
  const comLocal = entidades.map((entidade) => ({ entidade, local: resolveLocalDaEntidade(entidade, dados) }));
  const situacoes: Situacoes = {
    comBackupAtrasado: new Set(backups.map((b) => b.entity_id)),
    servidorPorEntidade: new Map(servidores.map((s) => [s.entityId, s.online ? "online" : "offline"] as const)),
  };

  const grupos = new Map<string, { entidade: EntidadeDoMapa; local: Local }[]>();
  for (const { entidade, local } of comLocal) {
    if (!local) continue;
    const chave = local.ibge === null ? `${local.lat},${local.lon}` : String(local.ibge);
    grupos.set(chave, [...(grupos.get(chave) ?? []), { entidade, local }]);
  }

  return {
    pontos: [...grupos.values()]
      .map((locais) => buildPonto(locais, situacoes))
      .toSorted((a, b) => b.abertos - a.abertos || a.cidade.localeCompare(b.cidade, "pt-BR")),
    sem_localizacao: comLocal
      .filter((c) => !c.local)
      .map(({ entidade }) => ({
        id: entidade.id,
        nome: entidade.nome,
        cidade: entidade.cidade,
        uf: entidade.uf,
        abertos: entidade.abertos,
        urgentes: entidade.urgentes,
      }))
      .toSorted((a, b) => b.abertos - a.abertos || a.nome.localeCompare(b.nome, "pt-BR")),
    total_abertos: somaDe(entidades.map((e) => e.abertos)),
    total_urgentes: somaDe(entidades.map((e) => e.urgentes)),
    top_entidades: entidades
      .filter((e) => e.abertos > 0)
      .toSorted((a, b) => b.abertos - a.abertos || a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, TOP_ENTIDADES)
      .map((e) => ({ id: e.id, nome: e.nome, cidade: e.cidade, abertos: e.abertos, urgentes: e.urgentes })),
  };
}
