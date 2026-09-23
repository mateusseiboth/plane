/**
 * Regras puras do painel da página inicial: janela da série, dias sem
 * movimento, mês corrente, ranking de encerrados e o tipo de cada evento da
 * atividade. Nada aqui toca o banco (ver `painel.dao.ts`).
 *
 * O DIA é o do escritório (@utils/prazo), não o do processo: a API roda em UTC
 * e um chamado aberto às 22h ainda é do dia que termina para quem o abriu.
 */
import { dataLocal, inicioDeHoje, inicioDoDia } from "@utils/prazo";

/** Quantos dias cada período da série cobre, terminando hoje. */
export const PERIODOS_DA_SERIE = { semana: 7, mes: 30, trimestre: 90 } as const;

export type PeriodoDaSerie = keyof typeof PERIODOS_DA_SERIE;

export const isPeriodoDaSerie = (valor: unknown): valor is PeriodoDaSerie =>
  typeof valor === "string" && Object.hasOwn(PERIODOS_DA_SERIE, valor);

/** O período pedido na query; qualquer outra coisa vira a semana. */
export const readPeriodoDaSerie = (valor: unknown): PeriodoDaSerie => (isPeriodoDaSerie(valor) ? valor : "semana");

export type Janela = { inicio: Date; fim: Date };

export type JanelaDaSerie = Janela & { dias: string[] };

/** Os N dias que terminam hoje: da meia-noite do primeiro até agora. */
export function resolveJanelaDaSerie(periodo: PeriodoDaSerie, agora: Date): JanelaDaSerie {
  const quantos = PERIODOS_DA_SERIE[periodo];
  const dias = Array.from({ length: quantos }, (_, i) => dataLocal(inicioDeHoje(i - (quantos - 1), agora)));
  return { inicio: inicioDeHoje(1 - quantos, agora), fim: agora, dias };
}

/** Do dia 1 do mês do escritório até agora. */
export function resolveMesCorrente(agora: Date): Janela {
  const [ano, mes] = dataLocal(agora).split("-").map(Number);
  return { inicio: inicioDoDia(ano!, mes!, 1), fim: agora };
}

export type ContagemPorDia = { dia: string; total: number };

export type PontoDaSerie = { data: string; abertos: number; encerrados: number };

const indexByDia = (linhas: ContagemPorDia[]) => new Map(linhas.map((l) => [l.dia, l.total]));

/** Um ponto por dia da janela; dia sem movimento sai com zero, dia de fora some. */
export function fillSerie(dias: string[], abertos: ContagemPorDia[], encerrados: ContagemPorDia[]): PontoDaSerie[] {
  const porDiaAbertos = indexByDia(abertos);
  const porDiaEncerrados = indexByDia(encerrados);
  return dias.map((data) => ({
    data,
    abertos: porDiaAbertos.get(data) ?? 0,
    encerrados: porDiaEncerrados.get(data) ?? 0,
  }));
}

export type ContagemPorPessoa = { pessoaId: string; total: number };

export type PosicaoNoRanking = { posicao: number | null; total_pessoas: number };

/**
 * Posição de quem pergunta entre as pessoas que encerraram algo no mês.
 * Empate divide a posição (1, 2, 2, 4); quem não encerrou nada fica sem posição.
 */
export function rankPosicao(contagens: ContagemPorPessoa[], pessoaId: string): PosicaoNoRanking {
  const comEncerrados = contagens.filter((c) => c.total > 0);
  const minha = comEncerrados.find((c) => c.pessoaId === pessoaId);
  const total_pessoas = comEncerrados.length;
  if (!minha) return { posicao: null, total_pessoas };
  return { posicao: 1 + comEncerrados.filter((c) => c.total > minha.total).length, total_pessoas };
}

export const TIPOS_DE_EVENTO = ["abertura", "etapa", "conclusao", "comentario", "solicitacao_atendida"] as const;

export type TipoDeEvento = (typeof TIPOS_DE_EVENTO)[number];

type LinhaDaTrilha = { field: string | null; verb: string };

/** Por campo da trilha: o que ele vira no painel. O grupo decide se a etapa é a conclusão. */
const TIPO_POR_CAMPO: Record<string, (linha: LinhaDaTrilha, grupoDaEtapa: string | null) => TipoDeEvento | null> = {
  issue: (linha) => (linha.verb === "created" ? "abertura" : null),
  state: (_, grupo) => (grupo === "completed" ? "conclusao" : "etapa"),
  solicitacao_atendida: () => "solicitacao_atendida",
};

/** Campos da trilha que o painel lê; o resto (prioridade, etiquetas...) fica no chamado. */
export const CAMPOS_DA_ATIVIDADE = Object.keys(TIPO_POR_CAMPO);

export function classifyAtividade(linha: LinhaDaTrilha, grupoDaEtapa: string | null): TipoDeEvento | null {
  const strategy = linha.field && Object.hasOwn(TIPO_POR_CAMPO, linha.field) ? TIPO_POR_CAMPO[linha.field] : undefined;
  return strategy?.(linha, grupoDaEtapa) ?? null;
}

/** Junta as fontes (trilha e comentários) do mais novo para o mais antigo. */
export function mergeEventos<T extends { criado_em: string }>(fontes: T[][], limite: number): T[] {
  return fontes
    .flat()
    .toSorted((a, b) => b.criado_em.localeCompare(a.criado_em))
    .slice(0, limite);
}
